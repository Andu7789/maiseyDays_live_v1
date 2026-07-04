import React, { useEffect, useMemo, useState } from "react";
import { buildConfirmationMessage, checkAuthStatus, confirmAppointmentBooking, createManualAppointment, deleteAppointment, exportAppointmentsToExcel, findBookingClash, getAppointments, getCurrentUser, getEffectiveSchedule, getReminderSettings, getUnavailableDays, getUnavailableWeekdays, removeUnavailableDay, removeUnavailableWeekday, saveUnavailableDay, saveUnavailableWeekday, sendCustomerConfirmationSms, signInAdmin, signOutAdmin, updateAppointment, updateReminderSettings, getHolidaySettings, updateHolidaySettings, updateAdvertSettings, getDogNotes, getAllDogNotes, upsertDogNote } from "../services/bookingService";
import { buildIntakeLink, buildIntakeMessage, buildWhatsAppLink, createCustomer, deleteCustomer, ensureIntakeToken, getCustomers, markIntakeSent, sendIntakeEmail, sendIntakeSms, updateCustomer } from "../services/customerService";
import { Appointment, Customer, IntakeStatus, Service } from "../types";
import { INTAKE_TERMS, LOCATIONS, SERVICES, SLOT_TIMES } from "../constants";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ALL_LOCATIONS = "__all__";

