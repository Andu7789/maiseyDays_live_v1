import React, { useEffect, useMemo, useRef, useState } from "react";
import { addBookingPhoto, BookingPhoto, buildCancellationMessage, buildConfirmationMessage, buildRebookNudgeMessage, checkAuthStatus, confirmAppointmentBooking, createManualAppointment, deleteAppointment, deleteBookingPhoto, exportAppointmentsToExcel, findBookingClash, getAppointments, getAvailableSlotTimes, getBookingPhotos, getBookingRevenue, getCurrentUser, getEffectiveSchedule, getReminderSettings, getServiceBasePrice, getUnavailableDays, getUnavailableWeekdays, removeUnavailableDay, removeUnavailableWeekday, saveUnavailableDay, saveUnavailableWeekday, sendCustomEmail, sendCustomerCancellationSms, sendCustomerConfirmationSms, signInAdmin, signOutAdmin, updateAppointment, updateReminderSettings, getHolidaySettings, updateHolidaySettings, updateAdvertSettings, updateWeekendBookingsEnabled, getDogNotes, getAllDogNotes, upsertDogNote } from "../services/bookingService";
import { buildIntakeLink, buildIntakeMessage, buildWhatsAppLink, createCustomer, deleteCustomer, deleteDog, ensureIntakeToken, getCustomers, getDeletedCustomers, markIntakeSent, restoreCustomer, saveDog, sendIntakeEmail, sendIntakeSms, updateCustomer } from "../services/customerService";
import { Appointment, Customer, Dog, IntakeStatus, Service } from "../types";
import { INTAKE_TERMS, LOCATIONS, MATTING_BULLETS, MATTING_CLOSING, MATTING_TERMS, SERVICES, SLOT_TIMES } from "../constants";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ALL_LOCATIONS = "__all__";
const EMAIL_CUSTOMER_REPLY_TO = "hello@dirtydawggrooming.co.uk";

