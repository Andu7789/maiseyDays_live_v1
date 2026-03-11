import React, { useEffect, useMemo, useState } from "react";
import { checkAuthStatus, confirmAppointmentBooking, createManualAppointment, deleteAppointment, exportAppointmentsToExcel, getAppointments, getCurrentUser, getLastAutoSyncTime, getReminderSettings, getUnavailableDays, getUnavailableWeekdays, removeUnavailableDay, removeUnavailableWeekday, saveUnavailableDay, saveUnavailableWeekday, sendCustomerConfirmationSms, signInAdmin, signOutAdmin, syncBookingToCalendar, syncCalendarChangesFromDiary, updateAppointment, updateReminderSettings } from "../services/bookingService";
import { Appointment, Service } from "../types";
import { LOCATIONS, SERVICES } from "../constants";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DIARY_URL = "https://calendar.google.com/calendar/u/0/r/week";
const ALL_LOCATIONS = "__all__";

const AdminDashboard: React.FC = () => {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [view, setView] = useState<"bookings" | "unavailable" | "services" | "settings" | "customers">("bookings");
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
  const [lastAutoSync, setLastAutoSync] = useState<Date | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);

  const [reminderSettings, setReminderSettings] = useState({
    enabled_28day: true,
    days_interval: 28,
    reminder_email: "",
    enabled_next_day: true,
    next_day_time: "17:00",
    split_by_location: true,
  });

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);

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
    confirmed_duration_minutes: 90,
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
    confirmed_duration_minutes: 90,
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

  // Filter, sort, and paginate appointments
  const filteredAppointments = useMemo(() => {
    let filtered = appointments.filter((a) => selectedLocation === ALL_LOCATIONS || a.locationid === selectedLocation);
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
  }, [appointments, selectedLocation, statusSort]);

  const totalPages = Math.ceil(filteredAppointments.length / pageSize);
  const paginatedAppointments = filteredAppointments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
      const [apps, unavail, unavailWeekdays, lastSync, remSettings] = await Promise.all([
        getAppointments(),
        getUnavailableDays(selectedLocation),
        getUnavailableWeekdays(),
        getLastAutoSyncTime(),
        getReminderSettings().catch(() => null)
      ]);
      setAppointments(apps);
      setUnavailableDays(unavail);
      setUnavailableWeekdays(unavailWeekdays);
      setLastAutoSync(lastSync);
      if (remSettings) {
        setReminderSettings(remSettings);
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
      confirmed_time: booking.confirmed_time || "",
      confirmed_duration_minutes: booking.confirmed_duration_minutes || 90,
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
      confirmed_duration_minutes: 90,
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
      if (editForm.confirmed_date && editForm.confirmed_time) {
        try {
          await syncBookingToCalendar(activeBooking.id);
        } catch (syncError: any) {
          alert(syncError.message || "Booking saved, but calendar sync failed.");
        }
      }
      await loadData();
      alert("Booking updated.");
    } catch (error: any) {
      alert(error.message || "Could not update booking.");
    } finally {
      setIsWorking(false);
    }
  };

  const confirmBooking = async () => {
    if (!activeBooking?.id) return;
    if (!editForm.confirmed_date || !editForm.confirmed_time || !editForm.confirmed_duration_minutes) {
      alert("Please set confirmed date, time and duration first.");
      return;
    }

    // Check if deposit is paid - if not, show deposit confirmation modal
    if (!editForm.deposit_paid) {
      setShowDepositModal(true);
      return;
    }

    // Proceed with confirmation
    await proceedWithConfirmation();
  };

  const proceedWithConfirmation = async () => {
    if (!activeBooking?.id) return;

    const shouldConfirm = window.confirm("Do you want to confirm this booking?");
    if (!shouldConfirm) return;

    setIsWorking(true);
    try {
      await confirmAppointmentBooking(
        {
          ...activeBooking,
          ownername: editForm.ownername,
          dogname: editForm.dogname,
          serviceid: editForm.serviceid,
          phone: editForm.phone,
          locationid: activeBooking.locationid,
        },
        {
          confirmedDate: editForm.confirmed_date,
          confirmedTime: editForm.confirmed_time,
          confirmedDurationMinutes: Number(editForm.confirmed_duration_minutes),
        },
      );

      await loadData();
      closeUpdateModal();
      alert("Booking confirmed and SMS sent.");
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
      confirmed_duration_minutes: booking.confirmed_duration_minutes || 90,
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
          try {
            await syncBookingToCalendar(createdBooking.id);
          } catch (syncErr: any) {
            await updateAppointment(createdBooking.id, {
              calendar_sync_status: "error",
              calendar_last_error: syncErr?.message || "Calendar sync failed",
            });
          }
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
        confirmed_duration_minutes: 90,
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

  const handleSyncDiaryChanges = async () => {
    setIsWorking(true);
    try {
      const result = await syncCalendarChangesFromDiary();
      await loadData(); // This will also refresh lastAutoSync
      alert(`Diary sync complete. Linked: ${result.totalLinked}, Scanned: ${result.scanned}, Synced: ${result.synced}, Updated: ${result.updated}, Errors: ${result.errors}`);
    } catch (error: any) {
      alert(error.message || "Could not sync diary changes.");
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
          <button onClick={() => setView("customers")} className={`px-4 py-2 rounded-lg font-bold transition-all ${view === "customers" ? "bg-white shadow-sm text-emerald-600" : "text-slate-600"}`}>
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
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                {lastAutoSync ? `Last sync: ${(() => {
                  const now = new Date();
                  const diffMs = now.getTime() - lastAutoSync.getTime();
                  const diffMins = Math.floor(diffMs / 60000);
                  if (diffMins < 1) return "just now";
                  if (diffMins === 1) return "1 min ago";
                  if (diffMins < 60) return `${diffMins} mins ago`;
                  const diffHours = Math.floor(diffMins / 60);
                  if (diffHours === 1) return "1 hour ago";
                  if (diffHours < 24) return `${diffHours} hours ago`;
                  return lastAutoSync.toLocaleString();
                })()}` : "Auto-sync active (every 10 minutes)"}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSyncDiaryChanges} disabled={isWorking} className="bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white px-6 py-2 rounded-lg font-bold text-sm transition-all">
                ↻ Sync Diary Changes
              </button>
              <button onClick={openAddModal} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold text-sm transition-all">
                + Add New
              </button>
              <button onClick={() => exportAppointmentsToExcel(filteredAppointments)} className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg font-bold text-sm transition-all">
                ⬇️ Export to CSV
              </button>
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
                    <th className="p-4 font-bold text-slate-600">Diary Sync</th>
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
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${app.calendar_sync_status === "synced" ? "bg-emerald-100 text-emerald-700" : app.calendar_sync_status === "error" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`} title={app.calendar_last_error || ""}>
                            {app.calendar_sync_status === "synced" ? "Synced" : app.calendar_sync_status === "error" ? "Error" : "Not Synced"}
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
              <a href={DIARY_URL} target="_blank" rel="noreferrer" className="text-sm font-bold text-teal-700 hover:text-teal-900 underline">
                Open Diary
              </a>
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
                <option value="">Requested preference</option>
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Evening">Evening</option>
              </select>
              <input type="date" value={editForm.confirmed_date} onChange={(e) => setEditForm({ ...editForm, confirmed_date: e.target.value })} className="px-4 py-3 border rounded-lg" />
              <input type="time" value={editForm.confirmed_time} onChange={(e) => setEditForm({ ...editForm, confirmed_time: e.target.value })} className="px-4 py-3 border rounded-lg" />
              <input type="number" min={15} step={15} value={editForm.confirmed_duration_minutes} onChange={(e) => setEditForm({ ...editForm, confirmed_duration_minutes: Number(e.target.value) })} placeholder="Duration (mins)" className="px-4 py-3 border rounded-lg" />
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
              <button disabled={isWorking} onClick={confirmBooking} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                Confirm Booking
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

      {view === "customers" && (() => {
        // Group appointments by customer (email + owner name)
        const customerMap = new Map<string, {
          ownername: string;
          email: string;
          phone: string;
          dogs: Set<string>;
          bookings: Appointment[];
          totalSpent: number;
          lastVisit: string | null;
          nextVisit: string | null;
        }>();

        appointments.forEach(apt => {
          const key = `${apt.email}-${apt.ownername}`;
          if (!customerMap.has(key)) {
            customerMap.set(key, {
              ownername: apt.ownername,
              email: apt.email,
              phone: apt.phone || "",
              dogs: new Set(),
              bookings: [],
              totalSpent: 0,
              lastVisit: null,
              nextVisit: null,
            });
          }
          const customer = customerMap.get(key)!;
          customer.dogs.add(apt.dogname);
          customer.bookings.push(apt);

          // Calculate spend
          const servicePrice = apt.serviceid === 'full-groom' ? 35 :
                              apt.serviceid === 'bath-brush' ? 25 :
                              apt.serviceid === 'puppy-intro' ? 15 :
                              apt.serviceid === 'nail-clipping' ? 12 :
                              apt.serviceid === 'home-grooming' ? 45 : 0;
          customer.totalSpent += servicePrice;

          // Track last and next visits
          if (apt.booking_status === "completed" && apt.completed_at) {
            if (!customer.lastVisit || apt.completed_at > customer.lastVisit) {
              customer.lastVisit = apt.completed_at;
            }
          }
          if (apt.booking_status === "confirmed" && apt.confirmed_date) {
            if (!customer.nextVisit || apt.confirmed_date < customer.nextVisit) {
              customer.nextVisit = apt.confirmed_date;
            }
          }
        });

        const customers = Array.from(customerMap.values());

        // Filter by search
        const filteredCustomers = customers.filter(c =>
          c.ownername.toLowerCase().includes(customerSearch.toLowerCase()) ||
          c.email.toLowerCase().includes(customerSearch.toLowerCase()) ||
          c.phone.includes(customerSearch) ||
          Array.from(c.dogs).some(dog => dog.toLowerCase().includes(customerSearch.toLowerCase()))
        );

        return (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
            <h2 className="text-2xl font-black mb-6 text-slate-800">Customer Database</h2>

            {/* Search Bar */}
            <div className="mb-6">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search by customer name, email, phone, or dog name..."
                className="w-full px-6 py-4 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                <div className="text-2xl font-black text-emerald-700">{customers.length}</div>
                <div className="text-xs font-bold text-emerald-600 uppercase">Total Customers</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                <div className="text-2xl font-black text-blue-700">{appointments.length}</div>
                <div className="text-xs font-bold text-blue-600 uppercase">Total Bookings</div>
              </div>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                <div className="text-2xl font-black text-amber-700">
                  £{customers.reduce((sum, c) => sum + c.totalSpent, 0)}
                </div>
                <div className="text-xs font-bold text-amber-600 uppercase">Total Revenue</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                <div className="text-2xl font-black text-purple-700">
                  £{Math.round(customers.reduce((sum, c) => sum + c.totalSpent, 0) / Math.max(customers.length, 1))}
                </div>
                <div className="text-xs font-bold text-purple-600 uppercase">Avg Per Customer</div>
              </div>
            </div>

            {/* Customer List */}
            <div className="space-y-3">
              {filteredCustomers.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  {customerSearch ? "No customers found matching your search" : "No customers yet"}
                </div>
              )}

              {filteredCustomers.map((customer, idx) => (
                <div
                  key={idx}
                  className="p-6 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedCustomer(`${customer.email}-${customer.ownername}`);
                    setShowCustomerModal(true);
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-black text-slate-800">{customer.ownername}</h3>
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                          {customer.bookings.length} booking{customer.bookings.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 space-y-1">
                        <div>🐕 {Array.from(customer.dogs).join(', ')}</div>
                        <div>📧 {customer.email}</div>
                        {customer.phone && <div>📞 {customer.phone}</div>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-emerald-600">£{customer.totalSpent}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {customer.lastVisit && `Last: ${new Date(customer.lastVisit).toLocaleDateString('en-GB')}`}
                      </div>
                      {customer.nextVisit && (
                        <div className="text-xs text-blue-600 font-bold mt-1">
                          Next: {new Date(customer.nextVisit).toLocaleDateString('en-GB')}
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
        const customerData = appointments.filter(apt =>
          `${apt.email}-${apt.ownername}` === selectedCustomer
        );
        if (customerData.length === 0) return null;

        const customer = customerData[0];
        const dogs = [...new Set(customerData.map(apt => apt.dogname))];
        const totalSpent = customerData.reduce((sum, apt) => {
          const price = apt.serviceid === 'full-groom' ? 35 :
                       apt.serviceid === 'bath-brush' ? 25 :
                       apt.serviceid === 'puppy-intro' ? 15 :
                       apt.serviceid === 'nail-clipping' ? 12 :
                       apt.serviceid === 'home-grooming' ? 45 : 0;
          return sum + price;
        }, 0);

        // Count service preferences
        const serviceCount = customerData.reduce((acc, apt) => {
          acc[apt.serviceid] = (acc[apt.serviceid] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const preferredService = Object.entries(serviceCount).sort((a, b) => b[1] - a[1])[0];

        return (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-2xl p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black text-slate-800">{customer.ownername}</h3>
                  <p className="text-slate-600">{customer.email}</p>
                  {customer.phone && <p className="text-slate-600">{customer.phone}</p>}
                </div>
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
                >
                  ×
                </button>
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
                  <div className="text-sm font-black text-amber-700">{SERVICES.find(s => s.id === preferredService[0])?.name || '-'}</div>
                  <div className="text-xs font-bold text-amber-600">Preferred Service</div>
                </div>
              </div>

              {/* Dogs */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-slate-700 mb-3">Dogs</h4>
                <div className="flex flex-wrap gap-2">
                  {dogs.map(dog => (
                    <span key={dog} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium">
                      🐕 {dog}
                    </span>
                  ))}
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
                      email: customer.email,
                      phone: customer.phone || "",
                      dogname: dogs[0] || "",
                      dogbreed: "",
                      serviceid: preferredService[0] || SERVICES[0].id,
                      locationid: LOCATIONS[0].id,
                      date: new Date().toISOString().split("T")[0],
                      confirmed_time: "",
                      confirmed_duration_minutes: 90,
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
              </div>
            </div>
          </div>
        );
      })()}

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-slate-800">Add New Booking</h3>
              <a href={DIARY_URL} target="_blank" rel="noreferrer" className="text-sm font-bold text-teal-700 hover:text-teal-900 underline">
                Open Diary
              </a>
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
              <input type="time" value={addForm.confirmed_time} onChange={(e) => setAddForm({ ...addForm, confirmed_time: e.target.value })} placeholder="Time" className="px-4 py-3 border rounded-lg" />
              <input type="number" min={15} step={15} value={addForm.confirmed_duration_minutes} onChange={(e) => setAddForm({ ...addForm, confirmed_duration_minutes: Number(e.target.value) })} placeholder="Duration (mins)" className="px-4 py-3 border rounded-lg" />
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