const getMonday = (source: Date) => {
  const copy = new Date(source);
  copy.setDate(copy.getDate() + (copy.getDay() === 0 ? -6 : 1 - copy.getDay()));
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const toDateString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const AdminDashboard: React.FC = () => {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [view, setView] = useState<"bookings" | "diary" | "unavailable" | "services" | "settings" | "customers">("bookings");
  const [selectedLocation, setSelectedLocation] = useState(LOCATIONS[0].id);
  const [isLoading, setIsLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [unavailableDays, setUnavailableDays] = useState<string[]>([]);
  const [unavailableWeekdays, setUnavailableWeekdays] = useState<number[]>([]);
  const [services, setServices] = useState<Service[]>(SERVICES);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [newService, setNewService] = useState<Partial<Service>>({});

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeBooking, setActiveBooking] = useState<Appointment | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [pendingConfirmChannel, setPendingConfirmChannel] = useState<"sms" | "whatsapp">("sms");
  const [diaryWeekStart, setDiaryWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [diarySearch, setDiarySearch] = useState("");

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
  const [advertSaving, setAdvertSaving] = useState(false);
  const [advertStatus, setAdvertStatus] = useState<"idle" | "saved" | "error">("idle");
  const [advertError, setAdvertError] = useState<string>("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [intakeFilter, setIntakeFilter] = useState<"all" | IntakeStatus>("all");
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [addCustomerForm, setAddCustomerForm] = useState({ ownername: "", email: "", phone: "" });
  const [sendingIntake, setSendingIntake] = useState<string | null>(null);
  const [showAgreementDetails, setShowAgreementDetails] = useState(false);
  const [editingCustomerInfo, setEditingCustomerInfo] = useState(false);
  const [customerInfoForm, setCustomerInfoForm] = useState({ ownername: "", email: "", phone: "", address: "" });
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
    deposit_paid: false,
    deposit_amount: 20,
    deposit_notes: "",
    deposit_paid_at: null as string | null,
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
    deposit_paid: false,
    deposit_amount: 20,
    deposit_notes: "",
    send_sms: true,
  });

  // Pagination and sorting state
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusSort, setStatusSort] = useState<'asc' | 'desc' | null>(null);
  const [bookingsSearch, setBookingsSearch] = useState("");

  // Filter, sort, and paginate appointments
  const filteredAppointments = useMemo(() => {
    const search = bookingsSearch.trim().toLowerCase();
    let filtered = appointments.filter((a) => selectedLocation === ALL_LOCATIONS || a.locationid === selectedLocation);
    if (search) {
      filtered = filtered.filter(
        (a) =>
          (a.dogname || "").toLowerCase().includes(search) ||
          (a.ownername || "").toLowerCase().includes(search) ||
          (a.phone || "").replace(/\s+/g, "").includes(search.replace(/\s+/g, "")),
      );
    }
    // Sort by status if selected
    if (statusSort) {
      filtered = filtered.sort((a, b) => {
        const aStatus = a.status || '';
        const bStatus = b.status || '';
        if (aStatus === bStatus) return 0;
        return statusSort === 'asc' ? aStatus.localeCompare(bStatus) : bStatus.localeCompare(aStatus);
      });
    } else {
      // Default: latest first
      filtered = filtered.sort((a, b) => {
        if (a.confirmation_sent_at && b.confirmation_sent_at) {
          return (b.confirmation_sent_at as string).localeCompare(a.confirmation_sent_at as string);
        }
        if (a.id && b.id) {
          return (b.id as string).localeCompare(a.id as string);
        }
        return (b.date || '').localeCompare(a.date || '');
      });
    }
    return filtered;
  }, [appointments, selectedLocation, statusSort, bookingsSearch]);

  const totalPages = Math.ceil(filteredAppointments.length / pageSize);
  const paginatedAppointments = filteredAppointments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Jump back to page 1 whenever the search changes so results are visible
  useEffect(() => {
    setCurrentPage(1);
  }, [bookingsSearch]);

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

  const servicePriceFor = (serviceid: string) => (serviceid === "full-groom" ? 35 : serviceid === "bath-brush" ? 25 : serviceid === "puppy-intro" ? 15 : serviceid === "nail-clipping" ? 12 : serviceid === "home-grooming" ? 45 : 0);

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
    if (!window.confirm(`Delete ${customer.ownername}'s customer record? Their booking history will be kept, but the agreement and dog details will be removed. This cannot be undone.`)) return;
    try {
      await deleteCustomer(customer.id);
      setShowCustomerModal(false);
      await refreshCustomers();
    } catch (err: any) {
      alert(`Could not delete customer: ${err.message}`);
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
      ${customer.signature_data ? `<img class="signature" src="${customer.signature_data}" alt="Signature" />` : "<p>Not signed.</p>"}
      <p><strong>Date:</strong> ${signedDate}</p>
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
      deposit_paid: booking.deposit_paid || false,
      deposit_amount: booking.deposit_amount || 20,
      deposit_notes: booking.deposit_notes || "",
      deposit_paid_at: booking.deposit_paid_at || null,
    });
    setShowUpdateModal(true);
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
      deposit_paid: false,
      deposit_amount: 20,
      deposit_notes: "",
      send_sms: true,
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
        deposit_paid: editForm.deposit_paid,
        deposit_amount: editForm.deposit_amount,
        deposit_paid_at: editForm.deposit_paid ? new Date().toISOString() : null,
        deposit_notes: editForm.deposit_notes,
      });
      await loadData();
      alert("Booking updated.");
    } catch (error: any) {
      alert(error.message || "Could not update booking.");
    } finally {
      setIsWorking(false);
    }
  };

  const confirmBooking = async (channel: "sms" | "whatsapp") => {
    if (!activeBooking?.id) return;
    if (!editForm.confirmed_date || !editForm.confirmed_time || !editForm.confirmed_duration_minutes) {
      alert("Please set confirmed date, time and duration first.");
      return;
    }
    if (!editForm.phone) {
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

  const proceedWithConfirmation = async (channel: "sms" | "whatsapp" = pendingConfirmChannel) => {
    if (!activeBooking?.id) return;

    const clash = await findBookingClash(activeBooking.locationid, editForm.confirmed_date, editForm.confirmed_time, Number(editForm.confirmed_duration_minutes) || 120, activeBooking.id);
    if (clash) {
      const clashTime = getEffectiveSchedule(clash)?.timeLabel || "";
      if (!window.confirm(`⚠️ DOUBLE BOOKING WARNING\n\n${clash.dogname} (${clash.ownername}) is already booked at ${clashTime} on this day.\n\nConfirm this booking anyway?`)) return;
    }

    const shouldConfirm = window.confirm(`Confirm this booking and send the ${channel === "whatsapp" ? "WhatsApp message" : "SMS"}?`);
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
      alert(channel === "whatsapp" ? "Booking confirmed — WhatsApp message opened, just press send." : "Booking confirmed and SMS sent.");
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

  const handleMarkCompleted = async (booking: Appointment) => {
    if (!booking.id) return;
    const shouldComplete = window.confirm(`Mark ${booking.dogname}'s appointment as completed?`);
    if (!shouldComplete) return;

    try {
      await updateAppointment(booking.id, {
        booking_status: "completed",
        completed_at: new Date().toISOString(),
      });
      await loadData();
      alert("Appointment marked as completed. Customer will receive a 28-day rebooking reminder.");
    } catch (error: any) {
      alert(error.message || "Could not mark as completed.");
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
      deposit_paid: false,
      deposit_amount: 20,
      deposit_notes: "",
      send_sms: true,
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

  const handleAddBooking = async () => {
    if (!addForm.ownername || !addForm.dogname || !addForm.email || !addForm.phone) {
      alert("Please fill owner name, dog name, email and phone.");
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
        status: "confirmed",
        booking_status: "confirmed",
        booking_source: "manual",
        deposit_paid: addForm.deposit_paid,
        deposit_amount: addForm.deposit_amount,
        deposit_paid_at: addForm.deposit_paid ? new Date().toISOString() : null,
        deposit_notes: addForm.deposit_notes,
      });

      const createdBooking = Array.isArray(result) ? result[0] : null;

      if (addForm.send_sms && createdBooking?.id) {
        const nowIso = new Date().toISOString();
        try {
          await sendCustomerConfirmationSms({
            ...createdBooking,
            confirmed_date: addForm.date,
            confirmed_time: addForm.confirmed_time,
            confirmed_duration_minutes: addForm.confirmed_duration_minutes,
          });
          await updateAppointment(createdBooking.id, {
            is_confirmed: true,
            confirmed_at: nowIso,
            confirmation_sent_at: nowIso,
          });
        } catch (smsErr: any) {
          alert(`Booking created but SMS failed to send: ${smsErr.message}`);
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
        deposit_paid: false,
        deposit_amount: 20,
        deposit_notes: "",
        send_sms: true,
      });
      alert(addForm.send_sms ? "Booking added and SMS confirmation sent." : "Booking added.");
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
          </div>

          {/* Pagination and sorting controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2 border-b bg-slate-50">
            <div className="flex items-center gap-2">
              <label className="font-bold text-xs text-slate-600">Rows per page:</label>
              <button className={`px-2 py-1 rounded border text-xs ${pageSize === 10 ? 'bg-emerald-100 text-emerald-700' : 'bg-white hover:bg-slate-100'}`} onClick={() => { setPageSize(10); setCurrentPage(1); }}>10</button>
              <button className={`px-2 py-1 rounded border text-xs ${pageSize === 20 ? 'bg-emerald-100 text-emerald-700' : 'bg-white hover:bg-slate-100'}`} onClick={() => { setPageSize(20); setCurrentPage(1); }}>20</button>
              <button className={`px-2 py-1 rounded border text-xs ${pageSize === 30 ? 'bg-emerald-100 text-emerald-700' : 'bg-white hover:bg-slate-100'}`} onClick={() => { setPageSize(30); setCurrentPage(1); }}>30</button>
            </div>
            <div className="flex items-center gap-2">
              <label className="font-bold text-xs text-slate-600">Sort by status:</label>
              <button onClick={() => { setStatusSort(statusSort === 'asc' ? 'desc' : 'asc'); setCurrentPage(1); }} className={`px-2 py-1 rounded border text-xs ${statusSort ? 'bg-emerald-100 text-emerald-700' : 'bg-white hover:bg-slate-100'}`}>{statusSort === 'asc' ? 'Ascending' : statusSort === 'desc' ? 'Descending' : 'None'}</button>
              {statusSort && <button onClick={() => setStatusSort(null)} className="px-2 py-1 rounded border text-xs bg-white hover:bg-slate-100">Clear</button>}
            </div>
            <div className="flex items-center gap-2">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-2 py-1 rounded border text-xs bg-white hover:bg-slate-100">Prev</button>
              <span className="text-xs">Page {currentPage} of {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="px-2 py-1 rounded border text-xs bg-white hover:bg-slate-100">Next</button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-slate-500">Loading bookings...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[980px]">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-4 font-bold text-slate-600">Dog & Owner</th>
                    <th className="p-4 font-bold text-slate-600">Service</th>
                    <th className="p-4 font-bold text-slate-600">Requested</th>
                    <th className="p-4 font-bold text-slate-600">Confirmed Date</th>
                    <th className="p-4 font-bold text-slate-600">Time</th>
                    <th className="p-4 font-bold text-slate-600">Duration</th>
                    <th className="p-4 font-bold text-slate-600">Status</th>
                    <th className="p-4 font-bold text-slate-600">Deposit</th>
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
              <select value={editForm.confirmed_time} onChange={(e) => setEditForm({ ...editForm, confirmed_time: e.target.value, confirmed_duration_minutes: 120 })} className="px-4 py-3 border rounded-lg">
                <option value="">Confirmed time slot</option>
                {SLOT_TIMES.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot} (2 hrs)
                  </option>
                ))}
                {editForm.confirmed_time && !SLOT_TIMES.includes(editForm.confirmed_time) && <option value={editForm.confirmed_time}>{editForm.confirmed_time} (custom)</option>}
              </select>
              <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notes" className="md:col-span-2 px-4 py-3 border rounded-lg min-h-24" />
            </div>

            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="text-sm font-bold text-amber-900 mb-3">£20 Deposit Status</h4>
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
              <button onClick={closeUpdateModal} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2 rounded-lg font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showDepositModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💰</span>
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">Deposit Reminder</h3>
              <p className="text-sm text-slate-600">Has the customer paid their £20 deposit?</p>
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
        for (let i = 0; i < 5; i++) {
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
        const isClosedDay = (date: string) => unavailableDays.includes(date) || unavailableWeekdays.includes(new Date(`${date}T00:00:00`).getDay());

        const chipStyle = (apt: Appointment) => {
          const status = apt.booking_status || apt.status || "pending";
          if (status === "completed") return "bg-blue-50 border-blue-200 text-blue-800";
          if (status === "confirmed") return "bg-emerald-50 border-emerald-300 text-emerald-800";
          if (status === "cancelled") return "bg-slate-100 border-slate-200 text-slate-400 line-through";
          if (status === "due_for_rebook") return "bg-purple-50 border-purple-200 text-purple-800";
          return "bg-amber-50 border-amber-300 text-amber-800";
        };

        const weekLabel = `${new Date(`${weekDates[0]}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(`${weekDates[4]}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
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
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-200 border border-slate-300"></span> Closed day</span>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                {/* Day headers */}
                <div className="grid grid-cols-[64px_repeat(5,1fr)] gap-2 mb-2">
                  <div></div>
                  {weekDates.map((date) => {
                    const d = new Date(`${date}T00:00:00`);
                    const closed = isClosedDay(date);
                    return (
                      <div key={date} className={`text-center py-2 rounded-xl ${date === todayStr ? "bg-teal-600 text-white" : closed ? "bg-slate-100 text-slate-400" : "bg-slate-50 text-slate-700"}`}>
                        <div className="text-xs font-black uppercase">{DAYS[d.getDay()]}</div>
                        <div className="text-sm font-bold">{d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                        {closed && <div className="text-[10px] font-black uppercase">Closed</div>}
                      </div>
                    );
                  })}
                </div>

                {/* Slot rows */}
                {SLOT_TIMES.map((slot) => (
                  <div key={slot} className="grid grid-cols-[64px_repeat(5,1fr)] gap-2 mb-2">
                    <div className="text-xs font-black text-slate-400 pt-3 text-right pr-1">{slot}</div>
                    {weekDates.map((date) => {
                      const cellBookings = bookingsFor(date, slot);
                      const closed = isClosedDay(date);
                      return (
                        <div key={`${date}-${slot}`} className={`min-h-[64px] rounded-xl border p-1.5 space-y-1.5 ${closed ? "bg-slate-50 border-slate-100" : cellBookings.length > 1 ? "bg-red-50 border-red-200" : "bg-white border-slate-100"}`}>
                          {cellBookings.map(({ apt, schedule }) => (
                            <button key={apt.id} onClick={() => openUpdateModal(apt)} className={`w-full text-left px-2 py-1.5 rounded-lg border text-xs font-bold hover:shadow transition-all ${chipStyle(apt)}`}>
                              <span className="block truncate">🐕 {apt.dogname}</span>
                              <span className="block truncate font-medium opacity-75">
                                {schedule.timeLabel !== slot ? `${schedule.timeLabel} · ` : ""}
                                {SERVICES.find((s) => s.id === apt.serviceid)?.name?.split(" ")[0] || apt.serviceid}
                                {selectedLocation === ALL_LOCATIONS ? ` · ${LOCATIONS.find((l) => l.id === apt.locationid)?.name?.split(" ")[0] || ""}` : ""}
                              </span>
                            </button>
                          ))}
                          {cellBookings.length > 1 && <div className="text-[10px] font-black text-red-500 text-center uppercase">Double booked</div>}
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
            totalSpent += servicePriceFor(apt.serviceid);
            if (apt.booking_status === "completed" && apt.completed_at && (!lastVisit || apt.completed_at > lastVisit)) lastVisit = apt.completed_at;
            if (apt.booking_status === "confirmed" && apt.confirmed_date && (!nextVisit || apt.confirmed_date < nextVisit)) nextVisit = apt.confirmed_date;
          });
          return { customer, bookings, dogNames: Array.from(dogNameSet), totalSpent, lastVisit, nextVisit };
        });

        const search = customerSearch.toLowerCase();
        const filteredCustomers = enriched.filter(({ customer, dogNames }) => {
          if (intakeFilter !== "all" && customer.intake_status !== intakeFilter) return false;
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
                  £{enriched.reduce((sum, c) => sum + c.totalSpent, 0)}
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
                  {customerSearch || intakeFilter !== "all" ? "No customers found matching your search" : "No customers yet — add one or wait for a web booking to come in"}
                </div>
              )}

              {filteredCustomers.map(({ customer, bookings, dogNames, totalSpent, lastVisit, nextVisit }) => (
                <div
                  key={customer.id}
                  className="p-6 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedCustomer(customer.id);
                    setShowCustomerModal(true);
                    setShowAgreementDetails(false);
                    setEditingCustomerInfo(false);
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
                      <div className="text-2xl font-black text-emerald-600">£{totalSpent}</div>
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
        const totalSpent = customerData.reduce((sum, apt) => sum + servicePriceFor(apt.serviceid), 0);

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
                  </div>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-emerald-50 p-4 rounded-xl text-center">
                  <div className="text-3xl font-black text-emerald-700">{customerData.length}</div>
                  <div className="text-xs font-bold text-emerald-600">Total Visits</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl text-center">
                  <div className="text-3xl font-black text-blue-700">£{totalSpent}</div>
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
                          {(intakeDog.behaviour_notes || "").trim() && <div className="col-span-2 md:col-span-4"><span className="font-bold">Behaviour:</span> {intakeDog.behaviour_notes}</div>}
                          {(intakeDog.health_conditions || "").trim() && <div className="col-span-2 md:col-span-4"><span className="font-bold">Health/skin:</span> {intakeDog.health_conditions}</div>}
                          {(intakeDog.medication_details || "").trim() && <div className="col-span-2 md:col-span-4"><span className="font-bold">Medication:</span> {intakeDog.medication_details}</div>}
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

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setAddForm({
                      ownername: customer.ownername,
                      email: customer.email || "",
                      phone: customer.phone || "",
                      dogname: dogs[0] || "",
                      dogbreed: intakeDogByName(dogs[0] || "")?.breed || "",
                      serviceid: preferredService?.[0] || SERVICES[0].id,
                      locationid: LOCATIONS[0].id,
                      date: new Date().toISOString().split("T")[0],
                      confirmed_time: "",
                      confirmed_duration_minutes: 120,
                      notes: "",
                      deposit_paid: false,
                      deposit_amount: 20,
                      deposit_notes: "",
                      send_sms: false,
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

      {/* Add Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-black text-slate-800 mb-1">Add New Customer</h3>
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
              <select value={addForm.confirmed_time} onChange={(e) => setAddForm({ ...addForm, confirmed_time: e.target.value, confirmed_duration_minutes: 120 })} className="px-4 py-3 border rounded-lg">
                <option value="">Time slot</option>
                {SLOT_TIMES.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot} (2 hrs)
                  </option>
                ))}
              </select>
              <textarea value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} placeholder="Notes" className="md:col-span-2 px-4 py-3 border rounded-lg min-h-24" />
            </div>

            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="text-sm font-bold text-amber-900 mb-3">£20 Deposit Status</h4>
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
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addForm.send_sms}
                  onChange={(e) => setAddForm({ ...addForm, send_sms: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                <div>
                  <span className="text-sm font-semibold text-blue-900">Send SMS confirmation to customer</span>
                  <p className="text-xs text-blue-700 mt-0.5">Sends a confirmation text with the booking details to {addForm.phone || "customer's phone"}</p>
                </div>
              </label>
            </div>

            <div className="flex gap-3 mt-4">
              <button disabled={isWorking} onClick={handleAddBooking} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                {isWorking ? "Adding..." : addForm.send_sms ? "Add & Send SMS" : "Add Booking"}
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