const getMonday = (source: Date) => {
  const copy = new Date(source);
  copy.setDate(copy.getDate() + (copy.getDay() === 0 ? -6 : 1 - copy.getDay()));
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const toDateString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Compact Yes/No toggle for the agreement editor (third click state = unanswered stays as-is)
const TriYesNo: React.FC<{ label: string; value: boolean | null | undefined; onChange: (v: boolean) => void }> = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <span className="text-xs font-bold text-slate-600">{label}</span>
    <div className="flex gap-1 shrink-0">
      <button type="button" onClick={() => onChange(true)} className={`px-3 py-1 rounded-lg text-xs font-bold ${value === true ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
        Yes
      </button>
      <button type="button" onClick={() => onChange(false)} className={`px-3 py-1 rounded-lg text-xs font-bold ${value === false ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
        No
      </button>
    </div>
  </div>
);

const AdminDashboard: React.FC = () => {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [view, setView] = useState<"dashboard" | "bookings" | "diary" | "unavailable" | "services" | "settings" | "customers">("dashboard");
  const [selectedLocation, setSelectedLocation] = useState(ALL_LOCATIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [unavailableDays, setUnavailableDays] = useState<string[]>([]);
  const [unavailableWeekdays, setUnavailableWeekdays] = useState<number[]>([]);
  const [services, setServices] = useState<Service[]>(SERVICES);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [newService, setNewService] = useState<Partial<Service>>({});

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFormAvailableSlots, setAddFormAvailableSlots] = useState<string[]>(SLOT_TIMES);
  const [activeBooking, setActiveBooking] = useState<Appointment | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [completingBooking, setCompletingBooking] = useState<Appointment | null>(null);
  const [completePriceInput, setCompletePriceInput] = useState<string>("");
  const [priceFixDrafts, setPriceFixDrafts] = useState<Record<string, string>>({});
  const [priceFixSaving, setPriceFixSaving] = useState<Record<string, boolean>>({});
  const [revenueHoverIndex, setRevenueHoverIndex] = useState<number | null>(null);
  const [nudgeSaving, setNudgeSaving] = useState<Record<string, boolean>>({});
  const [activeBookingPhotos, setActiveBookingPhotos] = useState<BookingPhoto[]>([]);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [newPhotoType, setNewPhotoType] = useState<"before" | "after" | "other">("before");
  const nudgePanelRef = useRef<HTMLDivElement>(null);
  const [pendingConfirmChannel, setPendingConfirmChannel] = useState<"sms" | "whatsapp" | "none">("sms");
  const [diaryWeekStart, setDiaryWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [diarySearch, setDiarySearch] = useState("");
  const [showDiarySlotModal, setShowDiarySlotModal] = useState(false);
  const [diarySlotDate, setDiarySlotDate] = useState("");
  const [diarySlotTime, setDiarySlotTime] = useState("");
  const [diarySlotDuration, setDiarySlotDuration] = useState(120);
  const [diarySlotCustomerSearch, setDiarySlotCustomerSearch] = useState("");
  const [diarySlotSelectedCustomer, setDiarySlotSelectedCustomer] = useState<Customer | null>(null);
  const [diarySlotForm, setDiarySlotForm] = useState({
    ownername: "",
    email: "",
    phone: "",
    dogname: "",
    dogbreed: "",
    serviceid: SERVICES[0].id,
    locationid: LOCATIONS[0].id,
    notes: "",
    number_of_dogs: 1,
    deposit_paid: false,
    deposit_amount: 20,
    deposit_notes: "",
    confirm_channel: "whatsapp" as "none" | "whatsapp" | "sms",
  });

  const [reminderSettings, setReminderSettings] = useState({
    enabled_28day: true,
    days_interval: 28,
    reminder_email: "",
    enabled_next_day: true,
    next_day_time: "17:00",
    split_by_location: true,
  });

  const [holidayForm, setHolidayForm] = useState({ holiday_start: "", holiday_end: "" });
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayStatus, setHolidayStatus] = useState<"idle" | "saved" | "error">("idle");

  const [advertForm, setAdvertForm] = useState({ advert_start: "", advert_end: "", advert_text: "", advert_color: "#EAB308" });
  const [weekendsEnabled, setWeekendsEnabled] = useState(true);
  const [weekendsSaving, setWeekendsSaving] = useState(false);
  const [advertSaving, setAdvertSaving] = useState(false);
  const [advertStatus, setAdvertStatus] = useState<"idle" | "saved" | "error">("idle");
  const [advertError, setAdvertError] = useState<string>("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [intakeFilter, setIntakeFilter] = useState<"all" | IntakeStatus>("all");
  const [showOnlyMattingDue, setShowOnlyMattingDue] = useState(false);
  const [showOnlyDepositOwed, setShowOnlyDepositOwed] = useState(false);
  type BookingStatusFilter = "all" | "pending" | "confirmed" | "completed" | "due_for_rebook" | "cancelled" | "deposit_unpaid" | "needs_time";
  const [bookingsStatusFilter, setBookingsStatusFilter] = useState<BookingStatusFilter>("all");
  const [legacyTimeDrafts, setLegacyTimeDrafts] = useState<Record<string, { date: string; time: string }>>({});
  const [legacyTimeSaving, setLegacyTimeSaving] = useState<Record<string, boolean>>({});
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [addCustomerForm, setAddCustomerForm] = useState({ ownername: "", email: "", phone: "" });
  const [sendingIntake, setSendingIntake] = useState<string | null>(null);
  const [showAgreementDetails, setShowAgreementDetails] = useState(false);
  const [editingCustomerInfo, setEditingCustomerInfo] = useState(false);
  const [customerInfoForm, setCustomerInfoForm] = useState({ ownername: "", email: "", phone: "", address: "" });
  const [rebookSelectedDogs, setRebookSelectedDogs] = useState<Set<string>>(new Set());
  const [showDeletedCustomersModal, setShowDeletedCustomersModal] = useState(false);
  const [deletedCustomersList, setDeletedCustomersList] = useState<Customer[]>([]);
  const [loadingDeletedCustomers, setLoadingDeletedCustomers] = useState(false);
  const [showAgreementEditor, setShowAgreementEditor] = useState(false);
  const [agreementForm, setAgreementForm] = useState({
    hear_about_us: "",
    sms_ok: null as boolean | null,
    alt_contact_name: "",
    alt_contact_phone: "",
    vet_name: "",
    emergency_vet_name: "",
    emergency_vet_phone: "",
    emergency_vet_address: "",
    treats_ok: null as boolean | null,
    photo_consent: null as boolean | null,
    paper_signed: false,
    paper_date: new Date().toISOString().split("T")[0],
    matting_required: false,
    matting_paper_signed: false,
    matting_paper_date: new Date().toISOString().split("T")[0],
  });
  const [agreementDogs, setAgreementDogs] = useState<Dog[]>([]);
  const [agreementDogsToDelete, setAgreementDogsToDelete] = useState<string[]>([]);
  const [allDogNotes, setAllDogNotes] = useState<Record<string, Record<string, string>>>({});
  const [dogNotes, setDogNotes] = useState<Record<string, string>>({});
  const [dogNotesDraft, setDogNotesDraft] = useState<Record<string, string>>({});
  const [dogNotesSaving, setDogNotesSaving] = useState<Record<string, boolean>>({});
  const [dogNotesSaved, setDogNotesSaved] = useState<Record<string, boolean>>({});

  const [editForm, setEditForm] = useState({
    ownername: "",
    email: "",
    phone: "",
    dogname: "",
    dogbreed: "",
    serviceid: SERVICES[0].id,
    requested_time_preference: "",
    confirmed_date: "",
    confirmed_time: "",
    confirmed_duration_minutes: 120,
    notes: "",
    number_of_dogs: 1,
    deposit_paid: false,
    deposit_amount: 20,
    deposit_notes: "",
    deposit_paid_at: null as string | null,
    actual_price: "" as string | number,
    estimated_price: "" as string | number,
  });

  const [addForm, setAddForm] = useState({
    ownername: "",
    email: "",
    phone: "",
    dogname: "",
    dogbreed: "",
    serviceid: SERVICES[0].id,
    locationid: LOCATIONS[0].id,
    date: new Date().toISOString().split("T")[0],
    confirmed_time: "",
    confirmed_duration_minutes: 120,
    notes: "",
    number_of_dogs: 1,
    deposit_paid: false,
    deposit_amount: 20,
    deposit_notes: "",
    confirm_channel: "whatsapp" as "none" | "whatsapp" | "sms",
  });

  // Pagination and sorting state
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  type BookingSortColumn = "date" | "owner" | "deposit" | "status";
  const [sortColumn, setSortColumn] = useState<BookingSortColumn>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [bookingsSearch, setBookingsSearch] = useState("");

  const toggleBookingSort = (column: BookingSortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      // Sensible default direction per column: latest date / paid deposits / owner A-Z first
      setSortDirection(column === "owner" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  const sortIndicator = (column: BookingSortColumn) => (sortColumn === column ? (sortDirection === "asc" ? " ▲" : " ▼") : "");

  // Booking status ordering used when sorting by status (pending -> confirmed -> completed -> due -> cancelled)
  const STATUS_SORT_ORDER: Record<string, number> = { pending: 0, confirmed: 1, completed: 2, due_for_rebook: 3, cancelled: 4 };

  // Single source of truth for "due a rebook nudge": computed live (not the once-a-day
  // automated flag, which only catches a booking on the exact day it turns N days old)
  // so the Dashboard panel and the Bookings tab filter always agree.
  const isDueForNudge = (apt: Appointment): boolean => {
    if (apt.booking_status !== "completed" || !apt.completed_at) return false;
    if (apt.rebook_contacted_at || apt.rebook_closed_at) return false;
    const intervalDays = reminderSettings.days_interval || 28;
    const daysSince = (Date.now() - new Date(apt.completed_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < intervalDays) return false;
    return !appointments.some((b) => {
      if (b.id === apt.id || b.dogname !== apt.dogname) return false;
      if (b.status === "cancelled" || b.booking_status === "cancelled") return false;
      const sameCustomer = (apt.customer_id && b.customer_id && apt.customer_id === b.customer_id) || (apt.email && b.email && apt.email.toLowerCase() === b.email.toLowerCase());
      if (!sameCustomer) return false;
      const bSchedule = getEffectiveSchedule(b);
      return Boolean(bSchedule && bSchedule.date > apt.completed_at!.slice(0, 10));
    });
  };

  // For the Add Booking form: how many weeks ago was this contact's most recent
  // past booking (matched by email or phone), so the admin can spot a lapsed
  // customer at a glance. Returns null if no prior booking is found.
  const getLastBookingWeeksAgo = (email: string, phone: string): number | null => {
    const normEmail = email.trim().toLowerCase();
    const normPhone = phone.replace(/\D/g, "");
    if (!normEmail && !normPhone) return null;
    const todayStr = new Date().toISOString().split("T")[0];
    const pastDates = appointments
      .filter((a) => (normEmail && a.email && a.email.toLowerCase() === normEmail) || (normPhone && a.phone && a.phone.replace(/\D/g, "") === normPhone))
      .map((a) => getEffectiveSchedule(a))
      .filter((s): s is NonNullable<typeof s> => Boolean(s) && s!.date < todayStr)
      .map((s) => s!.date)
      .sort()
      .reverse();
    if (pastDates.length === 0) return null;
    return Math.floor((Date.now() - new Date(pastDates[0]).getTime()) / (1000 * 60 * 60 * 24 * 7));
  };

  // Filter, sort, and paginate appointments
  const filteredAppointments = useMemo(() => {
    const search = bookingsSearch.trim().toLowerCase();
    let filtered = appointments.filter((a) => selectedLocation === ALL_LOCATIONS || a.locationid === selectedLocation);
    if (bookingsStatusFilter === "deposit_unpaid") {
      filtered = filtered.filter((a) => a.booking_status === "confirmed" && !a.deposit_paid);
    } else if (bookingsStatusFilter === "needs_time") {
      filtered = filtered.filter((a) => a.status !== "cancelled" && a.booking_status !== "cancelled" && !a.confirmed_time);
    } else if (bookingsStatusFilter === "due_for_rebook") {
      filtered = filtered.filter(isDueForNudge);
    } else if (bookingsStatusFilter !== "all") {
      filtered = filtered.filter((a) => (a.booking_status || "pending") === bookingsStatusFilter);
    }
    if (search) {
      filtered = filtered.filter(
        (a) =>
          (a.dogname || "").toLowerCase().includes(search) ||
          (a.ownername || "").toLowerCase().includes(search) ||
          (a.phone || "").replace(/\s+/g, "").includes(search.replace(/\s+/g, "")),
      );
    }

    const dir = sortDirection === "asc" ? 1 : -1;
    filtered = [...filtered].sort((a, b) => {
      if (sortColumn === "owner") {
        return dir * (a.ownername || "").localeCompare(b.ownername || "");
      }
      if (sortColumn === "deposit") {
        const aKey = (a.deposit_paid ? 1000 : 0) + (a.deposit_amount || 0);
        const bKey = (b.deposit_paid ? 1000 : 0) + (b.deposit_amount || 0);
        return dir * (aKey - bKey);
      }
      if (sortColumn === "status") {
        const aKey = STATUS_SORT_ORDER[a.booking_status || "pending"] ?? 0;
        const bKey = STATUS_SORT_ORDER[b.booking_status || "pending"] ?? 0;
        return dir * (aKey - bKey);
      }
      // date: use the actual booking date (confirmed date wins, else requested date)
      const aSchedule = getEffectiveSchedule(a);
      const bSchedule = getEffectiveSchedule(b);
      const aDate = aSchedule?.date || a.confirmed_date || a.date || "";
      const bDate = bSchedule?.date || b.confirmed_date || b.date || "";
      if (aDate !== bDate) return dir * aDate.localeCompare(bDate);
      return dir * ((aSchedule?.startMinutes || 0) - (bSchedule?.startMinutes || 0));
    });

    return filtered;
  }, [appointments, selectedLocation, sortColumn, sortDirection, bookingsSearch, bookingsStatusFilter, reminderSettings.days_interval]);

  const totalPages = Math.ceil(filteredAppointments.length / pageSize);
  const paginatedAppointments = filteredAppointments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Jump back to page 1 whenever the search or status filter changes so results are visible
  useEffect(() => {
    setCurrentPage(1);
  }, [bookingsSearch, bookingsStatusFilter]);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (user) setIsAuthorized(true);
    };
    checkAuth();

    const { data: authListener } = checkAuthStatus();
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isAuthorized) {
      loadData();
    }
  }, [isAuthorized, selectedLocation]);

  // Keep the Diary screen live: bookings added from another device/tab (or by a
  // customer online) show up without needing a manual page refresh.
  useEffect(() => {
    if (!isAuthorized || view !== "diary") return;
    const interval = setInterval(() => {
      loadData();
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthorized, view, selectedLocation]);

  // Keep the Add Booking modal's time slot options in sync with real availability
  // (admin can still see/select an already-picked slot, but not a newly-clashing one)
  useEffect(() => {
    if (!showAddModal) return;
    let cancelled = false;
    getAvailableSlotTimes(addForm.locationid, addForm.date, { enforceLeadTime: false }).then((slots) => {
      if (!cancelled) setAddFormAvailableSlots(slots);
    });
    return () => {
      cancelled = true;
    };
  }, [showAddModal, addForm.locationid, addForm.date]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [apps, unavail, unavailWeekdays, remSettings, holSettings, custs] = await Promise.all([
        getAppointments(),
        getUnavailableDays(selectedLocation),
        getUnavailableWeekdays(),
        getReminderSettings().catch(() => null),
        getHolidaySettings().catch(() => null),
        getCustomers().catch(() => [] as Customer[]),
      ]);
      setAppointments(apps);
      setCustomersList(custs);
      setUnavailableDays(unavail);
      setUnavailableWeekdays(unavailWeekdays);
      if (remSettings) {
        setReminderSettings(remSettings);
      }
      if (holSettings) {
        setHolidayForm({
          holiday_start: holSettings.holiday_start ?? "",
          holiday_end: holSettings.holiday_end ?? "",
        });
        setAdvertForm({
          advert_start: holSettings.advert_start ?? "",
          advert_end: holSettings.advert_end ?? "",
          advert_text: holSettings.advert_text ?? "",
          advert_color: holSettings.advert_color ?? "#EAB308",
        });
        setWeekendsEnabled(holSettings.weekends_enabled ?? true);
      }
      setDbStatus("connected");
    } catch (err) {
      console.error("Database connection error:", err);
      setDbStatus("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      await signInAdmin(email, password);
      setIsAuthorized(true);
    } catch (err: any) {
      let errorMsg = "Invalid email or password";
      if (err.message.includes("Invalid login credentials")) {
        errorMsg = "Invalid email or password. Check your credentials in Supabase Dashboard.";
      } else if (err.message.includes("Email not confirmed")) {
        errorMsg = "Email not confirmed. Check Supabase Authentication → Users.";
      }
      setAuthError(errorMsg);
    }
  };

  const handleLogout = async () => {
    try {
      await signOutAdmin();
      setIsAuthorized(false);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  // ===== Customer records & intake form =====

  const refreshCustomers = async () => {
    try {
      setCustomersList(await getCustomers());
    } catch (err) {
      console.error("Failed to load customers:", err);
    }
  };

  const bookingsForCustomer = (customer: Customer) => appointments.filter((a) => a.customer_id === customer.id || (customer.email && a.email && a.email.toLowerCase() === customer.email.toLowerCase()));

  // Cancelled bookings that took a deposit which hasn't been marked refunded/handled yet
  const pendingDepositRefunds = (customerBookings: Appointment[]) =>
    customerBookings.filter((a) => a.booking_status === "cancelled" && a.deposit_paid && !a.deposit_refunded_at);

  const handleMarkDepositRefunded = async (booking: Appointment) => {
    if (!booking.id) return;
    await updateAppointment(booking.id, { deposit_refunded_at: new Date().toISOString() });
    await loadData();
  };

  const servicePriceFor = getServiceBasePrice;

  const handleAddCustomer = async () => {
    if (!addCustomerForm.ownername.trim()) {
      alert("Please enter the customer's name.");
      return;
    }
    if (!addCustomerForm.email.trim() && !addCustomerForm.phone.trim()) {
      alert("Please enter an email or phone number so we can send them the intake form.");
      return;
    }
    setIsWorking(true);
    try {
      await createCustomer(addCustomerForm);
      await refreshCustomers();
      setShowAddCustomerModal(false);
      setAddCustomerForm({ ownername: "", email: "", phone: "" });
    } catch (err: any) {
      alert(`Could not add customer: ${err.message}`);
    } finally {
      setIsWorking(false);
    }
  };

  const handleSendIntake = async (customer: Customer, channel: "whatsapp" | "sms" | "email") => {
    setSendingIntake(channel);
    try {
      const token = await ensureIntakeToken(customer);
      const link = buildIntakeLink(token);
      const message = buildIntakeMessage(customer, link);

      if (channel === "whatsapp") {
        if (!customer.phone) throw new Error("No phone number on record.");
        window.open(buildWhatsAppLink(customer.phone, message), "_blank");
      } else if (channel === "sms") {
        if (!customer.phone) throw new Error("No phone number on record.");
        await sendIntakeSms(customer, message);
      } else {
        if (!customer.email) throw new Error("No email address on record.");
        await sendIntakeEmail(customer, link);
      }

      await markIntakeSent(customer.id, channel);
      await refreshCustomers();
      if (channel !== "whatsapp") {
        alert(`Intake form link sent by ${channel === "sms" ? "SMS" : "email"}.`);
      }
    } catch (err: any) {
      alert(`Could not send form: ${err.message}`);
    } finally {
      setSendingIntake(null);
    }
  };

  const handleCopyIntakeLink = async (customer: Customer) => {
    setSendingIntake("copy");
    try {
      const token = await ensureIntakeToken(customer);
      await navigator.clipboard.writeText(buildIntakeLink(token));
      await refreshCustomers();
      alert("Link copied to clipboard.");
    } catch (err: any) {
      alert(`Could not copy link: ${err.message}`);
    } finally {
      setSendingIntake(null);
    }
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    if (!window.confirm(`Delete ${customer.ownername}? This hides them from the customer list and cancels any of their upcoming bookings so the slots free up for other customers. Their booking history is kept, and this can be undone from "Deleted customers".`)) return;
    try {
      await deleteCustomer(customer.id);
      setShowCustomerModal(false);
      await refreshCustomers();
      await loadData();
    } catch (err: any) {
      alert(`Could not delete customer: ${err.message}`);
    }
  };

  const handleRestoreCustomer = async (customer: Customer) => {
    try {
      await restoreCustomer(customer.id);
      await refreshCustomers();
      setDeletedCustomersList((prev) => prev.filter((c) => c.id !== customer.id));
    } catch (err: any) {
      alert(`Could not restore customer: ${err.message}`);
    }
  };

  const handleSaveCustomerInfo = async (customer: Customer) => {
    setIsWorking(true);
    try {
      await updateCustomer(customer.id, {
        ownername: customerInfoForm.ownername.trim(),
        email: customerInfoForm.email.trim() || null,
        phone: customerInfoForm.phone.trim() || null,
        address: customerInfoForm.address.trim() || null,
      });
      await refreshCustomers();
      setEditingCustomerInfo(false);
    } catch (err: any) {
      alert(`Could not save changes: ${err.message}`);
    } finally {
      setIsWorking(false);
    }
  };

  const openAgreementEditor = (customer: Customer) => {
    setAgreementForm({
      hear_about_us: customer.hear_about_us || "",
      sms_ok: customer.sms_ok ?? null,
      alt_contact_name: customer.alt_contact_name || "",
      alt_contact_phone: customer.alt_contact_phone || "",
      vet_name: customer.vet_name || "",
      emergency_vet_name: customer.emergency_vet_name || "",
      emergency_vet_phone: customer.emergency_vet_phone || "",
      emergency_vet_address: customer.emergency_vet_address || "",
      treats_ok: customer.treats_ok ?? null,
      photo_consent: customer.photo_consent ?? null,
      paper_signed: customer.intake_status === "completed" && !customer.signature_data,
      paper_date: customer.signed_at ? customer.signed_at.split("T")[0] : new Date().toISOString().split("T")[0],
      matting_required: Boolean(customer.matting_required),
      matting_paper_signed: Boolean(customer.matting_signed_at && customer.matting_signed_via === "paper"),
      matting_paper_date: customer.matting_signed_at ? customer.matting_signed_at.split("T")[0] : new Date().toISOString().split("T")[0],
    });
    setAgreementDogs((customer.dogs || []).map((dog) => ({ ...dog })));
    setAgreementDogsToDelete([]);
    setShowAgreementEditor(true);
  };

  const setAgreementDogField = (index: number, field: keyof Dog, value: unknown) => setAgreementDogs((prev) => prev.map((dog, i) => (i === index ? { ...dog, [field]: value } : dog)));

  const handleSaveAgreement = async (customer: Customer) => {
    setIsWorking(true);
    try {
      const updates: Partial<Customer> = {
        hear_about_us: agreementForm.hear_about_us.trim() || null,
        sms_ok: agreementForm.sms_ok,
        alt_contact_name: agreementForm.alt_contact_name.trim() || null,
        alt_contact_phone: agreementForm.alt_contact_phone.trim() || null,
        vet_name: agreementForm.vet_name.trim() || null,
        emergency_vet_name: agreementForm.emergency_vet_name.trim() || null,
        emergency_vet_phone: agreementForm.emergency_vet_phone.trim() || null,
        emergency_vet_address: agreementForm.emergency_vet_address.trim() || null,
        treats_ok: agreementForm.treats_ok,
        photo_consent: agreementForm.photo_consent,
      };

      updates.matting_required = agreementForm.matting_required;
      // Matting consent signed on paper — never overwrites a digital matting signature
      if (agreementForm.matting_required && agreementForm.matting_paper_signed && !customer.matting_signature) {
        updates.matting_signed_at = `${agreementForm.matting_paper_date}T00:00:00Z`;
        updates.matting_signed_via = "paper";
      }

      // "Signed on paper" marks the agreement complete without a digital signature
      if (agreementForm.paper_signed && !customer.signature_data) {
        updates.intake_status = "completed";
        updates.signed_at = `${agreementForm.paper_date}T00:00:00Z`;
        updates.intake_completed_at = `${agreementForm.paper_date}T00:00:00Z`;
        const displayDate = new Date(`${agreementForm.paper_date}T00:00:00`).toLocaleDateString("en-GB");
        updates.terms_version = `paper form signed ${displayDate} (copy on file)`;
      }

      await updateCustomer(customer.id, updates);

      for (const dog of agreementDogs) {
        if (dog.name.trim()) await saveDog(customer.id, dog);
      }
      for (const dogId of agreementDogsToDelete) {
        await deleteDog(dogId);
      }

      await refreshCustomers();
      setShowAgreementEditor(false);
    } catch (err: any) {
      alert(`Could not save agreement: ${err.message}`);
    } finally {
      setIsWorking(false);
    }
  };

  const formatBool = (value: boolean | null | undefined) => (value === true ? "Yes" : value === false ? "No" : "—");

  const printAgreement = (customer: Customer) => {
    const dogsHtml = (customer.dogs || [])
      .map(
        (dog) => `
        <h3>🐕 ${dog.name}${dog.breed ? ` (${dog.breed})` : ""}</h3>
        <table>
          <tr><td>Age</td><td>${dog.dob || "—"}</td></tr>
          <tr><td>Sex</td><td>${dog.sex || "—"}</td></tr>
          <tr><td>Neutered/Spayed</td><td>${formatBool(dog.neutered)}</td></tr>
          <tr><td>Vaccinated</td><td>${formatBool(dog.vaccinated)}</td></tr>
          <tr><td>Behaviour notes / triggers</td><td>${dog.behaviour_notes || "—"}</td></tr>
          <tr><td>Health / skin conditions</td><td>${dog.health_conditions || "—"}</td></tr>
          <tr><td>Prescribed medical shampoo</td><td>${formatBool(dog.needs_prescribed_shampoo)}</td></tr>
          <tr><td>Medication</td><td>${dog.medication_details || "None"}</td></tr>
          <tr><td>Muzzle needed</td><td>${formatBool(dog.needs_muzzle)}</td></tr>
        </table>`,
      )
      .join("");

    const termsHtml = INTAKE_TERMS.map((term, i) => `<li>${term}</li>`).join("");
    const signedDate = customer.signed_at ? new Date(customer.signed_at).toLocaleDateString("en-GB") : "—";

    const html = `<!DOCTYPE html><html><head><title>Grooming Agreement - ${customer.ownername}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; max-width: 720px; margin: 24px auto; padding: 0 16px; font-size: 13px; }
        h1 { text-align: center; } h2 { border-bottom: 2px solid #059669; padding-bottom: 4px; margin-top: 28px; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0; }
        td { border: 1px solid #cbd5e1; padding: 6px 10px; vertical-align: top; }
        td:first-child { font-weight: bold; width: 40%; background: #f8fafc; }
        ol { padding-left: 18px; } li { margin-bottom: 6px; }
        img.signature { max-height: 90px; border: 1px solid #cbd5e1; border-radius: 8px; }
      </style></head><body>
      <h1>Maisey Days @ Dirty Dawg<br><small>Dog Grooming Agreement</small></h1>
      <h2>Owner</h2>
      <table>
        <tr><td>Name</td><td>${customer.ownername}</td></tr>
        <tr><td>Address</td><td>${customer.address || "—"}</td></tr>
        <tr><td>Phone</td><td>${customer.phone || "—"}</td></tr>
        <tr><td>Email</td><td>${customer.email || "—"}</td></tr>
        <tr><td>Heard about us via</td><td>${customer.hear_about_us || "—"}</td></tr>
        <tr><td>Happy to receive texts</td><td>${formatBool(customer.sms_ok)}</td></tr>
        <tr><td>Alternative contact</td><td>${customer.alt_contact_name || "—"} ${customer.alt_contact_phone ? `(${customer.alt_contact_phone})` : ""}</td></tr>
        <tr><td>Vets used</td><td>${customer.vet_name || "—"}</td></tr>
        <tr><td>Treats allowed</td><td>${formatBool(customer.treats_ok)}</td></tr>
        <tr><td>Photo/social media consent</td><td>${formatBool(customer.photo_consent)}</td></tr>
      </table>
      <h2>Dogs</h2>
      ${dogsHtml || "<p>No dogs recorded.</p>"}
      <h2>Terms and Conditions (version ${customer.terms_version || "—"})</h2>
      <ol>${termsHtml}</ol>
      <h2>Emergency Care Authorisation</h2>
      <p>In the event of illness or injury during grooming, I authorise emergency veterinary care for my pet. Please use my preferred vet, but in case of urgency, any qualified veterinarian may be contacted.</p>
      <table>
        <tr><td>Preferred emergency vet</td><td>${customer.emergency_vet_name || "—"}</td></tr>
        <tr><td>Vet phone</td><td>${customer.emergency_vet_phone || "—"}</td></tr>
        <tr><td>Vet address</td><td>${customer.emergency_vet_address || "—"}</td></tr>
      </table>
      <h2>Signed</h2>
      ${customer.signature_data ? `<img class="signature" src="${customer.signature_data}" alt="Signature" />` : "<p>Signature held on the paper copy.</p>"}
      <p><strong>Date:</strong> ${signedDate}</p>
      ${
        customer.matting_signed_at
          ? `<h2>Matting Release Information and Consent</h2>
             ${MATTING_TERMS.map((paragraph) => `<p>${paragraph}</p>`).join("")}
             <ul>${MATTING_BULLETS.map((bullet) => `<li>${bullet}</li>`).join("")}</ul>
             <p><strong>${MATTING_CLOSING}</strong></p>
             ${customer.matting_signature ? `<img class="signature" src="${customer.matting_signature}" alt="Matting consent signature" />` : "<p>Signature held on the paper copy.</p>"}
             <p><strong>Signed:</strong> ${customer.matting_signed_via === "paper" ? "on paper" : "digitally"} on ${new Date(customer.matting_signed_at).toLocaleDateString("en-GB")}</p>`
          : ""
      }
      </body></html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Pop-up blocked. Please allow pop-ups to print the agreement.");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  const openUpdateModal = (booking: Appointment) => {
    setActiveBooking(booking);
    setEditForm({
      ownername: booking.ownername || "",
      email: booking.email || "",
      phone: booking.phone || "",
      dogname: booking.dogname || "",
      dogbreed: booking.dogbreed || "",
      serviceid: booking.serviceid || SERVICES[0].id,
      requested_time_preference: booking.requested_time_preference || booking.time || "",
      confirmed_date: booking.confirmed_date || booking.date || "",
      // Pre-fill from the requested slot so confirming is one click when the slot works.
      // Times from the database can include seconds ("10:00:00") so trim to HH:MM.
      confirmed_time: booking.confirmed_time ? String(booking.confirmed_time).slice(0, 5) : (/^\d{1,2}:\d{2}$/.test((booking.requested_time_preference || booking.time || "").trim()) ? (booking.requested_time_preference || booking.time || "").trim().slice(0, 5) : ""),
      confirmed_duration_minutes: booking.confirmed_duration_minutes || 120,
      notes: booking.notes || "",
      number_of_dogs: booking.number_of_dogs || 1,
      deposit_paid: booking.deposit_paid || false,
      deposit_amount: booking.deposit_amount || (booking.number_of_dogs || 1) * 20,
      deposit_notes: booking.deposit_notes || "",
      deposit_paid_at: booking.deposit_paid_at || null,
      actual_price: booking.actual_price ?? "",
      estimated_price: booking.estimated_price ?? getServiceBasePrice(booking.serviceid) * (booking.number_of_dogs || 1),
    });
    setNewPhotoType("before");
    setActiveBookingPhotos([]);
    if (booking.id) {
      setLoadingPhotos(true);
      getBookingPhotos(booking.id)
        .then(setActiveBookingPhotos)
        .catch(() => {})
        .finally(() => setLoadingPhotos(false));
    }
    setShowUpdateModal(true);
  };

  const handleUploadPhoto = async (file: File) => {
    if (!activeBooking?.id) return;
    if (file.size > 8 * 1024 * 1024) {
      alert("Photo must be 8MB or less.");
      return;
    }
    setUploadingPhoto(true);
    try {
      await addBookingPhoto(activeBooking.id, file, newPhotoType);
      const photos = await getBookingPhotos(activeBooking.id);
      setActiveBookingPhotos(photos);
    } catch (error: any) {
      alert(error.message || "Could not upload the photo.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photo: BookingPhoto) => {
    if (!window.confirm("Remove this photo?")) return;
    try {
      await deleteBookingPhoto(photo);
      setActiveBookingPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (error: any) {
      alert(error.message || "Could not remove the photo.");
    }
  };

  const closeUpdateModal = () => {
    setShowUpdateModal(false);
    setActiveBooking(null);
  };

  const openAddModal = () => {
    // Reset form to default values to clear any previous data
    setAddForm({
      ownername: "",
      email: "",
      phone: "",
      dogname: "",
      dogbreed: "",
      serviceid: SERVICES[0].id,
      locationid: selectedLocation === ALL_LOCATIONS ? LOCATIONS[0].id : selectedLocation,
      date: new Date().toISOString().split("T")[0],
      confirmed_time: "",
      confirmed_duration_minutes: 120,
      notes: "",
      number_of_dogs: 1,
      deposit_paid: false,
      deposit_amount: 20,
      deposit_notes: "",
      confirm_channel: "whatsapp" as "none" | "whatsapp" | "sms",
    });
    setShowAddModal(true);
  };

  const saveBookingDetails = async () => {
    if (!activeBooking?.id) return;
    if (editForm.confirmed_date && editForm.confirmed_time) {
      const clash = await findBookingClash(activeBooking.locationid, editForm.confirmed_date, editForm.confirmed_time, Number(editForm.confirmed_duration_minutes) || 120, activeBooking.id);
      if (clash) {
        const clashTime = getEffectiveSchedule(clash)?.timeLabel || "";
        if (!window.confirm(`⚠️ DOUBLE BOOKING WARNING\n\n${clash.dogname} (${clash.ownername}) is already booked at ${clashTime} on this day.\n\nSave anyway?`)) return;
      }
    }
    setIsWorking(true);
    try {
      await updateAppointment(activeBooking.id, {
        ownername: editForm.ownername,
        email: editForm.email,
        phone: editForm.phone,
        dogname: editForm.dogname,
        dogbreed: editForm.dogbreed,
        serviceid: editForm.serviceid,
        notes: editForm.notes,
        requested_time_preference: editForm.requested_time_preference,
        confirmed_date: editForm.confirmed_date || null,
        confirmed_time: editForm.confirmed_time || null,
        confirmed_duration_minutes: editForm.confirmed_duration_minutes,
        number_of_dogs: editForm.number_of_dogs,
        deposit_paid: editForm.deposit_paid,
        deposit_amount: editForm.deposit_amount,
        deposit_paid_at: editForm.deposit_paid ? new Date().toISOString() : null,
        deposit_notes: editForm.deposit_notes,
        actual_price: editForm.actual_price === "" ? null : Number(editForm.actual_price),
        estimated_price: editForm.estimated_price === "" ? null : Number(editForm.estimated_price),
      });
      await loadData();
      alert("Booking updated.");
    } catch (error: any) {
      alert(error.message || "Could not update booking.");
    } finally {
      setIsWorking(false);
    }
  };

  const confirmBooking = async (channel: "sms" | "whatsapp" | "none") => {
    if (!activeBooking?.id) return;
    if (!editForm.confirmed_date || !editForm.confirmed_time || !editForm.confirmed_duration_minutes) {
      alert("Please set confirmed date, time and duration first.");
      return;
    }
    if (channel !== "none" && !editForm.phone) {
      alert(`A phone number is needed to confirm via ${channel === "whatsapp" ? "WhatsApp" : "SMS"}.`);
      return;
    }
    setPendingConfirmChannel(channel);

    // Check if deposit is paid - if not, show deposit confirmation modal
    if (!editForm.deposit_paid) {
      setShowDepositModal(true);
      return;
    }

    // Proceed with confirmation
    await proceedWithConfirmation(channel);
  };

  const proceedWithConfirmation = async (channel: "sms" | "whatsapp" | "none" = pendingConfirmChannel) => {
    if (!activeBooking?.id) return;

    const clash = await findBookingClash(activeBooking.locationid, editForm.confirmed_date, editForm.confirmed_time, Number(editForm.confirmed_duration_minutes) || 120, activeBooking.id);
    if (clash) {
      const clashTime = getEffectiveSchedule(clash)?.timeLabel || "";
      if (!window.confirm(`⚠️ DOUBLE BOOKING WARNING\n\n${clash.dogname} (${clash.ownername}) is already booked at ${clashTime} on this day.\n\nConfirm this booking anyway?`)) return;
    }

    const shouldConfirm = window.confirm(channel === "none" ? "Confirm this booking without sending a message to the customer?" : `Confirm this booking and send the ${channel === "whatsapp" ? "WhatsApp message" : "SMS"}?`);
    if (!shouldConfirm) return;

    setIsWorking(true);
    try {
      const confirmedAppointment: Appointment = {
        ...activeBooking,
        ownername: editForm.ownername,
        dogname: editForm.dogname,
        serviceid: editForm.serviceid,
        phone: editForm.phone,
        locationid: activeBooking.locationid,
        confirmed_date: editForm.confirmed_date,
        confirmed_time: editForm.confirmed_time,
      };

      if (channel === "whatsapp") {
        // Free channel: open WhatsApp with the confirmation message ready to send
        window.open(buildWhatsAppLink(editForm.phone, buildConfirmationMessage(confirmedAppointment)), "_blank");
      }

      await confirmAppointmentBooking(
        confirmedAppointment,
        {
          confirmedDate: editForm.confirmed_date,
          confirmedTime: editForm.confirmed_time,
          confirmedDurationMinutes: Number(editForm.confirmed_duration_minutes),
        },
        channel,
      );

      await loadData();
      closeUpdateModal();
      alert(channel === "whatsapp" ? "Booking confirmed — WhatsApp message opened, just press send." : channel === "sms" ? "Booking confirmed and SMS sent." : "Booking confirmed — no message sent.");
    } catch (error: any) {
      alert(error.message || "Failed to confirm booking.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleDepositPaid = async () => {
    setShowDepositModal(false);
    setEditForm({ ...editForm, deposit_paid: true, deposit_paid_at: new Date().toISOString() });

    // Save deposit status first
    if (activeBooking?.id) {
      await updateAppointment(activeBooking.id, {
        deposit_paid: true,
        deposit_paid_at: new Date().toISOString(),
      });
    }

    // Then proceed with confirmation
    await proceedWithConfirmation();
  };

  const handleSkipDeposit = async () => {
    setShowDepositModal(false);
    // Proceed with confirmation without marking deposit as paid
    await proceedWithConfirmation();
  };

  const handleMarkCompleted = (booking: Appointment) => {
    if (!booking.id) return;
    setCompletingBooking(booking);
    setCompletePriceInput(booking.actual_price != null ? String(booking.actual_price) : "");
  };

  const confirmMarkCompleted = async () => {
    if (!completingBooking?.id) return;
    setIsWorking(true);
    try {
      await updateAppointment(completingBooking.id, {
        booking_status: "completed",
        completed_at: new Date().toISOString(),
        actual_price: completePriceInput === "" ? null : Number(completePriceInput),
      });
      await loadData();
      setCompletingBooking(null);
      alert("Appointment marked as completed. Customer will receive a 28-day rebooking reminder.");
    } catch (error: any) {
      alert(error.message || "Could not mark as completed.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleQuickSetPrice = async (apt: Appointment) => {
    if (!apt.id) return;
    const draft = priceFixDrafts[apt.id];
    if (draft === undefined || draft === "") return;
    setPriceFixSaving((prev) => ({ ...prev, [apt.id!]: true }));
    try {
      await updateAppointment(apt.id, { actual_price: Number(draft) });
      await loadData();
    } catch (error: any) {
      alert(error.message || "Could not save the price.");
    } finally {
      setPriceFixSaving((prev) => ({ ...prev, [apt.id!]: false }));
    }
  };

  // Best-guess slot for an old booking that only ever recorded a rough
  // Morning/Afternoon/Evening preference, never an exact time.
  const handleNudgeWhatsApp = (apt: Appointment) => {
    if (!apt.phone) {
      alert("No phone number on record for this customer.");
      return;
    }
    window.open(buildWhatsAppLink(apt.phone, buildRebookNudgeMessage(apt)), "_blank");
  };

  const handleMarkNudgeContacted = async (apt: Appointment) => {
    if (!apt.id) return;
    setNudgeSaving((prev) => ({ ...prev, [apt.id!]: true }));
    try {
      await updateAppointment(apt.id, { rebook_contacted_at: new Date().toISOString() });
      await loadData();
    } catch (error: any) {
      alert(error.message || "Could not update.");
    } finally {
      setNudgeSaving((prev) => ({ ...prev, [apt.id!]: false }));
    }
  };

  const handleMarkNudgeClosed = async (apt: Appointment) => {
    if (!apt.id) return;
    if (!window.confirm(`Mark ${apt.dogname} (${apt.ownername}) as no longer expected to return? This removes them from your rebook nudge list.`)) return;
    setNudgeSaving((prev) => ({ ...prev, [apt.id!]: true }));
    try {
      await updateAppointment(apt.id, { rebook_closed_at: new Date().toISOString() });
      await loadData();
    } catch (error: any) {
      alert(error.message || "Could not update.");
    } finally {
      setNudgeSaving((prev) => ({ ...prev, [apt.id!]: false }));
    }
  };

  const guessSlotForPreference = (pref: string) => {
    const p = pref.trim().toLowerCase();
    if (p === "morning") return "08:00";
    if (p === "afternoon") return "12:00";
    if (p === "evening") return "16:00";
    return "10:00";
  };

  const getLegacyTimeDraft = (apt: Appointment) =>
    legacyTimeDrafts[apt.id!] || { date: apt.date, time: guessSlotForPreference(apt.requested_time_preference || apt.time || "") };

  const setLegacyTimeDraft = (aptId: string, updates: Partial<{ date: string; time: string }>) => {
    setLegacyTimeDrafts((prev) => ({ ...prev, [aptId]: { ...(prev[aptId] || getLegacyTimeDraft(appointments.find((a) => a.id === aptId)!)), ...updates } }));
  };

  const handleSaveLegacyTime = async (apt: Appointment, alsoMarkCompleted: boolean) => {
    if (!apt.id) return;
    const draft = getLegacyTimeDraft(apt);
    if (!draft.date || !draft.time) {
      alert("Please set both a date and a time.");
      return;
    }
    setLegacyTimeSaving((prev) => ({ ...prev, [apt.id!]: true }));
    try {
      const updates = { confirmed_date: draft.date, confirmed_time: draft.time, confirmed_duration_minutes: apt.confirmed_duration_minutes || 120 };
      await updateAppointment(apt.id, updates);
      if (alsoMarkCompleted) {
        setCompletingBooking({ ...apt, ...updates });
        setCompletePriceInput(apt.actual_price != null ? String(apt.actual_price) : "");
      } else {
        await loadData();
      }
    } catch (error: any) {
      alert(error.message || "Could not save the time.");
    } finally {
      setLegacyTimeSaving((prev) => ({ ...prev, [apt.id!]: false }));
    }
  };

  const handleRebook = async (booking: Appointment) => {
    if (!booking.id) return;

    // Open add modal with prefilled data from the previous booking
    setAddForm({
      ownername: booking.ownername || "",
      email: booking.email || "",
      phone: booking.phone || "",
      dogname: booking.dogname || "",
      dogbreed: booking.dogbreed || "",
      serviceid: booking.serviceid || SERVICES[0].id,
      locationid: booking.locationid || LOCATIONS[0].id,
      date: new Date().toISOString().split("T")[0],
      confirmed_time: "",
      confirmed_duration_minutes: booking.confirmed_duration_minutes || 120,
      notes: `Rebooking from ${booking.confirmed_date || booking.date}`,
      number_of_dogs: booking.number_of_dogs || 1,
      deposit_paid: false,
      deposit_amount: 20,
      deposit_notes: "",
      confirm_channel: "whatsapp" as "none" | "whatsapp" | "sms",
    });
    setShowAddModal(true);
  };

  const handleDeleteBooking = async (booking: Appointment) => {
    if (!booking.id) return;
    const shouldDelete = window.confirm(`Delete booking for ${booking.dogname}?`);
    if (!shouldDelete) return;

    try {
      await deleteAppointment(booking.id);
      await loadData();
    } catch (error: any) {
      alert(error.message || "Could not delete booking.");
    }
  };

  /**
   * Cancels a booking (keeps the record, frees the slot for other customers)
   * and optionally notifies the customer via WhatsApp or SMS.
   */
  const handleCancelBooking = async (booking: Appointment, channel: "whatsapp" | "sms" | "none") => {
    if (!booking.id) return;
    const notifyText = channel === "whatsapp" ? " and open WhatsApp with a cancellation message ready to send" : channel === "sms" ? " and text the customer to let them know" : "";
    if (!window.confirm(`Cancel the booking for ${booking.dogname}${notifyText}?`)) return;

    setIsWorking(true);
    try {
      if (channel === "whatsapp") {
        if (!booking.phone) {
          alert("No phone number on record — cancelling without notifying.");
        } else {
          window.open(buildWhatsAppLink(booking.phone, buildCancellationMessage(booking)), "_blank");
        }
      } else if (channel === "sms") {
        await sendCustomerCancellationSms(booking);
      }

      await updateAppointment(booking.id, { status: "cancelled", booking_status: "cancelled" });
      await loadData();
      closeUpdateModal();
      if (booking.deposit_paid) {
        alert(`⚠️ Heads up — ${booking.dogname}'s cancelled booking had a £${booking.deposit_amount || (booking.number_of_dogs || 1) * 20} deposit paid.\n\nIt'll show as "Deposit owed" on ${booking.ownername}'s customer record until you mark it refunded/handled.`);
      }
    } catch (error: any) {
      alert(error.message || "Could not cancel the booking.");
    } finally {
      setIsWorking(false);
    }
  };

  const openEmailModal = (booking: Appointment) => {
    if (!booking.email) {
      alert("No email address on record for this customer.");
      return;
    }
    const firstName = (booking.ownername || "").trim().split(/\s+/)[0] || "there";
    setEmailSubject(`Your booking request - ${booking.dogname}`);
    setEmailMessage(`Hi ${firstName},\n\nThanks for your booking request for ${booking.dogname}.\n\n\n\nBest regards,\nMaisey Days @ Dirty Dawg 🐾`);
    setShowEmailModal(true);
  };

  const handleSendCustomEmail = async () => {
    if (!activeBooking?.email) return;
    if (!emailMessage.trim()) {
      alert("Please write a message.");
      return;
    }
    setEmailSending(true);
    try {
      await sendCustomEmail(activeBooking.email, activeBooking.ownername, emailSubject, emailMessage, EMAIL_CUSTOMER_REPLY_TO);
      setShowEmailModal(false);
      alert("Email sent.");
    } catch (error: any) {
      alert(error.message || "Could not send the email.");
    } finally {
      setEmailSending(false);
    }
  };

  const handleAddBooking = async (hold: boolean = false) => {
    if (!addForm.ownername || !addForm.dogname || (!addForm.email && !addForm.phone)) {
      alert("Please fill in owner name, dog name, and at least an email or phone number.");
      return;
    }

    if (!addForm.confirmed_time) {
      alert("Please set the appointment time.");
      return;
    }

    const clash = await findBookingClash(addForm.locationid, addForm.date, addForm.confirmed_time, Number(addForm.confirmed_duration_minutes) || 120);
    if (clash) {
      const clashTime = getEffectiveSchedule(clash)?.timeLabel || "";
      if (!window.confirm(`⚠️ DOUBLE BOOKING WARNING\n\n${clash.dogname} (${clash.ownername}) is already booked at ${clashTime} on this day.\n\nAdd this booking anyway?`)) return;
    }

    setIsWorking(true);
    try {
      const result = await createManualAppointment({
        ownername: addForm.ownername,
        email: addForm.email,
        phone: addForm.phone,
        dogname: addForm.dogname,
        dogbreed: addForm.dogbreed,
        serviceid: addForm.serviceid,
        locationid: addForm.locationid,
        date: addForm.date,
        time: addForm.confirmed_time,
        confirmed_date: addForm.date,
        confirmed_time: addForm.confirmed_time,
        confirmed_duration_minutes: addForm.confirmed_duration_minutes,
        notes: addForm.notes,
        number_of_dogs: addForm.number_of_dogs,
        // Adding a booking confirms it (you know the details are right) unless
        // you deliberately choose to Hold it as a tentative/pending booking.
        status: hold ? "pending" : "confirmed",
        booking_status: hold ? "pending" : "confirmed",
        booking_source: "manual",
        deposit_paid: addForm.deposit_paid,
        deposit_amount: addForm.deposit_amount,
        deposit_paid_at: addForm.deposit_paid ? new Date().toISOString() : null,
        deposit_notes: addForm.deposit_notes,
      });

      const createdBooking = Array.isArray(result) ? result[0] : null;

      if (!hold && addForm.confirm_channel !== "none" && createdBooking?.id) {
        const nowIso = new Date().toISOString();
        const confirmedAppointment: Appointment = {
          ...createdBooking,
          confirmed_date: addForm.date,
          confirmed_time: addForm.confirmed_time,
          confirmed_duration_minutes: addForm.confirmed_duration_minutes,
        };
        try {
          if (addForm.confirm_channel === "sms") {
            await sendCustomerConfirmationSms(confirmedAppointment);
          } else {
            // Free channel: open WhatsApp with the confirmation ready to send
            window.open(buildWhatsAppLink(addForm.phone, buildConfirmationMessage(confirmedAppointment)), "_blank");
          }
          await updateAppointment(createdBooking.id, {
            is_confirmed: true,
            confirmed_at: nowIso,
            confirmation_sent_at: nowIso,
          });
        } catch (sendErr: any) {
          alert(`Booking created but the confirmation failed to send: ${sendErr.message}`);
        }
      }

      await loadData();
      setShowAddModal(false);
      setAddForm({
        ownername: "",
        email: "",
        phone: "",
        dogname: "",
        dogbreed: "",
        serviceid: SERVICES[0].id,
        locationid: selectedLocation === ALL_LOCATIONS ? LOCATIONS[0].id : selectedLocation,
        date: new Date().toISOString().split("T")[0],
        confirmed_time: "",
        confirmed_duration_minutes: 120,
        notes: "",
        number_of_dogs: 1,
        deposit_paid: false,
        deposit_amount: 20,
        deposit_notes: "",
        confirm_channel: "whatsapp" as "none" | "whatsapp" | "sms",
      });
      alert(hold ? "Booking added and held as pending." : addForm.confirm_channel === "sms" ? "Booking added and confirmed — SMS sent." : addForm.confirm_channel === "whatsapp" ? "Booking added and confirmed — WhatsApp message opened, just press send." : "Booking added and confirmed.");
    } catch (error: any) {
      alert(error.message || "Could not add booking.");
    } finally {
      setIsWorking(false);
    }
  };

  const openDiarySlotModal = (date: string, time: string) => {
    setDiarySlotDate(date);
    setDiarySlotTime(time);
    setDiarySlotDuration(120);
    setDiarySlotCustomerSearch("");
    setDiarySlotSelectedCustomer(null);
    setDiarySlotForm({
      ownername: "",
      email: "",
      phone: "",
      dogname: "",
      dogbreed: "",
      serviceid: SERVICES[0].id,
      locationid: selectedLocation === ALL_LOCATIONS ? LOCATIONS[0].id : selectedLocation,
      notes: "",
      number_of_dogs: 1,
      deposit_paid: false,
      deposit_amount: 20,
      deposit_notes: "",
      confirm_channel: "whatsapp",
    });
    setShowDiarySlotModal(true);
  };

  const selectDiarySlotCustomer = (customer: Customer) => {
    setDiarySlotSelectedCustomer(customer);
    setDiarySlotForm((prev) => ({
      ...prev,
      ownername: customer.ownername,
      email: customer.email || "",
      phone: customer.phone || "",
      dogname: customer.dogs?.[0]?.name || "",
      dogbreed: customer.dogs?.[0]?.breed || "",
    }));
    setDiarySlotCustomerSearch("");
  };

  const handleDiarySlotBooking = async (hold: boolean = false) => {
    if (!diarySlotForm.ownername || !diarySlotForm.dogname || (!diarySlotForm.email && !diarySlotForm.phone)) {
      alert("Please fill in owner name, dog name, and at least an email or phone number.");
      return;
    }

    const clash = await findBookingClash(diarySlotForm.locationid, diarySlotDate, diarySlotTime, diarySlotDuration);
    if (clash) {
      const clashTime = getEffectiveSchedule(clash)?.timeLabel || "";
      if (!window.confirm(`⚠️ DOUBLE BOOKING WARNING\n\n${clash.dogname} (${clash.ownername}) is already booked at ${clashTime} on this day.\n\nAdd this booking anyway?`)) return;
    }

    setIsWorking(true);
    try {
      const result = await createManualAppointment({
        ownername: diarySlotForm.ownername,
        email: diarySlotForm.email,
        phone: diarySlotForm.phone,
        dogname: diarySlotForm.dogname,
        dogbreed: diarySlotForm.dogbreed,
        serviceid: diarySlotForm.serviceid,
        locationid: diarySlotForm.locationid,
        date: diarySlotDate,
        time: diarySlotTime,
        confirmed_date: diarySlotDate,
        confirmed_time: diarySlotTime,
        confirmed_duration_minutes: diarySlotDuration,
        notes: diarySlotForm.notes,
        number_of_dogs: diarySlotForm.number_of_dogs,
        // Adding a booking confirms it unless you deliberately Hold it as pending.
        status: hold ? "pending" : "confirmed",
        booking_status: hold ? "pending" : "confirmed",
        booking_source: "manual",
        deposit_paid: diarySlotForm.deposit_paid,
        deposit_amount: diarySlotForm.deposit_amount,
        deposit_paid_at: diarySlotForm.deposit_paid ? new Date().toISOString() : null,
        deposit_notes: diarySlotForm.deposit_notes,
      });

      const created = Array.isArray(result) ? result[0] : null;

      // The auto-link trigger only matches by email — if we picked an existing
      // customer explicitly (e.g. one with only a phone number), link it directly.
      if (created?.id && diarySlotSelectedCustomer) {
        await updateAppointment(created.id, { customer_id: diarySlotSelectedCustomer.id });
      }

      if (!hold && diarySlotForm.confirm_channel !== "none" && created?.id) {
        const nowIso = new Date().toISOString();
        const confirmedAppointment: Appointment = {
          ...created,
          confirmed_date: diarySlotDate,
          confirmed_time: diarySlotTime,
          confirmed_duration_minutes: diarySlotDuration,
        };
        try {
          if (diarySlotForm.confirm_channel === "sms") {
            await sendCustomerConfirmationSms(confirmedAppointment);
          } else {
            window.open(buildWhatsAppLink(diarySlotForm.phone, buildConfirmationMessage(confirmedAppointment)), "_blank");
          }
          await updateAppointment(created.id, { is_confirmed: true, confirmed_at: nowIso, confirmation_sent_at: nowIso });
        } catch (sendErr: any) {
          alert(`Booking created but the confirmation failed to send: ${sendErr.message}`);
        }
      }

      await loadData();
      await refreshCustomers();
      setShowDiarySlotModal(false);
    } catch (error: any) {
      alert(error.message || "Could not add booking.");
    } finally {
      setIsWorking(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-10 rounded-3xl shadow-2xl border border-slate-100">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
              <span className="text-3xl">🔐</span>
            </div>
            <h2 className="text-3xl font-black text-slate-800">Admin Login</h2>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            {authError && <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl text-sm font-semibold">{authError}</div>}
            <input type="email" placeholder="Admin Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all" required autoFocus />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all" required />
            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-bold shadow-lg shadow-emerald-600/20 transition-all">
              Unlock Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-black text-slate-800">Salon Manager</h1>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${dbStatus === "connected" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{dbStatus === "connected" ? "Live" : "Offline"}</div>
          <button onClick={handleLogout} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-rose-600 transition-colors">
            Logout
          </button>
        </div>
        <div className="flex bg-slate-200 p-1 rounded-xl">
          <button onClick={() => setView("dashboard")} className={`px-4 py-2 rounded-lg font-bold transition-all ${view === "dashboard" ? "bg-white shadow-sm text-emerald-600" : "text-slate-600"}`}>
            Dashboard
          </button>
          <button onClick={() => setView("bookings")} className={`px-4 py-2 rounded-lg font-bold transition-all ${view === "bookings" ? "bg-white shadow-sm text-emerald-600" : "text-slate-600"}`}>
            Bookings
          </button>
          <button onClick={() => setView("diary")} className={`px-4 py-2 rounded-lg font-bold transition-all ${view === "diary" ? "bg-white shadow-sm text-emerald-600" : "text-slate-600"}`}>
            Diary
          </button>
          <button onClick={() => { setView("customers"); refreshCustomers(); getAllDogNotes().then(setAllDogNotes).catch(() => {}); }} className={`px-4 py-2 rounded-lg font-bold transition-all ${view === "customers" ? "bg-white shadow-sm text-emerald-600" : "text-slate-600"}`}>
            Customers
          </button>
          <button onClick={() => setView("unavailable")} className={`px-4 py-2 rounded-lg font-bold transition-all ${view === "unavailable" ? "bg-white shadow-sm text-emerald-600" : "text-slate-600"}`}>
            Closed Dates
          </button>
          <button onClick={() => setView("services")} className={`px-4 py-2 rounded-lg font-bold transition-all ${view === "services" ? "bg-white shadow-sm text-emerald-600" : "text-slate-600"}`}>
            Services
          </button>
          <button onClick={() => setView("settings")} className={`px-4 py-2 rounded-lg font-bold transition-all ${view === "settings" ? "bg-white shadow-sm text-emerald-600" : "text-slate-600"}`}>
            Settings
          </button>
        </div>
      </div>

      <div className="mb-8 flex gap-4 overflow-x-auto pb-2">
        <button onClick={() => setSelectedLocation(ALL_LOCATIONS)} className={`px-6 py-3 rounded-2xl font-bold border-2 transition-all whitespace-nowrap ${selectedLocation === ALL_LOCATIONS ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-500"}`}>
          All Locations
        </button>
        {LOCATIONS.map((l) => (
          <button key={l.id} onClick={() => setSelectedLocation(l.id)} className={`px-6 py-3 rounded-2xl font-bold border-2 transition-all whitespace-nowrap ${selectedLocation === l.id ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-500"}`}>
            {l.name}
          </button>
        ))}
      </div>

      {view === "dashboard" && (() => {
        const scoped = appointments.filter((a) => selectedLocation === ALL_LOCATIONS || a.locationid === selectedLocation);
        const now = new Date();
        const todayStr = toDateString(now);
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

        const isCompleted = (a: Appointment) => a.booking_status === "completed";
        const completedThisMonth = scoped.filter((a) => isCompleted(a) && a.completed_at && a.completed_at.slice(0, 7) === monthKey);
        const completedLastMonth = scoped.filter((a) => isCompleted(a) && a.completed_at && a.completed_at.slice(0, 7) === lastMonthKey);
        const revenueThisMonth = completedThisMonth.reduce((sum, a) => sum + getBookingRevenue(a).amount, 0);
        const revenueLastMonth = completedLastMonth.reduce((sum, a) => sum + getBookingRevenue(a).amount, 0);
        const revenueDeltaPct = revenueLastMonth > 0 ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100) : null;

        const weekStart = getMonday(now);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekStartStr = toDateString(weekStart);
        const weekEndStr = toDateString(weekEnd);
        const thisWeekBookings = scoped.filter((a) => {
          if (a.status === "cancelled" || a.booking_status === "cancelled") return false;
          const schedule = getEffectiveSchedule(a);
          return schedule && schedule.date >= weekStartStr && schedule.date <= weekEndStr;
        });

        const allCompleted = scoped.filter(isCompleted);
        const avgJobValue = allCompleted.length > 0 ? allCompleted.reduce((sum, a) => sum + getBookingRevenue(a).amount, 0) / allCompleted.length : 0;

        const newCustomersThisMonth = customersList.filter((c) => c.created_at && c.created_at.slice(0, 7) === monthKey).length;

        const upcomingConfirmed = scoped.filter((a) => a.booking_status === "confirmed");
        const depositsOwed = upcomingConfirmed.filter((a) => !a.deposit_paid);
        const depositsOwedTotal = depositsOwed.reduce((sum, a) => sum + (a.deposit_amount || (a.number_of_dogs || 1) * 20), 0);

        const pendingRequests = scoped.filter((a) => (a.booking_status || a.status) === "pending" && a.status !== "cancelled");

        // Same live "due a rebook nudge" rule used by the Bookings tab filter (isDueForNudge),
        // so the two never disagree.
        const rebookIntervalDays = reminderSettings.days_interval || 28;
        const dueForNudge = scoped.filter(isDueForNudge).sort((a, b) => (a.completed_at || "").localeCompare(b.completed_at || ""));
        const missingPrice = scoped
          .filter((a) => isCompleted(a) && (a.actual_price === null || a.actual_price === undefined))
          .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));

        const formsNotSent = customersList.filter((c) => c.intake_status === "not_sent").length;
        const formsAwaiting = customersList.filter((c) => c.intake_status === "sent").length;
        const mattingOutstanding = customersList.filter((c) => c.matting_required && !c.matting_signed_at).length;

        const todaysSchedule = (scoped
          .map((a) => ({ apt: a, schedule: getEffectiveSchedule(a) }))
          .filter((x) => x.schedule && x.schedule.date === todayStr && x.apt.status !== "cancelled" && x.apt.booking_status !== "cancelled") as { apt: Appointment; schedule: NonNullable<ReturnType<typeof getEffectiveSchedule>> }[])
          .sort((a, b) => a.schedule.startMinutes - b.schedule.startMinutes);

        // Revenue trend: last 8 weeks (including current), from completed bookings' completed_at
        const weeklyRevenue: { label: string; amount: number; weekStart: string }[] = [];
        for (let i = 7; i >= 0; i--) {
          const wStart = new Date(weekStart);
          wStart.setDate(wStart.getDate() - i * 7);
          const wEnd = new Date(wStart);
          wEnd.setDate(wEnd.getDate() + 6);
          const wStartStr = toDateString(wStart);
          const wEndStr = toDateString(wEnd);
          const amount = scoped
            .filter((a) => isCompleted(a) && a.completed_at && a.completed_at.slice(0, 10) >= wStartStr && a.completed_at.slice(0, 10) <= wEndStr)
            .reduce((sum, a) => sum + getBookingRevenue(a).amount, 0);
          weeklyRevenue.push({ label: wStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), amount, weekStart: wStartStr });
        }
        const maxWeekly = Math.max(1, ...weeklyRevenue.map((w) => w.amount));

        const serviceStats = SERVICES.map((s) => {
          const bookingsForService = completedThisMonth.filter((a) => a.serviceid === s.id);
          return { service: s, count: bookingsForService.length, revenue: bookingsForService.reduce((sum, a) => sum + getBookingRevenue(a).amount, 0) };
        })
          .filter((s) => s.count > 0)
          .sort((a, b) => b.revenue - a.revenue);

        const locationStats = LOCATIONS.map((loc) => {
          const locBookings = appointments.filter((a) => a.locationid === loc.id && isCompleted(a) && a.completed_at && a.completed_at.slice(0, 7) === monthKey);
          return { location: loc, count: locBookings.length, revenue: locBookings.reduce((sum, a) => sum + getBookingRevenue(a).amount, 0) };
        });

        const fmtMoney = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

        return (
          <div className="space-y-6">
            {/* KPI tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Revenue This Month</div>
                <div className="text-3xl font-black text-emerald-600">{fmtMoney(revenueThisMonth)}</div>
                {revenueDeltaPct !== null && (
                  <div className={`text-xs font-bold mt-1 ${revenueDeltaPct >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                    {revenueDeltaPct >= 0 ? "▲" : "▼"} {Math.abs(revenueDeltaPct)}% vs last month
                  </div>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">This Week's Bookings</div>
                <div className="text-3xl font-black text-teal-600">{thisWeekBookings.length}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {weekEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Avg Job Value</div>
                <div className="text-3xl font-black text-slate-800">{fmtMoney(avgJobValue)}</div>
                <div className="text-xs text-slate-400 mt-1">
                  across {allCompleted.length} completed groom{allCompleted.length !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">New Customers</div>
                <div className="text-3xl font-black text-purple-600">{newCustomersThisMonth}</div>
                <div className="text-xs text-slate-400 mt-1">this month</div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Deposits Outstanding</div>
                <div className="text-3xl font-black text-amber-600">{fmtMoney(depositsOwedTotal)}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {depositsOwed.length} booking{depositsOwed.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {/* Needs your attention */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
              <h3 className="text-lg font-black text-slate-800 mb-4">🔔 Needs Your Attention</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <button
                  onClick={() => {
                    setBookingsStatusFilter("pending");
                    setBookingsSearch("");
                    setView("bookings");
                  }}
                  className="text-left p-4 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl transition-colors"
                >
                  <div className="text-2xl font-black text-orange-700">{pendingRequests.length}</div>
                  <div className="text-xs font-bold text-orange-600">Awaiting confirmation</div>
                </button>
                <button
                  onClick={() => {
                    setBookingsStatusFilter("deposit_unpaid");
                    setBookingsSearch("");
                    setView("bookings");
                  }}
                  className="text-left p-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors"
                >
                  <div className="text-2xl font-black text-amber-700">{depositsOwed.length}</div>
                  <div className="text-xs font-bold text-amber-600">Deposits unpaid</div>
                </button>
                <button
                  onClick={() => {
                    setShowOnlyMattingDue(false);
                    setIntakeFilter("not_sent");
                    setCustomerSearch("");
                    setView("customers");
                  }}
                  className="text-left p-4 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors"
                >
                  <div className="text-2xl font-black text-red-700">{formsNotSent}</div>
                  <div className="text-xs font-bold text-red-600">Forms not sent</div>
                </button>
                <button
                  onClick={() => {
                    setShowOnlyMattingDue(false);
                    setIntakeFilter("sent");
                    setCustomerSearch("");
                    setView("customers");
                  }}
                  className="text-left p-4 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-xl transition-colors"
                >
                  <div className="text-2xl font-black text-yellow-700">{formsAwaiting}</div>
                  <div className="text-xs font-bold text-yellow-600">Forms awaiting</div>
                </button>
                <button
                  onClick={() => {
                    setIntakeFilter("all");
                    setShowOnlyMattingDue(true);
                    setCustomerSearch("");
                    setView("customers");
                  }}
                  className="text-left p-4 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl transition-colors"
                >
                  <div className="text-2xl font-black text-orange-700">{mattingOutstanding}</div>
                  <div className="text-xs font-bold text-orange-600">Matting consent due</div>
                </button>
                <button
                  onClick={() => nudgePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="text-left p-4 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors"
                >
                  <div className="text-2xl font-black text-purple-700">{dueForNudge.length}</div>
                  <div className="text-xs font-bold text-purple-600">Due for rebook</div>
                </button>
              </div>
            </div>

            {/* Today's schedule + revenue trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                <h3 className="text-lg font-black text-slate-800 mb-4">📅 Today's Schedule</h3>
                {todaysSchedule.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">No bookings today.</div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {todaysSchedule.map(({ apt, schedule }) => (
                      <button
                        key={apt.id}
                        onClick={() => openUpdateModal(apt)}
                        className={`w-full text-left flex items-center justify-between p-3 rounded-xl border transition-colors hover:shadow ${
                          apt.booking_status === "completed" ? "bg-blue-50 border-blue-200" : apt.booking_status === "confirmed" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 text-sm truncate">
                            🐕 {apt.dogname} <span className="font-medium text-slate-500">— {apt.ownername}</span>
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {SERVICES.find((s) => s.id === apt.serviceid)?.name || apt.serviceid}
                            {selectedLocation === ALL_LOCATIONS ? ` · ${LOCATIONS.find((l) => l.id === apt.locationid)?.name || ""}` : ""}
                          </div>
                        </div>
                        <div className="text-sm font-black text-slate-700 shrink-0 ml-2">{schedule.timeLabel}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                <h3 className="text-lg font-black text-slate-800 mb-1">📈 Revenue — Last 8 Weeks</h3>
                <p className="text-xs text-slate-400 mb-4">From completed grooms. Weeks without a recorded price use the estimated service price.</p>
                <div className="flex items-end gap-2 h-40">
                  {weeklyRevenue.map((w, i) => (
                    <div
                      key={w.weekStart}
                      className="flex-1 flex flex-col items-center justify-end h-full relative"
                      onMouseEnter={() => setRevenueHoverIndex(i)}
                      onMouseLeave={() => setRevenueHoverIndex(null)}
                    >
                      {revenueHoverIndex === i && <div className="absolute -top-7 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap z-10">{fmtMoney(w.amount)}</div>}
                      <div className={`w-full rounded-t-[4px] transition-all ${i === weeklyRevenue.length - 1 ? "bg-emerald-600" : "bg-emerald-300"}`} style={{ height: `${Math.max(4, (w.amount / maxWeekly) * 100)}%` }} />
                      <div className="text-[10px] text-slate-400 font-bold mt-1.5 whitespace-nowrap">{w.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Customers due a rebook nudge */}
            <div ref={nudgePanelRef} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 scroll-mt-4">
              <h3 className="text-lg font-black text-slate-800 mb-1">🔔 Customers Due a Nudge</h3>
              <p className="text-xs text-slate-400 mb-4">
                It's been {rebookIntervalDays}+ days since their last groom with no new booking since. These stay here until you mark them as contacted or as no longer expected to return.
              </p>
              {dueForNudge.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">Nobody's overdue for a nudge right now. 🎉</div>
              ) : (
                <div className="space-y-3">
                  {dueForNudge.map((apt) => {
                    const daysSince = Math.floor((now.getTime() - new Date(apt.completed_at!).getTime()) / (1000 * 60 * 60 * 24));
                    const saving = nudgeSaving[apt.id!];
                    return (
                      <div key={apt.id} className="flex flex-wrap items-center justify-between gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 text-sm">
                            🐕 {apt.dogname} <span className="font-medium text-slate-500">— {apt.ownername}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            Last groom: {SERVICES.find((s) => s.id === apt.serviceid)?.name || apt.serviceid} on {new Date(apt.completed_at!).toLocaleDateString("en-GB")} ·{" "}
                            <span className="font-bold text-purple-700">{daysSince} days ago</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                          <button disabled={saving} onClick={() => handleNudgeWhatsApp(apt)} title="Opens WhatsApp with a friendly nudge message ready to send" className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg">
                            📱 WhatsApp
                          </button>
                          <button disabled={saving} onClick={() => handleMarkNudgeContacted(apt)} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg">
                            {saving ? "..." : "✓ I've Contacted Them"}
                          </button>
                          <button disabled={saving} onClick={() => handleMarkNudgeClosed(apt)} className="bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg">
                            Not Returning
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top services + record missing prices */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                <h3 className="text-lg font-black text-slate-800 mb-4">🏆 Top Services This Month</h3>
                {serviceStats.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">No completed grooms this month yet.</div>
                ) : (
                  <div className="space-y-3">
                    {serviceStats.map((s, i) => (
                      <div key={s.service.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
                          <div>
                            <div className="font-bold text-slate-800 text-sm">{s.service.name}</div>
                            <div className="text-xs text-slate-400">
                              {s.count} groom{s.count !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </div>
                        <div className="font-black text-emerald-600 shrink-0">{fmtMoney(s.revenue)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                <h3 className="text-lg font-black text-slate-800 mb-4">💷 Record Missing Prices</h3>
                {missingPrice.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">All completed grooms have a recorded price. 🎉</div>
                ) : (
                  <div className="space-y-3">
                    {missingPrice.slice(0, 5).map((apt) => (
                      <div key={apt.id} className="flex items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 text-sm truncate">🐕 {apt.dogname}</div>
                          <div className="text-xs text-slate-400">
                            {apt.completed_at ? new Date(apt.completed_at).toLocaleDateString("en-GB") : ""} · est. {fmtMoney(getBookingRevenue(apt).amount)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-slate-500 font-bold">£</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={priceFixDrafts[apt.id!] ?? ""}
                            onChange={(e) => setPriceFixDrafts((prev) => ({ ...prev, [apt.id!]: e.target.value }))}
                            placeholder={`${getBookingRevenue(apt).amount}`}
                            className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                          />
                          <button disabled={priceFixSaving[apt.id!]} onClick={() => handleQuickSetPrice(apt)} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                            {priceFixSaving[apt.id!] ? "..." : "Save"}
                          </button>
                        </div>
                      </div>
                    ))}
                    {missingPrice.length > 5 && <p className="text-xs text-slate-400 text-center">+{missingPrice.length - 5} more — open each booking to record its price.</p>}
                  </div>
                )}
              </div>
            </div>

            {/* Location breakdown */}
            {selectedLocation === ALL_LOCATIONS && LOCATIONS.length > 1 && (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                <h3 className="text-lg font-black text-slate-800 mb-4">📍 This Month by Location</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {locationStats.map((l) => (
                    <div key={l.location.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="font-bold text-slate-800 text-sm">{l.location.name}</div>
                      <div className="text-2xl font-black text-teal-600 mt-1">{fmtMoney(l.revenue)}</div>
                      <div className="text-xs text-slate-400">
                        {l.count} groom{l.count !== 1 ? "s" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {view === "bookings" && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="font-bold text-slate-600">Bookings</h2>
            </div>
            <div className="flex gap-2">
              <button onClick={openAddModal} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold text-sm transition-all">
                + Add New
              </button>
              <button onClick={() => exportAppointmentsToExcel(filteredAppointments)} className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg font-bold text-sm transition-all">
                ⬇️ Export to CSV
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b">
            <input
              value={bookingsSearch}
              onChange={(e) => setBookingsSearch(e.target.value)}
              placeholder="🔍 Search dog name, owner name or phone number..."
              className="w-full px-5 py-3 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-teal-500 font-medium"
            />
            {bookingsSearch.trim() && (
              <p className="text-xs text-slate-500 font-bold mt-2">
                {filteredAppointments.length} booking{filteredAppointments.length !== 1 ? "s" : ""} found
                <button onClick={() => setBookingsSearch("")} className="ml-3 text-teal-600 hover:text-teal-800 underline">Clear</button>
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {([
                ["all", "All"],
                ["pending", "Awaiting confirmation"],
                ["deposit_unpaid", "Deposit unpaid"],
                ["confirmed", "Confirmed"],
                [
                  "needs_time",
                  `⏰ Needs time set (${appointments.filter((a) => (selectedLocation === ALL_LOCATIONS || a.locationid === selectedLocation) && a.status !== "cancelled" && a.booking_status !== "cancelled" && !a.confirmed_time).length})`,
                ],
                ["due_for_rebook", `Due for rebook (${appointments.filter((a) => (selectedLocation === ALL_LOCATIONS || a.locationid === selectedLocation) && isDueForNudge(a)).length})`],
                ["completed", "Completed"],
                ["cancelled", "Cancelled"],
              ] as [BookingStatusFilter, string][]).map(([value, label]) => (
                <button key={value} onClick={() => setBookingsStatusFilter(value)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${bookingsStatusFilter === value ? "bg-slate-800 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {label}
                </button>
              ))}
              {bookingsStatusFilter !== "all" && (
                <button onClick={() => setBookingsStatusFilter("all")} className="px-3 py-1.5 rounded-lg text-xs font-bold text-teal-600 hover:text-teal-800 underline">
                  Clear filter
                </button>
              )}
            </div>
          </div>

          {/* Pagination and sorting controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2 border-b bg-slate-50">
            <div className="flex items-center gap-2">
              <label className="font-bold text-xs text-slate-600">Rows per page:</label>
              <button className={`px-2 py-1 rounded border text-xs ${pageSize === 10 ? 'bg-emerald-100 text-emerald-700' : 'bg-white hover:bg-slate-100'}`} onClick={() => { setPageSize(10); setCurrentPage(1); }}>10</button>
              <button className={`px-2 py-1 rounded border text-xs ${pageSize === 20 ? 'bg-emerald-100 text-emerald-700' : 'bg-white hover:bg-slate-100'}`} onClick={() => { setPageSize(20); setCurrentPage(1); }}>20</button>
              <button className={`px-2 py-1 rounded border text-xs ${pageSize === 30 ? 'bg-emerald-100 text-emerald-700' : 'bg-white hover:bg-slate-100'}`} onClick={() => { setPageSize(30); setCurrentPage(1); }}>30</button>
            </div>
            <div className="text-xs text-slate-400 font-medium">Click a column heading to sort (Date, Dog &amp; Owner, Deposit, Status)</div>
            <div className="flex items-center gap-2">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-2 py-1 rounded border text-xs bg-white hover:bg-slate-100">Prev</button>
              <span className="text-xs">Page {currentPage} of {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="px-2 py-1 rounded border text-xs bg-white hover:bg-slate-100">Next</button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-slate-500">Loading bookings...</div>
          ) : bookingsStatusFilter === "needs_time" ? (
            <div className="p-4">
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                These were confirmed before the exact time-slot system existed, so no real time was ever recorded — only a rough "Morning/Afternoon/Evening" preference. Set the actual time below (defaulted to a best guess). If the appointment already happened, use <strong>Save &amp; Mark Completed</strong> to close it out and record the price — that also lets it count properly in your revenue reports.
              </div>
              <div className="space-y-3">
                {paginatedAppointments.map((apt) => {
                  const draft = getLegacyTimeDraft(apt);
                  const saving = legacyTimeSaving[apt.id!];
                  return (
                    <div key={apt.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="mb-3">
                        <div className="font-bold text-slate-800">
                          🐕 {apt.dogname} <span className="font-medium text-slate-500">— {apt.ownername}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Originally booked {apt.date} ·{" "}
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">{apt.requested_time_preference || apt.time || "no preference"}</span>
                          {" · "}
                          {SERVICES.find((s) => s.id === apt.serviceid)?.name || apt.serviceid}
                          {selectedLocation === ALL_LOCATIONS ? ` · ${LOCATIONS.find((l) => l.id === apt.locationid)?.name || ""}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date</label>
                          <input type="date" value={draft.date} onChange={(e) => setLegacyTimeDraft(apt.id!, { date: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Time slot</label>
                          <select value={draft.time} onChange={(e) => setLegacyTimeDraft(apt.id!, { time: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
                            {SLOT_TIMES.map((slot) => (
                              <option key={slot} value={slot}>
                                {slot}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button disabled={saving} onClick={() => handleSaveLegacyTime(apt, false)} className="bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">
                          {saving ? "Saving..." : "Save Time"}
                        </button>
                        <button disabled={saving} onClick={() => handleSaveLegacyTime(apt, true)} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">
                          Save &amp; Mark Completed
                        </button>
                        <button onClick={() => openUpdateModal(apt)} className="text-xs font-bold text-teal-600 hover:text-teal-800 underline ml-auto">
                          Open full details
                        </button>
                      </div>
                    </div>
                  );
                })}
                {paginatedAppointments.length === 0 && <div className="text-center py-10 text-slate-400">🎉 All bookings have a real time set.</div>}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[980px]">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-4 font-bold text-slate-600 cursor-pointer select-none hover:text-teal-600" onClick={() => toggleBookingSort("owner")}>Dog & Owner{sortIndicator("owner")}</th>
                    <th className="p-4 font-bold text-slate-600">Service</th>
                    <th className="p-4 font-bold text-slate-600">Requested</th>
                    <th className="p-4 font-bold text-slate-600 cursor-pointer select-none hover:text-teal-600" onClick={() => toggleBookingSort("date")}>Confirmed Date{sortIndicator("date")}</th>
                    <th className="p-4 font-bold text-slate-600">Time</th>
                    <th className="p-4 font-bold text-slate-600">Duration</th>
                    <th className="p-4 font-bold text-slate-600 cursor-pointer select-none hover:text-teal-600" onClick={() => toggleBookingSort("status")}>Status{sortIndicator("status")}</th>
                    <th className="p-4 font-bold text-slate-600 cursor-pointer select-none hover:text-teal-600" onClick={() => toggleBookingSort("deposit")}>Deposit{sortIndicator("deposit")}</th>
                    <th className="p-4 font-bold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAppointments.map((app) => {
                    const isConfirmed = Boolean(app.is_confirmed || app.status === "confirmed");
                    const serviceName = SERVICES.find((s) => s.id === app.serviceid)?.name || app.serviceid;

                    // Color-code rows based on booking_status
                    let rowClass = "bg-orange-50 hover:bg-orange-100"; // Default: pending
                    if (app.booking_status === "confirmed") {
                      rowClass = "bg-emerald-50 hover:bg-emerald-100"; // Green: confirmed
                    } else if (app.booking_status === "completed") {
                      rowClass = "bg-blue-50 hover:bg-blue-100"; // Blue: completed
                    } else if (app.booking_status === "due_for_rebook") {
                      rowClass = "bg-amber-50 hover:bg-amber-100"; // Yellow: due for rebook
                    } else if (app.booking_status === "cancelled") {
                      rowClass = "bg-slate-100 hover:bg-slate-200"; // Grey: cancelled
                    } else if (isConfirmed) {
                      rowClass = "bg-emerald-50 hover:bg-emerald-100"; // Green: legacy confirmed
                    }

                    // Check if appointment is in the past and confirmed (eligible for "Mark as Completed")
                    const isPastAppointment = app.confirmed_date && new Date(app.confirmed_date) < new Date();
                    const canMarkCompleted = isPastAppointment && app.booking_status === "confirmed";

                    return (
                      <tr key={app.id} className={`border-b ${rowClass}`}>
                        <td className="p-4">
                          <div className="font-bold">{app.dogname}</div>
                          <div className="text-xs text-slate-600">
                            {app.ownername} ({app.dogbreed || "Breed not set"})
                          </div>
                        </td>
                        <td className="p-4 text-sm">{serviceName}</td>
                        <td className="p-4 text-sm">{app.requested_time_preference || app.time || "—"}</td>
                        <td className="p-4 text-sm">{app.confirmed_date || "—"}</td>
                        <td className="p-4 text-sm">{app.confirmed_time || ""}</td>
                        <td className="p-4 text-sm">{app.confirmed_duration_minutes ? `${app.confirmed_duration_minutes} mins` : "—"}</td>
                        <td className="p-4">
                          {app.booking_status === "confirmed" && (
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">Confirmed</span>
                          )}
                          {app.booking_status === "completed" && (
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">Completed</span>
                          )}
                          {app.booking_status === "due_for_rebook" && (
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">Due Rebook</span>
                          )}
                          {app.booking_status === "cancelled" && (
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600">Cancelled</span>
                          )}
                          {(!app.booking_status || app.booking_status === "pending") && (
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700">Pending</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${app.deposit_paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`} title={app.deposit_notes || ""}>
                            {app.deposit_paid ? "✓ Paid" : "Pending"}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => openUpdateModal(app)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded-md text-xs font-bold">
                              Update
                            </button>
                            {canMarkCompleted && (
                              <button onClick={() => handleMarkCompleted(app)} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-md text-xs font-bold">
                                ✓ Complete
                              </button>
                            )}
                            {app.booking_status === "due_for_rebook" && (
                              <button onClick={() => handleRebook(app)} className="bg-amber-100 hover:bg-amber-200 text-amber-700 px-3 py-1 rounded-md text-xs font-bold">
                                Rebook
                              </button>
                            )}
                            <button onClick={() => handleDeleteBooking(app)} className="bg-rose-100 hover:bg-rose-200 text-rose-700 px-3 py-1 rounded-md text-xs font-bold">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {paginatedAppointments.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-20 text-center text-slate-400">
                        No bookings yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "unavailable" && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
          <h2 className="text-2xl font-black mb-6 text-slate-800">Closed Dates</h2>
          <p className="text-slate-600 mb-8">Mark specific dates as unavailable. Customers won't be able to book on these dates.</p>

          <div className="mb-8">
            <label className="block text-sm font-bold text-slate-700 mb-3">Add a Closed Date</label>
            <div className="flex gap-4">
              <input type="date" id="newDate" className="flex-1 px-6 py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500" />
              <input type="text" placeholder="Reason (e.g., Holiday, Renovation)" id="newReason" className="flex-1 px-6 py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500" />
              <button
                onClick={() => {
                  const dateInput = document.getElementById("newDate") as HTMLInputElement;
                  const reasonInput = document.getElementById("newReason") as HTMLInputElement;
                  if (dateInput.value) {
                    saveUnavailableDay(dateInput.value, reasonInput.value).then(() => {
                      loadData();
                      dateInput.value = "";
                      reasonInput.value = "";
                    });
                  }
                }}
                className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 rounded-lg font-bold transition-all"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Unavailable Dates</h3>
            {unavailableDays.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {unavailableDays.map((date) => (
                  <div key={date} className="bg-rose-50 border border-rose-200 p-4 rounded-lg flex justify-between items-center">
                    <span className="font-bold text-slate-800">{date}</span>
                    <button onClick={() => removeUnavailableDay(date).then(() => loadData())} className="text-rose-600 hover:text-rose-700 font-bold">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400">No unavailable dates set.</p>
            )}
          </div>

          <div className="border-t pt-8 mt-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Recurring Unavailable Days</h3>
            <p className="text-slate-600 mb-6">Select days of the week that are permanently closed</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {DAYS.map((day, idx) => (
                <button
                  key={idx}
                  onClick={async () => {
                    try {
                      if (unavailableWeekdays.includes(idx)) {
                        await removeUnavailableWeekday(idx);
                      } else {
                        await saveUnavailableWeekday(idx, "Closed on " + day);
                      }
                      await loadData();
                    } catch (err) {
                      console.error("Error:", err);
                      alert("Error saving. Please try again.");
                    }
                  }}
                  className={`p-4 rounded-lg font-bold text-sm transition-all border-2 ${unavailableWeekdays.includes(idx) ? "bg-rose-100 border-rose-500 text-rose-700" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"}`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === "services" && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
          <h2 className="text-2xl font-black mb-6 text-slate-800">Manage Services</h2>

          {editingService ? (
            <div className="bg-emerald-50 border-2 border-emerald-200 p-8 rounded-2xl mb-8">
              <h3 className="text-xl font-bold text-slate-800 mb-6">Edit Service</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <input type="text" placeholder="Service Name" value={editingService.name || ""} onChange={(e) => setEditingService({ ...editingService, name: e.target.value })} className="px-6 py-3 bg-white border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
                <input type="text" placeholder="Price (e.g., From $65)" value={editingService.price || ""} onChange={(e) => setEditingService({ ...editingService, price: e.target.value })} className="px-6 py-3 bg-white border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
                <input type="text" placeholder="Duration (e.g., 2-3 Hours)" value={editingService.duration || ""} onChange={(e) => setEditingService({ ...editingService, duration: e.target.value })} className="px-6 py-3 bg-white border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
                <input type="text" placeholder="Image URL" value={editingService.image || ""} onChange={(e) => setEditingService({ ...editingService, image: e.target.value })} className="px-6 py-3 bg-white border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
                <textarea placeholder="Description" value={editingService.description || ""} onChange={(e) => setEditingService({ ...editingService, description: e.target.value })} className="col-span-1 md:col-span-2 px-6 py-3 bg-white border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold min-h-24" />
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => {
                    setServices(services.map((s) => (s.id === editingService.id ? editingService : s)));
                    setEditingService(null);
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold transition-all"
                >
                  Save Changes
                </button>
                <button onClick={() => setEditingService(null)} className="flex-1 bg-slate-300 hover:bg-slate-400 text-slate-700 px-8 py-3 rounded-lg font-bold transition-all">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border-2 border-emerald-200 p-8 rounded-2xl mb-8">
              <h3 className="text-xl font-bold text-slate-800 mb-6">Add New Service</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <input type="text" placeholder="Service Name" value={newService.name || ""} onChange={(e) => setNewService({ ...newService, name: e.target.value })} className="px-6 py-3 bg-white border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
                <input type="text" placeholder="Price (e.g., From $65)" value={newService.price || ""} onChange={(e) => setNewService({ ...newService, price: e.target.value })} className="px-6 py-3 bg-white border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
                <input type="text" placeholder="Duration (e.g., 2-3 Hours)" value={newService.duration || ""} onChange={(e) => setNewService({ ...newService, duration: e.target.value })} className="px-6 py-3 bg-white border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
                <input type="text" placeholder="Image URL" value={newService.image || ""} onChange={(e) => setNewService({ ...newService, image: e.target.value })} className="px-6 py-3 bg-white border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
                <textarea placeholder="Description" value={newService.description || ""} onChange={(e) => setNewService({ ...newService, description: e.target.value })} className="col-span-1 md:col-span-2 px-6 py-3 bg-white border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold min-h-24" />
              </div>
              <button
                onClick={() => {
                  if (newService.name && newService.price) {
                    const serviceId = `service-${Date.now()}`;
                    setServices([
                      ...services,
                      {
                        id: serviceId,
                        name: newService.name,
                        price: newService.price,
                        duration: newService.duration || "",
                        description: newService.description || "",
                        image: newService.image || "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&q=80&w=800",
                      } as Service,
                    ]);
                    setNewService({});
                  } else {
                    alert("Please fill in at least Name and Price");
                  }
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold transition-all mt-6"
              >
                Add Service
              </button>
            </div>
          )}

          <h3 className="text-xl font-bold text-slate-800 mb-4">Current Services</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {services.map((service) => (
              <div key={service.id} className="bg-slate-50 border border-slate-200 p-6 rounded-xl">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-bold text-slate-800 text-lg">{service.name}</h4>
                    <p className="text-emerald-600 font-bold">{service.price}</p>
                  </div>
                  <span className="text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full font-bold">{service.duration}</span>
                </div>
                <p className="text-sm text-slate-600 mb-4">{service.description}</p>
                <div className="flex gap-2">
                  <button onClick={() => setEditingService(service)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm transition-all">
                    Edit
                  </button>
                  <button onClick={() => setServices(services.filter((s) => s.id !== service.id))} className="flex-1 bg-rose-100 hover:bg-rose-200 text-rose-700 px-4 py-2 rounded-lg font-bold text-sm transition-all">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showUpdateModal && activeBooking && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-slate-800">Update Booking</h3>
              <button onClick={closeUpdateModal} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input value={editForm.ownername} onChange={(e) => setEditForm({ ...editForm, ownername: e.target.value })} placeholder="Owner name" className="px-4 py-3 border rounded-lg" />
              <input value={editForm.dogname} onChange={(e) => setEditForm({ ...editForm, dogname: e.target.value })} placeholder="Dog name" className="px-4 py-3 border rounded-lg" />
              <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="Email" className="px-4 py-3 border rounded-lg" />
              <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Phone" className="px-4 py-3 border rounded-lg" />
              <input value={editForm.dogbreed} onChange={(e) => setEditForm({ ...editForm, dogbreed: e.target.value })} placeholder="Dog breed" className="px-4 py-3 border rounded-lg" />
              <select value={editForm.serviceid} onChange={(e) => setEditForm({ ...editForm, serviceid: e.target.value })} className="px-4 py-3 border rounded-lg">
                {SERVICES.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
              <select value={editForm.requested_time_preference} onChange={(e) => setEditForm({ ...editForm, requested_time_preference: e.target.value })} className="px-4 py-3 border rounded-lg">
                <option value="">Requested slot</option>
                {SLOT_TIMES.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot} (2 hrs)
                  </option>
                ))}
                <option value="Morning">Morning (legacy)</option>
                <option value="Afternoon">Afternoon (legacy)</option>
                <option value="Evening">Evening (legacy)</option>
              </select>
              <input type="date" value={editForm.confirmed_date} onChange={(e) => setEditForm({ ...editForm, confirmed_date: e.target.value })} className="px-4 py-3 border rounded-lg" />
              <select value={SLOT_TIMES.includes(editForm.confirmed_time) ? editForm.confirmed_time : ""} onChange={(e) => setEditForm({ ...editForm, confirmed_time: e.target.value, confirmed_duration_minutes: 120 })} className="px-4 py-3 border rounded-lg">
                <option value="">Quick slot (2 hrs)...</option>
                {SLOT_TIMES.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot} (2 hrs)
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Or exact time</label>
                <input type="time" value={editForm.confirmed_time} onChange={(e) => setEditForm({ ...editForm, confirmed_time: e.target.value })} className="px-4 py-3 border rounded-lg" />
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">for</label>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={editForm.confirmed_duration_minutes}
                  onChange={(e) => setEditForm({ ...editForm, confirmed_duration_minutes: Math.max(15, Number(e.target.value) || 120) })}
                  className="px-4 py-3 border rounded-lg w-24"
                />
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">mins</label>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Number of dogs</label>
                <input
                  type="number"
                  min={1}
                  value={editForm.number_of_dogs}
                  onChange={(e) => {
                    const n = Math.max(1, Number(e.target.value) || 1);
                    setEditForm({ ...editForm, number_of_dogs: n, deposit_amount: n * 20 });
                  }}
                  className="px-4 py-3 border rounded-lg w-full"
                />
              </div>
            </div>

            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-bold text-blue-900 mb-1">Estimated Price</h4>
              <p className="text-xs text-blue-700 mb-3">Defaults to the selected service × number of dogs, but you can change it — e.g. to quote the customer something different up front.</p>
              <div className="flex items-center gap-2">
                <span className="text-blue-700 font-bold">£</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.estimated_price}
                  onChange={(e) => setEditForm({ ...editForm, estimated_price: e.target.value })}
                  placeholder={`${getServiceBasePrice(editForm.serviceid) * editForm.number_of_dogs}`}
                  className="px-4 py-2 border border-blue-200 rounded-lg w-40"
                />
              </div>
            </div>

            <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <h4 className="text-sm font-bold text-slate-700 mb-2">Notes</h4>
              <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notes" className="w-full px-4 py-3 border rounded-lg min-h-24" />
            </div>

            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="text-sm font-bold text-amber-900 mb-3">
                £{editForm.deposit_amount} Deposit Status
                {editForm.number_of_dogs > 1 && <span className="font-normal text-amber-700"> (£20 × {editForm.number_of_dogs} dogs)</span>}
              </h4>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.deposit_paid}
                    onChange={(e) => setEditForm({ ...editForm, deposit_paid: e.target.checked })}
                    className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-amber-900">Deposit Paid</span>
                </label>
                {editForm.deposit_paid && (
                  <span className="text-xs text-emerald-600 font-semibold">✓ Confirmed</span>
                )}
              </div>
              <input
                type="text"
                value={editForm.deposit_notes}
                onChange={(e) => setEditForm({ ...editForm, deposit_notes: e.target.value })}
                placeholder="Deposit notes (optional - payment method, date, etc.)"
                className="mt-3 w-full px-3 py-2 border border-amber-200 rounded-lg text-sm"
              />
            </div>

            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <h4 className="text-sm font-bold text-emerald-900 mb-1">Actual Price Charged</h4>
              <p className="text-xs text-emerald-700 mb-3">
                Leave blank to use the estimated price (£{getServiceBasePrice(editForm.serviceid) * editForm.number_of_dogs}) in revenue reports. Fill this in once you know what was actually charged (matting, extras, etc.).
              </p>
              <div className="flex items-center gap-2">
                <span className="text-emerald-700 font-bold">£</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.actual_price}
                  onChange={(e) => setEditForm({ ...editForm, actual_price: e.target.value })}
                  placeholder={`${getServiceBasePrice(editForm.serviceid) * editForm.number_of_dogs} (estimate)`}
                  className="px-4 py-2 border border-emerald-200 rounded-lg w-40"
                />
              </div>
            </div>

            <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <h4 className="text-sm font-bold text-slate-700 mb-3">📷 Photos</h4>
              {loadingPhotos ? (
                <p className="text-xs text-slate-400">Loading photos...</p>
              ) : (
                <>
                  {activeBookingPhotos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                      {activeBookingPhotos.map((photo) => (
                        <div key={photo.id} className="relative group">
                          <a href={photo.url} target="_blank" rel="noreferrer">
                            <img src={photo.url} alt={photo.photo_type} className="w-full h-24 object-cover rounded-lg border border-slate-200" />
                          </a>
                          <span
                            className={`absolute top-1 left-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              photo.photo_type === "before" ? "bg-amber-100 text-amber-700" : photo.photo_type === "after" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {photo.photo_type}
                          </span>
                          <button
                            onClick={() => handleDeletePhoto(photo)}
                            title="Remove photo"
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/60 hover:bg-rose-600 text-white text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={newPhotoType} onChange={(e) => setNewPhotoType(e.target.value as "before" | "after" | "other")} className="px-3 py-2 border rounded-lg text-sm">
                      <option value="before">Before</option>
                      <option value="after">After</option>
                      <option value="other">Other</option>
                    </select>
                    <label className={`px-4 py-2 rounded-lg text-sm font-bold cursor-pointer ${uploadingPhoto ? "bg-slate-200 text-slate-400" : "bg-slate-700 hover:bg-slate-800 text-white"}`}>
                      {uploadingPhoto ? "Uploading..." : "+ Add Photo"}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={uploadingPhoto}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadPhoto(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button disabled={isWorking} onClick={saveBookingDetails} className="bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                Save Details
              </button>
              <button disabled={isWorking} onClick={() => confirmBooking("whatsapp")} title="Free — opens WhatsApp with the confirmation ready to send" className="bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                📱 Confirm + WhatsApp
              </button>
              <button disabled={isWorking} onClick={() => confirmBooking("sms")} title="Sends a text automatically (~4p)" className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                💬 Confirm + SMS
              </button>
              <button disabled={isWorking} onClick={() => confirmBooking("none")} title="Marks it confirmed without sending anything — e.g. for a paper booking the customer already knows about" className="bg-slate-500 hover:bg-slate-600 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                ✓ Confirm (No Message)
              </button>
              <button disabled={isWorking} onClick={() => activeBooking && openEmailModal(activeBooking)} title="Free — sends from the business email address, not a personal inbox" className="bg-slate-600 hover:bg-slate-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                📧 Email Customer
              </button>
              <button onClick={closeUpdateModal} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2 rounded-lg font-bold">
                Close
              </button>
            </div>

            {activeBooking?.booking_status !== "cancelled" && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Cancel this booking</p>
                <div className="flex flex-wrap gap-3">
                  <button disabled={isWorking} onClick={() => activeBooking && handleCancelBooking(activeBooking, "whatsapp")} title="Free — opens WhatsApp with a cancellation message ready to send" className="bg-white border border-rose-300 hover:bg-rose-50 disabled:opacity-60 text-rose-700 px-4 py-2 rounded-lg text-sm font-bold">
                    📱 Cancel + WhatsApp
                  </button>
                  <button disabled={isWorking} onClick={() => activeBooking && handleCancelBooking(activeBooking, "sms")} title="Sends a cancellation text automatically (~4p)" className="bg-white border border-rose-300 hover:bg-rose-50 disabled:opacity-60 text-rose-700 px-4 py-2 rounded-lg text-sm font-bold">
                    💬 Cancel + SMS
                  </button>
                  <button disabled={isWorking} onClick={() => activeBooking && handleCancelBooking(activeBooking, "none")} title="Cancel without notifying the customer" className="bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-60 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold">
                    Cancel Only
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showDepositModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={() => setShowDepositModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💰</span>
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">Deposit Reminder</h3>
              <p className="text-sm text-slate-600">Has the customer paid their £{editForm.deposit_amount} deposit{editForm.number_of_dogs > 1 ? ` (£20 × ${editForm.number_of_dogs} dogs)` : ""}?</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleDepositPaid}
                disabled={isWorking}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-3 rounded-lg font-bold transition-colors"
              >
                ✓ Yes, Deposit Paid
              </button>
              <button
                onClick={handleSkipDeposit}
                disabled={isWorking}
                className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-3 rounded-lg font-bold transition-colors"
              >
                Skip for Now
              </button>
              <button
                onClick={() => setShowDepositModal(false)}
                disabled={isWorking}
                className="w-full text-slate-500 hover:text-slate-700 px-5 py-2 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmailModal && activeBooking && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-xl font-black text-slate-800">📧 Email {activeBooking.ownername}</h3>
              <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Sends to {activeBooking.email} from the business email address — replies will land in {EMAIL_CUSTOMER_REPLY_TO}, not spam-flagged like a personal-inbox reply.
            </p>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Subject</label>
            <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-lg mb-3" />
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Message</label>
            <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} rows={8} className="w-full px-4 py-3 border border-slate-200 rounded-lg" />
            <div className="flex gap-3 mt-4">
              <button disabled={emailSending} onClick={handleSendCustomEmail} className="bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                {emailSending ? "Sending..." : "Send Email"}
              </button>
              <button onClick={() => setShowEmailModal(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2 rounded-lg font-bold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {completingBooking && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={() => setCompletingBooking(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✂️</span>
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">Mark {completingBooking.dogname} as Completed</h3>
              <p className="text-sm text-slate-600">What was actually charged for this groom? This is what counts toward your revenue reports.</p>
            </div>

            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-slate-700 font-bold text-lg">£</span>
              <input
                type="number"
                min={0}
                step="0.01"
                autoFocus
                value={completePriceInput}
                onChange={(e) => setCompletePriceInput(e.target.value)}
                placeholder={`${getServiceBasePrice(completingBooking.serviceid) * (completingBooking.number_of_dogs || 1)}`}
                className="px-4 py-3 border border-slate-200 rounded-lg w-32 text-center text-lg font-bold"
              />
            </div>
            <p className="text-xs text-slate-400 text-center mb-6">Leave blank to use the estimated price (£{getServiceBasePrice(completingBooking.serviceid) * (completingBooking.number_of_dogs || 1)})</p>

            <div className="space-y-3">
              <button
                onClick={confirmMarkCompleted}
                disabled={isWorking}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-3 rounded-lg font-bold transition-colors"
              >
                {isWorking ? "Saving..." : "✓ Mark Completed"}
              </button>
              <button
                onClick={() => setCompletingBooking(null)}
                disabled={isWorking}
                className="w-full text-slate-500 hover:text-slate-700 px-5 py-2 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {view === "settings" && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
          <h2 className="text-2xl font-black mb-6 text-slate-800">Reminder Settings</h2>
          <p className="text-slate-600 mb-8">Configure automatic email reminders for rebookings and daily summaries.</p>

          <div className="space-y-8">
            {/* 28-Day Rebooking Reminders */}
            <div className="p-6 bg-emerald-50 border-2 border-emerald-200 rounded-2xl">
              <h3 className="text-xl font-bold text-slate-800 mb-4">28-Day Rebooking Reminders</h3>
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={reminderSettings.enabled_28day}
                    onChange={(e) => setReminderSettings({ ...reminderSettings, enabled_28day: e.target.checked })}
                    className="w-5 h-5 rounded border-emerald-300 text-emerald-600"
                  />
                  <span className="font-medium text-slate-700">Enable 28-day rebooking reminders</span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Days Interval</label>
                    <input
                      type="number"
                      value={reminderSettings.days_interval}
                      onChange={(e) => setReminderSettings({ ...reminderSettings, days_interval: Number(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                      min={1}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Reminder Email</label>
                    <input
                      type="email"
                      value={reminderSettings.reminder_email}
                      onChange={(e) => setReminderSettings({ ...reminderSettings, reminder_email: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={reminderSettings.split_by_location}
                    onChange={(e) => setReminderSettings({ ...reminderSettings, split_by_location: e.target.checked })}
                    className="w-5 h-5 rounded border-emerald-300 text-emerald-600"
                  />
                  <span className="font-medium text-slate-700">Split emails by location</span>
                </label>
              </div>
            </div>

            {/* Next-Day Summary */}
            <div className="p-6 bg-blue-50 border-2 border-blue-200 rounded-2xl">
              <h3 className="text-xl font-bold text-slate-800 mb-4">Next-Day Summary</h3>
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={reminderSettings.enabled_next_day}
                    onChange={(e) => setReminderSettings({ ...reminderSettings, enabled_next_day: e.target.checked })}
                    className="w-5 h-5 rounded border-blue-300 text-blue-600"
                  />
                  <span className="font-medium text-slate-700">Enable next-day summary emails</span>
                </label>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Send Time (24-hour format)</label>
                  <input
                    type="time"
                    value={reminderSettings.next_day_time}
                    onChange={(e) => setReminderSettings({ ...reminderSettings, next_day_time: e.target.value })}
                    className="px-4 py-2 border rounded-lg"
                  />
                  <p className="text-xs text-slate-500 mt-1">Currently set to {reminderSettings.next_day_time}</p>
                </div>
              </div>
            </div>

            {/* Weekend Bookings */}
            <div className="p-6 bg-teal-50 border-2 border-teal-200 rounded-2xl">
              <h3 className="text-xl font-bold text-slate-800 mb-1">Weekend Bookings</h3>
              <p className="text-slate-500 text-sm mb-4">
                Weekdays (Mon–Fri) are always bookable. Use this to allow or stop customers booking Saturday/Sunday appointments online.
              </p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={weekendsEnabled}
                  disabled={weekendsSaving}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    setWeekendsEnabled(enabled);
                    setWeekendsSaving(true);
                    try {
                      await updateWeekendBookingsEnabled(enabled);
                    } catch (err: any) {
                      setWeekendsEnabled(!enabled);
                      alert(`Could not update setting: ${err.message}`);
                    } finally {
                      setWeekendsSaving(false);
                    }
                  }}
                  className="w-5 h-5 rounded border-teal-300 text-teal-600"
                />
                <span className="font-medium text-slate-700">Allow customers to book weekend (Saturday/Sunday) appointments</span>
                {weekendsSaving && <span className="text-xs text-teal-600 font-bold">Saving…</span>}
              </label>
            </div>

            {/* Holiday Mode */}
            <div className="p-6 bg-amber-50 border-2 border-amber-300 rounded-2xl">
              <h3 className="text-xl font-bold text-slate-800 mb-1">Holiday Mode</h3>
              <p className="text-slate-500 text-sm mb-4">
                While holiday mode is active the booking form is hidden and visitors see an "away" message instead.
                Leave both dates blank to turn it off.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={holidayForm.holiday_start}
                    onChange={(e) => setHolidayForm({ ...holidayForm, holiday_start: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">End Date</label>
                  <input
                    type="date"
                    value={holidayForm.holiday_end}
                    onChange={(e) => setHolidayForm({ ...holidayForm, holiday_end: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
              </div>
              {holidayForm.holiday_start && holidayForm.holiday_end && (
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-amber-700 bg-amber-100 rounded-xl px-4 py-3">
                  <span>🌴</span>
                  <span>
                    Holiday mode active: {holidayForm.holiday_start} to {holidayForm.holiday_end}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-4">
                <button
                  disabled={holidaySaving}
                  onClick={async () => {
                    setHolidaySaving(true);
                    setHolidayStatus("idle");
                    try {
                      await updateHolidaySettings(
                        holidayForm.holiday_start || null,
                        holidayForm.holiday_end || null
                      );
                      setHolidayStatus("saved");
                    } catch {
                      setHolidayStatus("error");
                    } finally {
                      setHolidaySaving(false);
                    }
                  }}
                  className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-bold"
                >
                  {holidaySaving ? "Saving…" : "Save Holiday Dates"}
                </button>
                <button
                  disabled={holidaySaving}
                  onClick={async () => {
                    setHolidayForm({ holiday_start: "", holiday_end: "" });
                    setHolidaySaving(true);
                    setHolidayStatus("idle");
                    try {
                      await updateHolidaySettings(null, null);
                      setHolidayStatus("saved");
                    } catch {
                      setHolidayStatus("error");
                    } finally {
                      setHolidaySaving(false);
                    }
                  }}
                  className="text-slate-500 hover:text-slate-700 px-4 py-3 rounded-lg font-bold underline text-sm disabled:opacity-50"
                >
                  Clear (turn off)
                </button>
                {holidayStatus === "saved" && <span className="text-emerald-600 text-sm font-bold">Saved!</span>}
                {holidayStatus === "error" && <span className="text-rose-600 text-sm font-bold">Failed to save.</span>}
              </div>
            </div>

            {/* Advert Banner */}
            <div className="p-6 bg-emerald-50 border-2 border-emerald-300 rounded-2xl">
              <h3 className="text-xl font-bold text-slate-800 mb-1">Advert Banner</h3>
              <p className="text-slate-500 text-sm mb-4">
                Shows a green banner at the top of the home page between the dates set. Leave blank to turn off.
                Won't show during holiday mode.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-bold text-slate-700 mb-2">Banner Text</label>
                <input
                  type="text"
                  placeholder="e.g. 10% off all grooms this month — book now!"
                  value={advertForm.advert_text}
                  onChange={(e) => setAdvertForm({ ...advertForm, advert_text: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={advertForm.advert_start}
                    onChange={(e) => setAdvertForm({ ...advertForm, advert_start: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">End Date</label>
                  <input
                    type="date"
                    value={advertForm.advert_end}
                    onChange={(e) => setAdvertForm({ ...advertForm, advert_end: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Banner Colour</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={advertForm.advert_color}
                      onChange={(e) => setAdvertForm({ ...advertForm, advert_color: e.target.value })}
                      className="w-12 h-10 rounded cursor-pointer border border-slate-200 p-0.5"
                    />
                    <span className="text-sm font-mono text-slate-600">{advertForm.advert_color}</span>
                  </div>
                </div>
              </div>
              {advertForm.advert_text && (
                <div
                  className="mb-4 relative overflow-hidden rounded-xl text-white text-center py-5 px-6"
                  style={{ backgroundColor: advertForm.advert_color }}
                >
                  <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)", backgroundSize: "10px 10px" }} />
                  <div className="relative flex items-center justify-center">
                    <p className="font-black text-lg tracking-tight">{advertForm.advert_text}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4">
                <button
                  disabled={advertSaving}
                  onClick={async () => {
                    setAdvertSaving(true);
                    setAdvertStatus("idle");
                    setAdvertError("");
                    try {
                      await updateAdvertSettings(
                        advertForm.advert_start || null,
                        advertForm.advert_end || null,
                        advertForm.advert_text || null,
                        advertForm.advert_color || null
                      );
                      setAdvertStatus("saved");
                    } catch (e: any) {
                      setAdvertStatus("error");
                      setAdvertError(e?.message || "Unknown error");
                    } finally {
                      setAdvertSaving(false);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-bold"
                >
                  {advertSaving ? "Saving…" : "Save Advert"}
                </button>
                <button
                  disabled={advertSaving}
                  onClick={async () => {
                    setAdvertForm({ advert_start: "", advert_end: "", advert_text: "", advert_color: "#EAB308" });
                    setAdvertSaving(true);
                    setAdvertStatus("idle");
                    try {
                      await updateAdvertSettings(null, null, null, null);
                      setAdvertStatus("saved");
                    } catch {
                      setAdvertStatus("error");
                    } finally {
                      setAdvertSaving(false);
                    }
                  }}
                  className="text-slate-500 hover:text-slate-700 px-4 py-3 rounded-lg font-bold underline text-sm disabled:opacity-50"
                >
                  Clear (turn off)
                </button>
                {advertStatus === "saved" && <span className="text-emerald-600 text-sm font-bold">Saved!</span>}
                {advertStatus === "error" && <span className="text-rose-600 text-sm font-bold">Failed to save: {advertError}</span>}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-4">
              <button
                onClick={async () => {
                  try {
                    await updateReminderSettings(reminderSettings);
                    alert("Reminder settings updated successfully!");
                  } catch (error: any) {
                    alert(error.message || "Failed to update settings");
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {view === "diary" && (() => {
        const weekDates: string[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(diaryWeekStart);
          d.setDate(d.getDate() + i);
          weekDates.push(toDateString(d));
        }
        const todayStr = toDateString(new Date());

        const search = diarySearch.trim().toLowerCase();
        const matchesSearch = (apt: Appointment) =>
          !search ||
          (apt.dogname || "").toLowerCase().includes(search) ||
          (apt.ownername || "").toLowerCase().includes(search) ||
          (apt.phone || "").replace(/\s+/g, "").includes(search.replace(/\s+/g, ""));

        const scheduled = appointments
          .filter((apt) => selectedLocation === ALL_LOCATIONS || apt.locationid === selectedLocation)
          .filter(matchesSearch)
          .map((apt) => ({ apt, schedule: getEffectiveSchedule(apt) }))
          .filter((entry) => entry.schedule && weekDates.includes(entry.schedule.date)) as { apt: Appointment; schedule: NonNullable<ReturnType<typeof getEffectiveSchedule>> }[];

        // Search results across ALL weeks, so any booking can be found and jumped to
        const searchResults = !search
          ? []
          : (appointments
              .filter(matchesSearch)
              .map((apt) => ({ apt, schedule: getEffectiveSchedule(apt) }))
              .filter((entry) => entry.schedule) as { apt: Appointment; schedule: NonNullable<ReturnType<typeof getEffectiveSchedule>> }[])
              .sort((a, b) => b.schedule.date.localeCompare(a.schedule.date))
              .slice(0, 12);

        const slotStartMinutes = (slot: string) => Number(slot.slice(0, 2)) * 60 + Number(slot.slice(3, 5));
        const bookingsFor = (date: string, slot: string) => {
          const start = slotStartMinutes(slot);
          return scheduled.filter(({ schedule }) => schedule.date === date && schedule.startMinutes >= start && schedule.startMinutes < start + 120);
        };
        // Custom-time bookings can land in the same display row without actually
        // overlapping (e.g. 12:00-13:00 and 13:15-14:00 both show under "12:00"),
        // so check real time overlap rather than just "more than one in this cell".
        const hasRealOverlap = (bookings: ReturnType<typeof bookingsFor>) => {
          for (let i = 0; i < bookings.length; i++) {
            for (let j = i + 1; j < bookings.length; j++) {
              const a = bookings[i].schedule;
              const b = bookings[j].schedule;
              if (a.startMinutes < b.startMinutes + b.durationMinutes && b.startMinutes < a.startMinutes + a.durationMinutes) return true;
            }
          }
          return false;
        };
        const formatMinutesAsTime = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
        // A booking whose window runs past this row's 2-hour block spills visually
        // into the next row with nothing shown there — flag it so we can hint at it.
        const getOverflowIntoNextRow = (date: string, slotIndex: number) => {
          if (slotIndex < 0 || slotIndex >= SLOT_TIMES.length - 1) return [];
          const nextRowStart = slotStartMinutes(SLOT_TIMES[slotIndex + 1]);
          return bookingsFor(date, SLOT_TIMES[slotIndex]).filter(({ schedule }) => schedule.startMinutes + schedule.durationMinutes > nextRowStart && schedule.startMinutes < nextRowStart);
        };
        const isClosedDay = (date: string) => unavailableDays.includes(date) || unavailableWeekdays.includes(new Date(`${date}T00:00:00`).getDay());

        const chipStyle = (apt: Appointment) => {
          const status = apt.booking_status || apt.status || "pending";
          if (status === "completed") return "bg-blue-50 border-blue-200 text-blue-800";
          if (status === "confirmed") return "bg-emerald-50 border-emerald-300 text-emerald-800";
          if (status === "cancelled") return "bg-slate-100 border-slate-200 text-slate-400 line-through";
          if (status === "due_for_rebook") return "bg-purple-50 border-purple-200 text-purple-800";
          return "bg-amber-50 border-amber-300 text-amber-800";
        };

        const weekLabel = `${new Date(`${weekDates[0]}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(`${weekDates[6]}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
        const shiftWeek = (weeks: number) =>
          setDiaryWeekStart((prev) => {
            const next = new Date(prev);
            next.setDate(next.getDate() + weeks * 7);
            return next;
          });

        return (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h2 className="text-2xl font-black text-slate-800">Diary</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => shiftWeek(-1)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-slate-600">
                  ‹
                </button>
                <span className="font-bold text-slate-700 min-w-[190px] text-center">{weekLabel}</span>
                <button onClick={() => shiftWeek(1)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-slate-600">
                  ›
                </button>
                <button onClick={() => setDiaryWeekStart(getMonday(new Date()))} className="ml-2 px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-xl font-bold text-sm">
                  Today
                </button>
              </div>
            </div>

            <div className="mb-4">
              <input
                value={diarySearch}
                onChange={(e) => setDiarySearch(e.target.value)}
                placeholder="🔍 Search dog name, owner name or phone number..."
                className="w-full px-5 py-3 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-teal-500 font-medium"
              />
              {diarySearch.trim() && (
                <div className="mt-2 bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-200 overflow-hidden">
                  {searchResults.length === 0 && <div className="p-4 text-sm text-slate-400 font-bold">No bookings found</div>}
                  {searchResults.map(({ apt, schedule }) => (
                    <button
                      key={apt.id}
                      onClick={() => {
                        setDiaryWeekStart(getMonday(new Date(`${schedule.date}T00:00:00`)));
                        openUpdateModal(apt);
                      }}
                      className="w-full flex flex-wrap items-center justify-between gap-2 p-3 text-left hover:bg-white transition-colors"
                    >
                      <span className="font-bold text-sm text-slate-800">
                        🐕 {apt.dogname} <span className="text-slate-500 font-medium">— {apt.ownername}{apt.phone ? ` · ${apt.phone}` : ""}</span>
                      </span>
                      <span className="text-xs font-bold text-slate-600">
                        {new Date(`${schedule.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {schedule.timeLabel}
                        <span className={`ml-2 px-2 py-0.5 rounded-full ${chipStyle(apt)}`}>{apt.booking_status || apt.status || "pending"}</span>
                      </span>
                    </button>
                  ))}
                  <div className="p-2 text-[11px] text-slate-400 text-center">Click a result to jump to its week and open it</div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 mb-4 text-xs font-bold">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 border border-amber-300"></span> Pending request (holds slot)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300"></span> Confirmed</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-200 border border-blue-300"></span> Completed</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-200 border border-red-300"></span> Closed day</span>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[1150px]">
                {/* Day headers */}
                <div className="grid grid-cols-[64px_repeat(7,1fr)] gap-2 mb-2">
                  <div></div>
                  {weekDates.map((date) => {
                    const d = new Date(`${date}T00:00:00`);
                    const closed = isClosedDay(date);
                    return (
                      <div key={date} className={`text-center py-2 rounded-xl ${date === todayStr ? "bg-teal-600 text-white" : closed ? "bg-red-100 text-red-700" : "bg-slate-50 text-slate-700"}`}>
                        <div className="text-xs font-black uppercase">{DAYS[d.getDay()]}</div>
                        <div className="text-sm font-bold">{d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                        {closed && <div className="text-[10px] font-black uppercase">Closed</div>}
                      </div>
                    );
                  })}
                </div>

                {/* Slot rows */}
                {SLOT_TIMES.map((slot, slotIndex) => (
                  <div key={slot} className="grid grid-cols-[64px_repeat(7,1fr)] gap-2 mb-2">
                    <div className="text-xs font-black text-slate-400 pt-3 text-right pr-1">{slot}</div>
                    {weekDates.map((date) => {
                      const cellBookings = bookingsFor(date, slot);
                      const closed = isClosedDay(date);
                      const overlapping = hasRealOverlap(cellBookings);
                      const overflowFromPrev = getOverflowIntoNextRow(date, slotIndex - 1);
                      return (
                        <div
                          key={`${date}-${slot}`}
                          onClick={() => !closed && cellBookings.length === 0 && openDiarySlotModal(date, slot)}
                          className={`min-h-[64px] min-w-0 rounded-xl border p-1.5 space-y-1.5 ${closed ? "bg-red-50 border-red-200" : overlapping ? "bg-red-50 border-red-200" : cellBookings.length === 0 ? "bg-white border-slate-100 cursor-pointer hover:border-teal-300 hover:bg-teal-50/40 transition-colors" : "bg-white border-slate-100"}`}
                        >
                          {overflowFromPrev.length > 0 && (
                            <div className="text-[9px] font-bold text-slate-400 border-b border-dashed border-slate-300 pb-1 mb-1 truncate">
                              ↳ {overflowFromPrev.map(({ apt }) => apt.dogname).join(", ")} until {formatMinutesAsTime(overflowFromPrev[0].schedule.startMinutes + overflowFromPrev[0].schedule.durationMinutes)}
                            </div>
                          )}
                          {cellBookings.map(({ apt, schedule }) => {
                            const isStandardSlot = schedule.timeLabel === slot && schedule.durationMinutes === 120;
                            const endLabel = formatMinutesAsTime(schedule.startMinutes + schedule.durationMinutes);
                            return (
                              <button
                                key={apt.id}
                                onClick={() => openUpdateModal(apt)}
                                className={`w-full min-w-0 text-left px-2 py-1.5 rounded-lg border text-xs font-bold hover:shadow transition-all ${chipStyle(apt)} ${!isStandardSlot ? "border-l-4" : ""}`}
                              >
                                <span className="block break-words whitespace-normal leading-snug">🐕 {apt.dogname}</span>
                                <span className="block break-words whitespace-normal font-medium opacity-75 leading-snug">
                                  {!isStandardSlot ? `⏰ ${schedule.timeLabel}–${endLabel} · ` : ""}
                                  {SERVICES.find((s) => s.id === apt.serviceid)?.name?.split(" ")[0] || apt.serviceid}
                                  {selectedLocation === ALL_LOCATIONS ? ` · ${LOCATIONS.find((l) => l.id === apt.locationid)?.name?.split(" ")[0] || ""}` : ""}
                                </span>
                              </button>
                            );
                          })}
                          {overlapping && <div className="text-[10px] font-black text-red-500 text-center uppercase">Double booked</div>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-4">Click any booking to open it. Use the location buttons above to switch salons.</p>
          </div>
        );
      })()}

      {view === "customers" && (() => {
        const enriched = customersList.map((customer) => {
          const bookings = bookingsForCustomer(customer);
          const dogNameSet = new Set<string>((customer.dogs || []).map((d) => d.name));
          bookings.forEach((apt) => apt.dogname && dogNameSet.add(apt.dogname));

          let totalSpent = 0;
          let lastVisit: string | null = null;
          let nextVisit: string | null = null;
          bookings.forEach((apt) => {
            totalSpent += getBookingRevenue(apt).amount;
            if (apt.booking_status === "completed" && apt.completed_at && (!lastVisit || apt.completed_at > lastVisit)) lastVisit = apt.completed_at;
            if (apt.booking_status === "confirmed" && apt.confirmed_date && (!nextVisit || apt.confirmed_date < nextVisit)) nextVisit = apt.confirmed_date;
          });
          const owedRefunds = pendingDepositRefunds(bookings);
          return { customer, bookings, dogNames: Array.from(dogNameSet), totalSpent, lastVisit, nextVisit, owedRefunds };
        });

        const search = customerSearch.toLowerCase();
        const filteredCustomers = enriched.filter(({ customer, dogNames, owedRefunds }) => {
          if (intakeFilter !== "all" && customer.intake_status !== intakeFilter) return false;
          if (showOnlyMattingDue && !(customer.matting_required && !customer.matting_signed_at)) return false;
          if (showOnlyDepositOwed && owedRefunds.length === 0) return false;
          if (!search) return true;
          return (
            customer.ownername.toLowerCase().includes(search) ||
            (customer.email || "").toLowerCase().includes(search) ||
            (customer.phone || "").includes(customerSearch) ||
            dogNames.some((dog) => dog.toLowerCase().includes(search))
          );
        });

        const countByStatus = (status: IntakeStatus) => customersList.filter((c) => c.intake_status === status).length;
        const statusChip = (status: IntakeStatus) =>
          status === "completed" ? (
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full whitespace-nowrap">✓ Signed</span>
          ) : status === "sent" ? (
            <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full whitespace-nowrap">⏳ Awaiting form</span>
          ) : (
            <span className="px-3 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full whitespace-nowrap">Form not sent</span>
          );

        return (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <h2 className="text-2xl font-black text-slate-800">Customer Database</h2>
              <div className="flex gap-2">
                <button onClick={() => refreshCustomers()} title="Reload customers to see newly completed forms" className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold">
                  ↻ Refresh
                </button>
                <button
                  onClick={async () => {
                    setShowDeletedCustomersModal(true);
                    setLoadingDeletedCustomers(true);
                    try {
                      setDeletedCustomersList(await getDeletedCustomers());
                    } catch {
                      setDeletedCustomersList([]);
                    } finally {
                      setLoadingDeletedCustomers(false);
                    }
                  }}
                  title="View and restore deleted customers"
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold"
                >
                  🗑️ Deleted
                </button>
                <button onClick={() => setShowAddCustomerModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold">
                  + Add Customer
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="mb-4">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search by customer name, email, phone, or dog name..."
                className="w-full px-6 py-4 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>

            {/* Intake status filter */}
            <div className="flex flex-wrap gap-2 mb-6">
              {([
                ["all", `All (${customersList.length})`],
                ["not_sent", `Form not sent (${countByStatus("not_sent")})`],
                ["sent", `Awaiting form (${countByStatus("sent")})`],
                ["completed", `Signed (${countByStatus("completed")})`],
              ] as const).map(([value, label]) => (
                <button key={value} onClick={() => setIntakeFilter(value)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${intakeFilter === value ? "bg-slate-800 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {label}
                </button>
              ))}
              <button
                onClick={() => setShowOnlyMattingDue((prev) => !prev)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${showOnlyMattingDue ? "bg-orange-500 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                ⚠️ Matting Due ({customersList.filter((c) => c.matting_required && !c.matting_signed_at).length})
              </button>
              <button
                onClick={() => setShowOnlyDepositOwed((prev) => !prev)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${showOnlyDepositOwed ? "bg-rose-600 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                ⚠️ Deposit Owed ({enriched.filter((c) => c.owedRefunds.length > 0).length})
              </button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                <div className="text-2xl font-black text-emerald-700">{customersList.length}</div>
                <div className="text-xs font-bold text-emerald-600 uppercase">Total Customers</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                <div className="text-2xl font-black text-blue-700">{appointments.length}</div>
                <div className="text-xs font-bold text-blue-600 uppercase">Total Bookings</div>
              </div>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                <div className="text-2xl font-black text-amber-700">
                  £{Math.round(enriched.reduce((sum, c) => sum + c.totalSpent, 0))}
                </div>
                <div className="text-xs font-bold text-amber-600 uppercase">Total Revenue</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                <div className="text-2xl font-black text-purple-700">{countByStatus("completed")}</div>
                <div className="text-xs font-bold text-purple-600 uppercase">Signed Agreements</div>
              </div>
            </div>

            {/* Customer List */}
            <div className="space-y-3">
              {filteredCustomers.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  {customerSearch || intakeFilter !== "all" || showOnlyMattingDue || showOnlyDepositOwed ? "No customers found matching your search" : "No customers yet — add one or wait for a web booking to come in"}
                </div>
              )}

              {filteredCustomers.map(({ customer, bookings, dogNames, totalSpent, lastVisit, nextVisit, owedRefunds }) => (
                <div
                  key={customer.id}
                  className="p-6 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedCustomer(customer.id);
                    setShowCustomerModal(true);
                    setShowAgreementDetails(false);
                    setEditingCustomerInfo(false);
                    setRebookSelectedDogs(new Set(dogNames.slice(0, 1)));
                    setDogNotes({});
                    setDogNotesDraft({});
                    setDogNotesSaving({});
                    setDogNotesSaved({});
                    if (customer.email) {
                      getDogNotes(customer.email).then((notes) => {
                        setDogNotes(notes);
                        setDogNotesDraft(notes);
                      }).catch(() => {});
                    }
                  }}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h3 className="text-lg font-black text-slate-800">{customer.ownername}</h3>
                        {statusChip(customer.intake_status)}
                        {customer.matting_required && !customer.matting_signed_at && (
                          <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full whitespace-nowrap">Matting form needed</span>
                        )}
                        {owedRefunds.length > 0 && (
                          <span className="px-3 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full whitespace-nowrap">
                            ⚠️ Deposit owed £{owedRefunds.reduce((sum, a) => sum + (a.deposit_amount || (a.number_of_dogs || 1) * 20), 0)}
                          </span>
                        )}
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                          {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 space-y-1">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {dogNames.map(dog => {
                            const hasNote = !!(customer.email && allDogNotes[customer.email]?.[dog]);
                            return (
                              <span key={dog} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${hasNote ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-700"}`}>
                                🐕 {dog}
                                {hasNote && <span title="Has groomer notes" className="text-purple-500">●</span>}
                              </span>
                            );
                          })}
                        </div>
                        {customer.email && <div>📧 {customer.email}</div>}
                        {customer.phone && <div>📞 {customer.phone}</div>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-emerald-600">£{Math.round(totalSpent)}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {lastVisit && `Last: ${new Date(lastVisit).toLocaleDateString('en-GB')}`}
                      </div>
                      {nextVisit && (
                        <div className="text-xs text-blue-600 font-bold mt-1">
                          Next: {new Date(nextVisit).toLocaleDateString('en-GB')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Customer Detail Modal */}
      {showCustomerModal && selectedCustomer && (() => {
        const customer = customersList.find((c) => c.id === selectedCustomer);
        if (!customer) return null;

        const customerData = bookingsForCustomer(customer);
        const dogNameSet = new Set<string>((customer.dogs || []).map((d) => d.name));
        customerData.forEach((apt) => apt.dogname && dogNameSet.add(apt.dogname));
        const dogs = Array.from(dogNameSet);
        const totalSpent = customerData.reduce((sum, apt) => sum + getBookingRevenue(apt).amount, 0);
        const owedRefunds = pendingDepositRefunds(customerData);

        // Count service preferences
        const serviceCount = customerData.reduce((acc, apt) => {
          acc[apt.serviceid] = (acc[apt.serviceid] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const preferredService = Object.entries(serviceCount).sort((a, b) => b[1] - a[1])[0];
        const intakeDogByName = (name: string) => (customer.dogs || []).find((d) => d.name.toLowerCase() === name.toLowerCase());
        const busy = sendingIntake !== null;
        const yesNo = (value: boolean | null | undefined) => (value === true ? "Yes" : value === false ? "No" : "—");

        return (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-2xl p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                {editingCustomerInfo ? (
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 mr-4">
                    <input value={customerInfoForm.ownername} onChange={(e) => setCustomerInfoForm({ ...customerInfoForm, ownername: e.target.value })} placeholder="Name" className="px-4 py-2 border rounded-lg font-bold" />
                    <input value={customerInfoForm.email} onChange={(e) => setCustomerInfoForm({ ...customerInfoForm, email: e.target.value })} placeholder="Email" className="px-4 py-2 border rounded-lg" />
                    <input value={customerInfoForm.phone} onChange={(e) => setCustomerInfoForm({ ...customerInfoForm, phone: e.target.value })} placeholder="Phone" className="px-4 py-2 border rounded-lg" />
                    <input value={customerInfoForm.address} onChange={(e) => setCustomerInfoForm({ ...customerInfoForm, address: e.target.value })} placeholder="Address" className="px-4 py-2 border rounded-lg" />
                    <div className="flex gap-2 md:col-span-2">
                      <button disabled={isWorking} onClick={() => handleSaveCustomerInfo(customer)} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold">
                        {isWorking ? "Saving..." : "Save"}
                      </button>
                      <button onClick={() => setEditingCustomerInfo(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-2xl font-black text-slate-800">{customer.ownername}</h3>
                      <button
                        onClick={() => {
                          setCustomerInfoForm({
                            ownername: customer.ownername || "",
                            email: customer.email || "",
                            phone: customer.phone || "",
                            address: customer.address || "",
                          });
                          setEditingCustomerInfo(true);
                        }}
                        className="text-xs font-bold text-slate-400 hover:text-slate-600 underline"
                      >
                        Edit details
                      </button>
                    </div>
                    {customer.email && <p className="text-slate-600">{customer.email}</p>}
                    {customer.phone && <p className="text-slate-600">{customer.phone}</p>}
                    {customer.address && <p className="text-slate-500 text-sm">{customer.address}</p>}
                  </div>
                )}
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              {/* Grooming Agreement */}
              <div className="mb-8 p-5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <h4 className="text-sm font-bold text-slate-700">📋 Grooming Agreement</h4>
                  {customer.intake_status === "completed" ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">✓ Signed{customer.intake_completed_at ? ` on ${new Date(customer.intake_completed_at).toLocaleDateString("en-GB")}` : ""}</span>
                  ) : customer.intake_status === "sent" ? (
                    <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">⏳ Sent{customer.intake_sent_via ? ` via ${customer.intake_sent_via}` : ""}{customer.intake_sent_at ? ` on ${new Date(customer.intake_sent_at).toLocaleDateString("en-GB")}` : ""} — awaiting completion</span>
                  ) : (
                    <span className="px-3 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full">Form not sent</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  {customer.intake_status === "completed" ? "The customer has completed and signed the agreement." : "Send the customer their personal link to fill in the grooming agreement and sign it on their phone."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy || !customer.phone} title={!customer.phone ? "No phone number on record" : "Opens WhatsApp with the message ready to send (free)"} onClick={() => handleSendIntake(customer, "whatsapp")} className="bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-bold">
                    {sendingIntake === "whatsapp" ? "Opening..." : "📱 WhatsApp"}
                  </button>
                  <button disabled={busy || !customer.phone} title={!customer.phone ? "No phone number on record" : "Sends a text message (~4p)"} onClick={() => handleSendIntake(customer, "sms")} className="bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-bold">
                    {sendingIntake === "sms" ? "Sending..." : "💬 SMS"}
                  </button>
                  <button disabled={busy || !customer.email} title={!customer.email ? "No email on record" : "Sends an email (free)"} onClick={() => handleSendIntake(customer, "email")} className="bg-slate-600 hover:bg-slate-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-bold">
                    {sendingIntake === "email" ? "Sending..." : "📧 Email"}
                  </button>
                  <button disabled={busy} title="Copy the link so you can paste it anywhere" onClick={() => handleCopyIntakeLink(customer)} className="bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold">
                    {sendingIntake === "copy" ? "Copying..." : "🔗 Copy Link"}
                  </button>
                  <button title="Type in answers yourself, e.g. from a paper form" onClick={() => openAgreementEditor(customer)} className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-4 py-2 rounded-lg text-sm font-bold">
                    ✏️ Edit Agreement
                  </button>
                  {customer.intake_status === "completed" && (
                    <>
                      <button onClick={() => setShowAgreementDetails(!showAgreementDetails)} className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-4 py-2 rounded-lg text-sm font-bold">
                        {showAgreementDetails ? "Hide Agreement" : "👀 View Agreement"}
                      </button>
                      <button onClick={() => printAgreement(customer)} className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-4 py-2 rounded-lg text-sm font-bold">
                        🖨️ Print
                      </button>
                    </>
                  )}
                </div>

                {/* Matting release */}
                <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(customer.matting_required)}
                      onChange={async (e) => {
                        try {
                          await updateCustomer(customer.id, { matting_required: e.target.checked });
                          await refreshCustomers();
                        } catch (err: any) {
                          alert(`Could not update: ${err.message}`);
                        }
                      }}
                      className="w-4 h-4 accent-orange-500"
                    />
                    <span className="text-sm font-bold text-slate-700">Matting release form needed</span>
                  </label>
                  {customer.matting_required && (
                    customer.matting_signed_at ? (
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">✓ Matting consent signed {customer.matting_signed_via === "paper" ? "on paper" : ""} {new Date(customer.matting_signed_at).toLocaleDateString("en-GB")}</span>
                    ) : (
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">⏳ Outstanding — included in their form link</span>
                    )
                  )}
                </div>

                {showAgreementDetails && customer.intake_status === "completed" && (
                  <div className="mt-4 pt-4 border-t border-slate-200 text-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-slate-600 mb-4">
                      <div><span className="font-bold">Heard about us:</span> {customer.hear_about_us || "—"}</div>
                      <div><span className="font-bold">Happy to receive texts:</span> {yesNo(customer.sms_ok)}</div>
                      <div><span className="font-bold">Alt contact:</span> {customer.alt_contact_name || "—"} {customer.alt_contact_phone && `(${customer.alt_contact_phone})`}</div>
                      <div><span className="font-bold">Vets used:</span> {customer.vet_name || "—"}</div>
                      <div><span className="font-bold">Treats allowed:</span> {yesNo(customer.treats_ok)}</div>
                      <div><span className="font-bold">Photo/social consent:</span> {yesNo(customer.photo_consent)}</div>
                      <div className="md:col-span-2"><span className="font-bold">Emergency vet:</span> {customer.emergency_vet_name || "—"} {customer.emergency_vet_phone && `· ${customer.emergency_vet_phone}`} {customer.emergency_vet_address && `· ${customer.emergency_vet_address}`}</div>
                    </div>
                    {customer.signature_data && (
                      <div>
                        <span className="font-bold text-slate-600">Signature:</span>
                        <img src={customer.signature_data} alt="Customer signature" className="mt-1 h-20 border border-slate-200 rounded-lg bg-white" />
                      </div>
                    )}
                    {customer.matting_signed_at && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <span className="font-bold text-slate-600">Matting release consent:</span> signed {customer.matting_signed_via === "paper" ? "on paper" : "digitally"} on {new Date(customer.matting_signed_at).toLocaleDateString("en-GB")}
                        {customer.matting_signature && <img src={customer.matting_signature} alt="Matting consent signature" className="mt-1 h-20 border border-slate-200 rounded-lg bg-white" />}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Deposit refunds owed */}
              {owedRefunds.length > 0 && (
                <div className="mb-8 p-5 bg-rose-50 border-2 border-rose-200 rounded-2xl">
                  <h4 className="text-sm font-bold text-rose-800 mb-3">⚠️ Deposit refund owed</h4>
                  <div className="space-y-2">
                    {owedRefunds.map((apt) => (
                      <div key={apt.id} className="flex items-center justify-between gap-3 bg-white border border-rose-200 rounded-xl px-4 py-3">
                        <div className="text-sm text-rose-900">
                          <span className="font-bold">{apt.dogname}</span> — cancelled booking, £{apt.deposit_amount || (apt.number_of_dogs || 1) * 20} deposit paid
                        </div>
                        <button onClick={() => handleMarkDepositRefunded(apt)} className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap">
                          Mark Refunded/Handled
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-emerald-50 p-4 rounded-xl text-center">
                  <div className="text-3xl font-black text-emerald-700">{customerData.length}</div>
                  <div className="text-xs font-bold text-emerald-600">Total Visits</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl text-center">
                  <div className="text-3xl font-black text-blue-700">£{Math.round(totalSpent)}</div>
                  <div className="text-xs font-bold text-blue-600">Total Spent</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-xl text-center">
                  <div className="text-3xl font-black text-purple-700">{dogs.length}</div>
                  <div className="text-xs font-bold text-purple-600">Dog{dogs.length !== 1 ? 's' : ''}</div>
                </div>
                <div className="bg-amber-50 p-4 rounded-xl text-center">
                  <div className="text-sm font-black text-amber-700">{(preferredService && SERVICES.find(s => s.id === preferredService[0])?.name) || '-'}</div>
                  <div className="text-xs font-bold text-amber-600">Preferred Service</div>
                </div>
              </div>

              {/* Dogs & Notes */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-700 mb-3">Dogs</h4>
                <div className="space-y-3">
                  {dogs.map(dog => {
                    const intakeDog = intakeDogByName(dog);
                    return (
                    <div key={dog} className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-bold text-slate-800">🐕 {dog}</span>
                        {intakeDog?.breed && <span className="text-sm text-slate-500">({intakeDog.breed})</span>}
                        {intakeDog?.needs_muzzle === true && <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">⚠️ muzzle</span>}
                        {intakeDog?.needs_prescribed_shampoo === true && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">own shampoo</span>}
                        {(intakeDog?.medication_details || "").trim() && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">on medication</span>}
                        {dogNotes[dog] && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">has notes</span>
                        )}
                      </div>
                      {intakeDog && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs text-slate-600 mb-3">
                          {intakeDog.dob && <div><span className="font-bold">Age:</span> {intakeDog.dob}</div>}
                          {intakeDog.sex && <div><span className="font-bold">Sex:</span> {intakeDog.sex}</div>}
                          <div><span className="font-bold">Neutered:</span> {yesNo(intakeDog.neutered)}</div>
                          <div><span className="font-bold">Vaccinated:</span> {yesNo(intakeDog.vaccinated)}</div>
                          <div><span className="font-bold">Own shampoo:</span> {yesNo(intakeDog.needs_prescribed_shampoo)}</div>
                          <div><span className="font-bold">Muzzle:</span> {yesNo(intakeDog.needs_muzzle)}</div>
                          <div className="col-span-2"><span className="font-bold">Medication:</span> {(intakeDog.medication_details || "").trim() || "None"}</div>
                          {(intakeDog.behaviour_notes || "").trim() && <div className="col-span-2 md:col-span-4"><span className="font-bold">Behaviour:</span> {intakeDog.behaviour_notes}</div>}
                          {(intakeDog.health_conditions || "").trim() && <div className="col-span-2 md:col-span-4"><span className="font-bold">Health/skin:</span> {intakeDog.health_conditions}</div>}
                        </div>
                      )}
                      {customer.email && (
                      <>
                      <textarea
                        rows={3}
                        placeholder="Groomer notes — temperament, allergies, coat type, anything to remember..."
                        value={dogNotesDraft[dog] ?? ""}
                        onChange={(e) => setDogNotesDraft(prev => ({ ...prev, [dog]: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-400 resize-none bg-white"
                      />
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          disabled={dogNotesSaving[dog]}
                          onClick={async () => {
                            const ownerEmail = customer.email!;
                            setDogNotesSaving(prev => ({ ...prev, [dog]: true }));
                            setDogNotesSaved(prev => ({ ...prev, [dog]: false }));
                            try {
                              await upsertDogNote(ownerEmail, dog, dogNotesDraft[dog] ?? "");
                              const newNote = dogNotesDraft[dog] ?? "";
                              setDogNotes(prev => ({ ...prev, [dog]: newNote }));
                              setAllDogNotes(prev => ({
                                ...prev,
                                [ownerEmail]: { ...(prev[ownerEmail] ?? {}), [dog]: newNote },
                              }));
                              setDogNotesSaved(prev => ({ ...prev, [dog]: true }));
                              setTimeout(() => setDogNotesSaved(prev => ({ ...prev, [dog]: false })), 2000);
                            } catch {
                              alert("Failed to save notes.");
                            } finally {
                              setDogNotesSaving(prev => ({ ...prev, [dog]: false }));
                            }
                          }}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg"
                        >
                          {dogNotesSaving[dog] ? "Saving…" : "Save Notes"}
                        </button>
                        {dogNotesSaved[dog] && (
                          <span className="text-emerald-600 text-xs font-bold">Saved!</span>
                        )}
                      </div>
                      </>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* Booking History */}
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-3">Booking History ({customerData.length})</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {customerData.sort((a, b) => {
                    const aDate = a.confirmed_date || a.date;
                    const bDate = b.confirmed_date || b.date;
                    return bDate.localeCompare(aDate);
                  }).map(apt => (
                    <div key={apt.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-slate-800">{apt.dogname}</div>
                          <div className="text-sm text-slate-600">
                            {SERVICES.find(s => s.id === apt.serviceid)?.name || apt.serviceid}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {apt.confirmed_date || apt.date} {apt.confirmed_time && `at ${apt.confirmed_time}`}
                          </div>
                          {dogNotes[apt.dogname] && (
                            <div className="text-xs text-purple-700 bg-purple-50 rounded px-2 py-1 mt-1">🐾 {dogNotes[apt.dogname]}</div>
                          )}
                          {apt.notes && (
                            <div className="text-xs text-amber-700 mt-1">📝 {apt.notes}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            apt.booking_status === 'completed' ? 'bg-blue-100 text-blue-700' :
                            apt.booking_status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                            apt.booking_status === 'due_for_rebook' ? 'bg-amber-100 text-amber-700' :
                            apt.booking_status === 'cancelled' ? 'bg-slate-200 text-slate-600' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {apt.booking_status || 'pending'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {dogs.length > 1 && (
                <div className="mt-6">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Which dog(s) are you rebooking?</p>
                  <div className="flex flex-wrap gap-2">
                    {dogs.map((dog) => {
                      const selected = rebookSelectedDogs.has(dog);
                      return (
                        <button
                          key={dog}
                          type="button"
                          onClick={() =>
                            setRebookSelectedDogs((prev) => {
                              const next = new Set(prev);
                              if (next.has(dog)) next.delete(dog);
                              else next.add(dog);
                              return next;
                            })
                          }
                          className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-all ${selected ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}
                        >
                          🐕 {dog}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    const selectedDogs = dogs.length > 1 ? dogs.filter((d) => rebookSelectedDogs.has(d)) : dogs.slice(0, 1);
                    if (dogs.length > 1 && selectedDogs.length === 0) {
                      alert("Please select at least one dog to rebook.");
                      return;
                    }
                    setAddForm({
                      ownername: customer.ownername,
                      email: customer.email || "",
                      phone: customer.phone || "",
                      dogname: selectedDogs.join(" & "),
                      dogbreed: intakeDogByName(selectedDogs[0] || "")?.breed || "",
                      serviceid: preferredService?.[0] || SERVICES[0].id,
                      locationid: LOCATIONS[0].id,
                      date: new Date().toISOString().split("T")[0],
                      confirmed_time: "",
                      confirmed_duration_minutes: 120,
                      notes: "",
                      number_of_dogs: Math.max(1, selectedDogs.length),
                      deposit_paid: false,
                      deposit_amount: Math.max(1, selectedDogs.length) * 20,
                      deposit_notes: "",
                      confirm_channel: "none" as "none" | "whatsapp" | "sms",
                    });
                    setShowCustomerModal(false);
                    setShowAddModal(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold"
                >
                  Book Again
                </button>
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-3 rounded-lg font-bold"
                >
                  Close
                </button>
                <button
                  onClick={() => handleDeleteCustomer(customer)}
                  className="ml-auto text-red-400 hover:text-red-600 px-4 py-3 text-sm font-bold"
                >
                  Delete customer
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Agreement Editor Modal */}
      {showAgreementEditor && selectedCustomer && (() => {
        const customer = customersList.find((c) => c.id === selectedCustomer);
        if (!customer) return null;
        const inputCls = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm";

        return (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[70]">
            <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-xl font-black text-slate-800">Edit Agreement — {customer.ownername}</h3>
                <button onClick={() => setShowAgreementEditor(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
              </div>
              <p className="text-xs text-slate-500 mb-4">Type in answers yourself — for example from a paper form. A customer's digital signature is never changed here.</p>

              <div className="p-4 bg-slate-50 rounded-xl mb-4">
                <h4 className="text-sm font-bold text-slate-700 mb-3">About the owner</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={agreementForm.hear_about_us} onChange={(e) => setAgreementForm({ ...agreementForm, hear_about_us: e.target.value })} placeholder="Where did they hear about us?" className={inputCls} />
                  <input value={agreementForm.vet_name} onChange={(e) => setAgreementForm({ ...agreementForm, vet_name: e.target.value })} placeholder="Which vets do they use?" className={inputCls} />
                  <input value={agreementForm.alt_contact_name} onChange={(e) => setAgreementForm({ ...agreementForm, alt_contact_name: e.target.value })} placeholder="Alternative contact name" className={inputCls} />
                  <input value={agreementForm.alt_contact_phone} onChange={(e) => setAgreementForm({ ...agreementForm, alt_contact_phone: e.target.value })} placeholder="Alternative contact phone" className={inputCls} />
                </div>
                <div className="mt-2 divide-y divide-slate-200">
                  <TriYesNo label="Happy to receive appointment texts?" value={agreementForm.sms_ok} onChange={(v) => setAgreementForm({ ...agreementForm, sms_ok: v })} />
                  <TriYesNo label="Allowed to give treats?" value={agreementForm.treats_ok} onChange={(v) => setAgreementForm({ ...agreementForm, treats_ok: v })} />
                  <TriYesNo label="Photos/videos for adverts & social media?" value={agreementForm.photo_consent} onChange={(v) => setAgreementForm({ ...agreementForm, photo_consent: v })} />
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl mb-4">
                <h4 className="text-sm font-bold text-slate-700 mb-3">Emergency care authorisation</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={agreementForm.emergency_vet_name} onChange={(e) => setAgreementForm({ ...agreementForm, emergency_vet_name: e.target.value })} placeholder="Preferred emergency vet" className={inputCls} />
                  <input value={agreementForm.emergency_vet_phone} onChange={(e) => setAgreementForm({ ...agreementForm, emergency_vet_phone: e.target.value })} placeholder="Vet phone" className={inputCls} />
                  <input value={agreementForm.emergency_vet_address} onChange={(e) => setAgreementForm({ ...agreementForm, emergency_vet_address: e.target.value })} placeholder="Vet address" className={`md:col-span-2 ${inputCls}`} />
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl mb-4">
                <h4 className="text-sm font-bold text-slate-700 mb-3">Dogs</h4>
                {agreementDogs.map((dog, index) => (
                  <div key={dog.id || `new-${index}`} className="p-3 bg-white border border-slate-200 rounded-xl mb-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input value={dog.name} onChange={(e) => setAgreementDogField(index, "name", e.target.value)} placeholder="Dog name *" className={inputCls} />
                      <input value={dog.breed || ""} onChange={(e) => setAgreementDogField(index, "breed", e.target.value)} placeholder="Breed" className={inputCls} />
                      <input value={dog.dob || ""} onChange={(e) => setAgreementDogField(index, "dob", e.target.value)} placeholder="Age (e.g. 3 years)" className={inputCls} />
                      <select value={dog.sex || ""} onChange={(e) => setAgreementDogField(index, "sex", e.target.value || null)} className={inputCls}>
                        <option value="">Male or female?</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                    <div className="mt-1 divide-y divide-slate-100">
                      <TriYesNo label="Neutered / spayed?" value={dog.neutered} onChange={(v) => setAgreementDogField(index, "neutered", v)} />
                      <TriYesNo label="Vaccinated?" value={dog.vaccinated} onChange={(v) => setAgreementDogField(index, "vaccinated", v)} />
                      <TriYesNo label="Own prescribed medical shampoo?" value={dog.needs_prescribed_shampoo} onChange={(v) => setAgreementDogField(index, "needs_prescribed_shampoo", v)} />
                      <TriYesNo label="Do we need to muzzle?" value={dog.needs_muzzle} onChange={(v) => setAgreementDogField(index, "needs_muzzle", v)} />
                    </div>
                    <input value={dog.medication_details || ""} onChange={(e) => setAgreementDogField(index, "medication_details", e.target.value)} placeholder="Medication — name and what it's needed for (leave blank if none)" className={`mt-2 ${inputCls}`} />
                    <textarea rows={2} value={dog.behaviour_notes || ""} onChange={(e) => setAgreementDogField(index, "behaviour_notes", e.target.value)} placeholder="Behaviour notes / triggers" className={`mt-2 ${inputCls}`} />
                    <textarea rows={2} value={dog.health_conditions || ""} onChange={(e) => setAgreementDogField(index, "health_conditions", e.target.value)} placeholder="Known health / skin conditions" className={`mt-2 ${inputCls}`} />
                    <button
                      type="button"
                      onClick={() => {
                        if (dog.id && !window.confirm(`Remove ${dog.name || "this dog"} from the record?`)) return;
                        if (dog.id) setAgreementDogsToDelete((prev) => [...prev, dog.id!]);
                        setAgreementDogs((prev) => prev.filter((_, i) => i !== index));
                      }}
                      className="mt-2 text-xs font-bold text-red-400 hover:text-red-600 underline"
                    >
                      Remove dog
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setAgreementDogs((prev) => [...prev, { name: "" }])} className="w-full py-2 border-2 border-dashed border-emerald-300 text-emerald-600 rounded-xl text-sm font-black hover:bg-emerald-50">
                  + Add dog
                </button>
              </div>

              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl mb-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={agreementForm.matting_required} onChange={(e) => setAgreementForm({ ...agreementForm, matting_required: e.target.checked })} className="w-5 h-5 accent-orange-500" />
                  <span className="text-sm font-bold text-orange-900">Matting release form needed for this customer</span>
                </label>
                {agreementForm.matting_required && (
                  customer.matting_signature ? (
                    <p className="mt-2 text-xs text-orange-800 font-bold">✓ Matting consent already signed digitally — kept as it is.</p>
                  ) : (
                    <>
                      <label className="flex items-center gap-3 cursor-pointer mt-3">
                        <input type="checkbox" checked={agreementForm.matting_paper_signed} onChange={(e) => setAgreementForm({ ...agreementForm, matting_paper_signed: e.target.checked })} className="w-5 h-5 accent-orange-500" />
                        <span className="text-sm font-bold text-orange-900">Matting consent signed on paper (copy kept on file)</span>
                      </label>
                      {agreementForm.matting_paper_signed && (
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-xs font-bold text-orange-800">Date signed:</span>
                          <input type="date" value={agreementForm.matting_paper_date} onChange={(e) => setAgreementForm({ ...agreementForm, matting_paper_date: e.target.value })} className="px-3 py-1.5 border border-orange-200 rounded-lg text-sm" />
                        </div>
                      )}
                    </>
                  )
                )}
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                {customer.signature_data ? (
                  <p className="text-xs text-amber-800 font-bold">✓ This customer signed digitally on {customer.signed_at ? new Date(customer.signed_at).toLocaleDateString("en-GB") : "record"} — their signature stays as it is.</p>
                ) : (
                  <>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={agreementForm.paper_signed} onChange={(e) => setAgreementForm({ ...agreementForm, paper_signed: e.target.checked })} className="w-5 h-5 accent-amber-600" />
                      <span className="text-sm font-bold text-amber-900">Agreement signed on paper (copy kept on file)</span>
                    </label>
                    {agreementForm.paper_signed && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-800">Date signed:</span>
                        <input type="date" value={agreementForm.paper_date} onChange={(e) => setAgreementForm({ ...agreementForm, paper_date: e.target.value })} className="px-3 py-1.5 border border-amber-200 rounded-lg text-sm" />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button disabled={isWorking} onClick={() => handleSaveAgreement(customer)} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg font-bold">
                  {isWorking ? "Saving..." : "Save Agreement"}
                </button>
                <button onClick={() => setShowAgreementEditor(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-2.5 rounded-lg font-bold">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Diary slot-click booking modal */}
      {showDiarySlotModal && (() => {
        const search = diarySlotCustomerSearch.trim().toLowerCase();
        const searchResults = !search
          ? []
          : customersList
              .filter(
                (c) =>
                  c.ownername.toLowerCase().includes(search) ||
                  (c.email || "").toLowerCase().includes(search) ||
                  (c.phone || "").replace(/\s+/g, "").includes(search.replace(/\s+/g, "")) ||
                  (c.dogs || []).some((d) => d.name.toLowerCase().includes(search)),
              )
              .slice(0, 8);
        const dateLabel = new Date(`${diarySlotDate}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" });

        return (
          <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-xl font-black text-slate-800">New Booking — {dateLabel}</h3>
                <button onClick={() => setShowDiarySlotModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Time</label>
                <input type="time" value={diarySlotTime} onChange={(e) => setDiarySlotTime(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">for</label>
                <input type="number" min={15} step={15} value={diarySlotDuration} onChange={(e) => setDiarySlotDuration(Math.max(15, Number(e.target.value) || 120))} className="px-3 py-2 border rounded-lg text-sm w-20" />
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">mins</label>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Find an existing customer</label>
                <input
                  value={diarySlotCustomerSearch}
                  onChange={(e) => setDiarySlotCustomerSearch(e.target.value)}
                  placeholder="🔍 Search by dog, owner name or phone..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-500"
                />
                {searchResults.length > 0 && (
                  <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
                    {searchResults.map((c) => (
                      <button key={c.id} onClick={() => selectDiarySlotCustomer(c)} className="w-full text-left p-3 hover:bg-white transition-colors">
                        <span className="font-bold text-sm text-slate-800">{c.ownername}</span>
                        <span className="text-xs text-slate-500 ml-2">{c.phone} {c.email && `· ${c.email}`}</span>
                        {(c.dogs || []).length > 0 && <span className="block text-xs text-slate-500">🐕 {(c.dogs || []).map((d) => d.name).join(", ")}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {diarySlotSelectedCustomer && (
                  <div className="mt-2 flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
                    <span className="text-sm font-bold text-teal-800">✓ {diarySlotSelectedCustomer.ownername} selected</span>
                    <button onClick={() => setDiarySlotSelectedCustomer(null)} className="text-xs font-bold text-teal-600 hover:text-teal-800 underline">Clear</button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input value={diarySlotForm.ownername} onChange={(e) => setDiarySlotForm({ ...diarySlotForm, ownername: e.target.value })} placeholder="Owner name *" className="px-4 py-3 border rounded-lg" />
                <input value={diarySlotForm.dogname} onChange={(e) => setDiarySlotForm({ ...diarySlotForm, dogname: e.target.value })} placeholder="Dog name *" className="px-4 py-3 border rounded-lg" />
                <input value={diarySlotForm.email} onChange={(e) => setDiarySlotForm({ ...diarySlotForm, email: e.target.value })} placeholder="Email" className="px-4 py-3 border rounded-lg" />
                <input value={diarySlotForm.phone} onChange={(e) => setDiarySlotForm({ ...diarySlotForm, phone: e.target.value })} placeholder="Phone" className="px-4 py-3 border rounded-lg" />
                <input value={diarySlotForm.dogbreed} onChange={(e) => setDiarySlotForm({ ...diarySlotForm, dogbreed: e.target.value })} placeholder="Dog breed" className="px-4 py-3 border rounded-lg" />
                <select value={diarySlotForm.serviceid} onChange={(e) => setDiarySlotForm({ ...diarySlotForm, serviceid: e.target.value })} className="px-4 py-3 border rounded-lg">
                  {SERVICES.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
                <select value={diarySlotForm.locationid} onChange={(e) => setDiarySlotForm({ ...diarySlotForm, locationid: e.target.value })} className="px-4 py-3 border rounded-lg">
                  {LOCATIONS.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Number of dogs</label>
                  <input
                    type="number"
                    min={1}
                    value={diarySlotForm.number_of_dogs}
                    onChange={(e) => {
                      const n = Math.max(1, Number(e.target.value) || 1);
                      setDiarySlotForm({ ...diarySlotForm, number_of_dogs: n, deposit_amount: n * 20 });
                    }}
                    className="px-4 py-3 border rounded-lg w-full"
                  />
                </div>
                <textarea value={diarySlotForm.notes} onChange={(e) => setDiarySlotForm({ ...diarySlotForm, notes: e.target.value })} placeholder="Notes" className="md:col-span-2 px-4 py-3 border rounded-lg min-h-20" />
              </div>

              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="text-sm font-bold text-amber-900 mb-3">
                  £{diarySlotForm.deposit_amount} Deposit Status
                  {diarySlotForm.number_of_dogs > 1 && <span className="font-normal text-amber-700"> (£20 × {diarySlotForm.number_of_dogs} dogs)</span>}
                </h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={diarySlotForm.deposit_paid} onChange={(e) => setDiarySlotForm({ ...diarySlotForm, deposit_paid: e.target.checked })} className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                  <span className="text-sm font-medium text-amber-900">Deposit Paid</span>
                </label>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                <span className="text-sm font-semibold text-blue-900">Send booking confirmation to customer?</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button type="button" onClick={() => setDiarySlotForm({ ...diarySlotForm, confirm_channel: "whatsapp" })} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${diarySlotForm.confirm_channel === "whatsapp" ? "bg-green-500 text-white shadow" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
                    📱 WhatsApp (free)
                  </button>
                  <button type="button" onClick={() => setDiarySlotForm({ ...diarySlotForm, confirm_channel: "sms" })} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${diarySlotForm.confirm_channel === "sms" ? "bg-blue-500 text-white shadow" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
                    💬 SMS (~4p)
                  </button>
                  <button type="button" onClick={() => setDiarySlotForm({ ...diarySlotForm, confirm_channel: "none" })} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${diarySlotForm.confirm_channel === "none" ? "bg-slate-700 text-white shadow" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
                    Don't send
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button disabled={isWorking} onClick={() => handleDiarySlotBooking(false)} title="Adds the booking as confirmed" className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                  {isWorking ? "Adding..." : "Add Booking (Confirmed)"}
                </button>
                <button disabled={isWorking} onClick={() => handleDiarySlotBooking(true)} title="Adds the booking as pending — no notification sent, review it later" className="bg-amber-100 hover:bg-amber-200 disabled:opacity-60 text-amber-800 px-5 py-2 rounded-lg font-bold">
                  Hold Booking (Pending)
                </button>
                <button onClick={() => setShowDiarySlotModal(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2 rounded-lg font-bold">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Deleted Customers Modal */}
      {showDeletedCustomersModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-xl font-black text-slate-800">Deleted Customers</h3>
              <button onClick={() => setShowDeletedCustomersModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Restoring a customer brings back their record and dog details. Any bookings that were cancelled when they were deleted stay cancelled — rebook them separately if needed.</p>
            {loadingDeletedCustomers ? (
              <div className="text-center py-8 text-slate-400">Loading...</div>
            ) : deletedCustomersList.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No deleted customers.</div>
            ) : (
              <div className="space-y-2">
                {deletedCustomersList.map((customer) => (
                  <div key={customer.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <div>
                      <div className="font-bold text-slate-800">{customer.ownername}</div>
                      <div className="text-xs text-slate-500">
                        {customer.email} {customer.phone && `· ${customer.phone}`}
                        {customer.deleted_at && ` · Deleted ${new Date(customer.deleted_at).toLocaleDateString("en-GB")}`}
                      </div>
                    </div>
                    <button onClick={() => handleRestoreCustomer(customer)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold">
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-xl font-black text-slate-800">Add New Customer</h3>
              <button onClick={() => setShowAddCustomerModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Create the record now, then send them the intake form to fill in the rest.</p>
            <div className="space-y-3">
              <input value={addCustomerForm.ownername} onChange={(e) => setAddCustomerForm({ ...addCustomerForm, ownername: e.target.value })} placeholder="Owner name *" className="w-full px-4 py-3 border rounded-lg" />
              <input type="tel" value={addCustomerForm.phone} onChange={(e) => setAddCustomerForm({ ...addCustomerForm, phone: e.target.value })} placeholder="Phone (needed for WhatsApp/SMS)" className="w-full px-4 py-3 border rounded-lg" />
              <input type="email" value={addCustomerForm.email} onChange={(e) => setAddCustomerForm({ ...addCustomerForm, email: e.target.value })} placeholder="Email" className="w-full px-4 py-3 border rounded-lg" />
            </div>
            <div className="flex gap-3 mt-5">
              <button disabled={isWorking} onClick={handleAddCustomer} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                {isWorking ? "Adding..." : "Add Customer"}
              </button>
              <button onClick={() => setShowAddCustomerModal(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2 rounded-lg font-bold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-slate-800">Add New Booking</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input value={addForm.ownername} onChange={(e) => setAddForm({ ...addForm, ownername: e.target.value })} placeholder="Owner name" className="px-4 py-3 border rounded-lg" />
              <input value={addForm.dogname} onChange={(e) => setAddForm({ ...addForm, dogname: e.target.value })} placeholder="Dog name" className="px-4 py-3 border rounded-lg" />
              <input value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} placeholder="Email" className="px-4 py-3 border rounded-lg" />
              <input value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} placeholder="Phone" className="px-4 py-3 border rounded-lg" />
              <input value={addForm.dogbreed} onChange={(e) => setAddForm({ ...addForm, dogbreed: e.target.value })} placeholder="Dog breed" className="px-4 py-3 border rounded-lg" />
              <select value={addForm.serviceid} onChange={(e) => setAddForm({ ...addForm, serviceid: e.target.value })} className="px-4 py-3 border rounded-lg">
                {SERVICES.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
              <select value={addForm.locationid} onChange={(e) => setAddForm({ ...addForm, locationid: e.target.value })} className="px-4 py-3 border rounded-lg">
                {LOCATIONS.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <input type="date" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} className="px-4 py-3 border rounded-lg" />
              <select value={SLOT_TIMES.includes(addForm.confirmed_time) ? addForm.confirmed_time : ""} onChange={(e) => setAddForm({ ...addForm, confirmed_time: e.target.value, confirmed_duration_minutes: 120 })} className="px-4 py-3 border rounded-lg">
                <option value="">Quick slot (2 hrs)...</option>
                {SLOT_TIMES.map((slot) => (
                  <option key={slot} value={slot} disabled={!addFormAvailableSlots.includes(slot)}>
                    {slot} (2 hrs){!addFormAvailableSlots.includes(slot) ? " — booked" : ""}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 md:col-span-2 flex-wrap">
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Or exact time</label>
                <input type="time" value={addForm.confirmed_time} onChange={(e) => setAddForm({ ...addForm, confirmed_time: e.target.value })} className="px-4 py-3 border rounded-lg" />
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">for</label>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={addForm.confirmed_duration_minutes}
                  onChange={(e) => setAddForm({ ...addForm, confirmed_duration_minutes: Math.max(15, Number(e.target.value) || 120) })}
                  className="px-4 py-3 border rounded-lg w-24"
                />
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">mins</label>
                {(() => {
                  const weeksAgo = getLastBookingWeeksAgo(addForm.email, addForm.phone);
                  if (weeksAgo === null) return null;
                  return (
                    <span className="text-xs font-black text-rose-600 whitespace-nowrap">
                      ⚠ Last booked {weeksAgo} week{weeksAgo === 1 ? "" : "s"} ago
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Number of dogs</label>
                <input
                  type="number"
                  min={1}
                  value={addForm.number_of_dogs}
                  onChange={(e) => {
                    const n = Math.max(1, Number(e.target.value) || 1);
                    setAddForm({ ...addForm, number_of_dogs: n, deposit_amount: n * 20 });
                  }}
                  className="px-4 py-3 border rounded-lg w-full"
                />
              </div>
              <textarea value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} placeholder="Notes" className="md:col-span-2 px-4 py-3 border rounded-lg min-h-24" />
            </div>

            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="text-sm font-bold text-amber-900 mb-3">
                £{addForm.deposit_amount} Deposit Status
                {addForm.number_of_dogs > 1 && <span className="font-normal text-amber-700"> (£20 × {addForm.number_of_dogs} dogs)</span>}
              </h4>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addForm.deposit_paid}
                    onChange={(e) => setAddForm({ ...addForm, deposit_paid: e.target.checked })}
                    className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-amber-900">Deposit Paid</span>
                </label>
                {addForm.deposit_paid && (
                  <span className="text-xs text-emerald-600 font-semibold">✓ Confirmed</span>
                )}
              </div>
              <input
                type="text"
                value={addForm.deposit_notes}
                onChange={(e) => setAddForm({ ...addForm, deposit_notes: e.target.value })}
                placeholder="Deposit notes (optional - payment method, date, etc.)"
                className="mt-3 w-full px-3 py-2 border border-amber-200 rounded-lg text-sm"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
              <span className="text-sm font-semibold text-blue-900">Send booking confirmation to customer?</span>
              <p className="text-xs text-blue-700 mt-0.5 mb-2">Sends the booking details to {addForm.phone || "customer's phone"}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setAddForm({ ...addForm, confirm_channel: "whatsapp" })} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${addForm.confirm_channel === "whatsapp" ? "bg-green-500 text-white shadow" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
                  📱 WhatsApp (free)
                </button>
                <button type="button" onClick={() => setAddForm({ ...addForm, confirm_channel: "sms" })} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${addForm.confirm_channel === "sms" ? "bg-blue-500 text-white shadow" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
                  💬 SMS (~4p)
                </button>
                <button type="button" onClick={() => setAddForm({ ...addForm, confirm_channel: "none" })} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${addForm.confirm_channel === "none" ? "bg-slate-700 text-white shadow" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
                  Don't send
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button disabled={isWorking} onClick={() => handleAddBooking(false)} title="Adds the booking as confirmed" className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                {isWorking ? "Adding..." : addForm.confirm_channel === "sms" ? "Add & Send SMS" : addForm.confirm_channel === "whatsapp" ? "Add & Send WhatsApp" : "Add Booking (Confirmed)"}
              </button>
              <button disabled={isWorking} onClick={() => handleAddBooking(true)} title="Adds the booking as pending — no notification sent, review it later" className="bg-amber-100 hover:bg-amber-200 disabled:opacity-60 text-amber-800 px-5 py-2 rounded-lg font-bold">
                Hold Booking (Pending)
              </button>
              <button onClick={() => setShowAddModal(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2 rounded-lg font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
