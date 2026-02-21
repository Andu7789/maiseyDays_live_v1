import React, { useEffect, useMemo, useState } from "react";
import { checkAuthStatus, confirmAppointmentBooking, createManualAppointment, deleteAppointment, exportAppointmentsToExcel, getAppointments, getCurrentUser, getLastAutoSyncTime, getUnavailableDays, getUnavailableWeekdays, removeUnavailableDay, removeUnavailableWeekday, saveUnavailableDay, saveUnavailableWeekday, signInAdmin, signOutAdmin, syncBookingToCalendar, syncCalendarChangesFromDiary, updateAppointment } from "../services/bookingService";
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
  const [view, setView] = useState<"bookings" | "unavailable" | "services">("bookings");
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
    requested_time_preference: "Morning",
    notes: "",
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
      const [apps, unavail, unavailWeekdays, lastSync] = await Promise.all([
        getAppointments(),
        getUnavailableDays(selectedLocation),
        getUnavailableWeekdays(),
        getLastAutoSyncTime()
      ]);
      setAppointments(apps);
      setUnavailableDays(unavail);
      setUnavailableWeekdays(unavailWeekdays);
      setLastAutoSync(lastSync);
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
    });
    setShowUpdateModal(true);
  };

  const closeUpdateModal = () => {
    setShowUpdateModal(false);
    setActiveBooking(null);
  };

  const openAddModal = () => {
    setAddForm((prev) => ({ ...prev, locationid: selectedLocation === ALL_LOCATIONS ? LOCATIONS[0].id : selectedLocation }));
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

    setIsWorking(true);
    try {
      await createManualAppointment({
        ownername: addForm.ownername,
        email: addForm.email,
        phone: addForm.phone,
        dogname: addForm.dogname,
        dogbreed: addForm.dogbreed,
        serviceid: addForm.serviceid,
        locationid: addForm.locationid,
        date: addForm.date,
        time: addForm.requested_time_preference,
        requested_time_preference: addForm.requested_time_preference,
        notes: addForm.notes,
        status: "pending",
        booking_source: "manual",
      });

      await loadData();
      setShowAddModal(false);
      setAddForm({
        ownername: "",
        email: "",
        phone: "",
        dogname: "",
        dogbreed: "",
        serviceid: SERVICES[0].id,
        locationid: selectedLocation,
        date: new Date().toISOString().split("T")[0],
        requested_time_preference: "Morning",
        notes: "",
      });
      alert("Manual booking added.");
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
          <button onClick={() => setView("unavailable")} className={`px-4 py-2 rounded-lg font-bold transition-all ${view === "unavailable" ? "bg-white shadow-sm text-emerald-600" : "text-slate-600"}`}>
            Closed Dates
          </button>
          <button onClick={() => setView("services")} className={`px-4 py-2 rounded-lg font-bold transition-all ${view === "services" ? "bg-white shadow-sm text-emerald-600" : "text-slate-600"}`}>
            Services
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
                    <th className="p-4 font-bold text-slate-600">Diary Sync</th>
                    <th className="p-4 font-bold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAppointments.map((app) => {
                    const isConfirmed = Boolean(app.is_confirmed || app.status === "confirmed");
                    const rowClass = isConfirmed ? "bg-emerald-50 hover:bg-emerald-100" : "bg-orange-50 hover:bg-orange-100";
                    const serviceName = SERVICES.find((s) => s.id === app.serviceid)?.name || app.serviceid;

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
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isConfirmed ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>{isConfirmed ? "Confirmed" : "Pending"}</span>
                        </td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${app.calendar_sync_status === "synced" ? "bg-emerald-100 text-emerald-700" : app.calendar_sync_status === "error" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`} title={app.calendar_last_error || ""}>
                            {app.calendar_sync_status === "synced" ? "Synced" : app.calendar_sync_status === "error" ? "Error" : "Not Synced"}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button onClick={() => openUpdateModal(app)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded-md text-xs font-bold">
                              Update
                            </button>
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
                      <td colSpan={9} className="p-20 text-center text-slate-400">
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

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-slate-800 mb-4">Add New Booking</h3>
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
              <select value={addForm.requested_time_preference} onChange={(e) => setAddForm({ ...addForm, requested_time_preference: e.target.value })} className="px-4 py-3 border rounded-lg">
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Evening">Evening</option>
              </select>
              <textarea value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} placeholder="Notes" className="md:col-span-2 px-4 py-3 border rounded-lg min-h-24" />
            </div>
            <div className="flex gap-3 mt-6">
              <button disabled={isWorking} onClick={handleAddBooking} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-bold">
                Add Booking
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
