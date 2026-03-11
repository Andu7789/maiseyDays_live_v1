import { createClient } from "@supabase/supabase-js";
import emailjs from "emailjs-com";
import { Appointment, AvailabilitySlot, WeeklyTemplate } from "../types";
import { EMAIL_ENDPOINT, LOCATIONS, SERVICES, SUPABASE_URL, SUPABASE_ANON_KEY, STANDARD_HOURS, EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_CONFIRMATION_TEMPLATE_ID, EMAILJS_HOLIDAY_TEMPLATE_ID } from "../constants";

// Initialize EmailJS
emailjs.init(EMAILJS_PUBLIC_KEY);

// Validation for the user's convenience
if (SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("eyJ")) {
  console.warn("⚠️ MAISEY DAYS @ DIRTY DAWG: The SUPABASE_ANON_KEY in constants.tsx does not look like a standard Supabase key. It should start with 'eyJ'. Please double-check your dashboard.");
}

// Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const invokeEdgeFunction = async (functionName: string, payload: Record<string, unknown>) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseJson: any = {};
    try {
      responseJson = responseText ? JSON.parse(responseText) : {};
    } catch {
      responseJson = { raw: responseText };
    }

    if (!response.ok) {
      const details = responseJson?.error || responseJson?.message || responseText || `Edge function ${functionName} failed`;
      throw new Error(details);
    }

    return responseJson;
  } catch (error: any) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("failed to fetch") || message.includes("network") || message.includes("fetch")) {
      throw new Error(`Could not reach SMS service (${functionName}). Check that the function is deployed and reachable in Supabase.`);
    }
    throw error;
  }
};

// Admin Authentication
export const signInAdmin = async (email: string, password: string) => {
  console.log("Attempting login with:", email);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: password,
  });
  if (error) {
    console.error("Login error:", error);
    throw error;
  }
  console.log("Login successful:", data);
  return data;
};

export const signOutAdmin = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};

export const checkAuthStatus = () => {
  return supabase.auth.onAuthStateChange((event, session) => {
    return { event, session };
  });
};

const BOOKING_PHOTO_BUCKET = "booking-photos";
const sanitizeForPath = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 40);

const uploadBookingPhoto = async (appointment: Appointment, photo: File) => {
  const safeDog = sanitizeForPath(appointment.dogname || "dog");
  const safeOwner = sanitizeForPath(appointment.ownername || "owner");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileExt = photo.name.split(".").pop() || "jpg";
  const filePath = `${safeDog}-${safeOwner}-${timestamp}.${fileExt}`;

  const uploadResult = await supabase.storage.from(BOOKING_PHOTO_BUCKET).upload(filePath, photo, {
    cacheControl: "3600",
    upsert: false,
    contentType: photo.type || "image/jpeg",
  });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }

  const signedUrlResult = await supabase.storage.from(BOOKING_PHOTO_BUCKET).createSignedUrl(filePath, 60 * 60 * 24 * 30);
  if (!signedUrlResult.error && signedUrlResult.data?.signedUrl) {
    return signedUrlResult.data.signedUrl;
  }

  const publicUrlResult = supabase.storage.from(BOOKING_PHOTO_BUCKET).getPublicUrl(filePath);
  if (publicUrlResult.data?.publicUrl) {
    return publicUrlResult.data.publicUrl;
  }

  throw new Error("Unable to generate photo URL.");
};

const normalizeLocationId = (rawValue: unknown) => {
  const value = String(rawValue || "").trim();
  if (!value) return LOCATIONS[0].id;

  const direct = LOCATIONS.find((location) => location.id.toLowerCase() === value.toLowerCase());
  if (direct) return direct.id;

  const byName = LOCATIONS.find((location) => location.name.toLowerCase() === value.toLowerCase());
  if (byName) return byName.id;

  const byContains = LOCATIONS.find((location) => value.toLowerCase().includes(location.id.toLowerCase()) || value.toLowerCase().includes(location.name.toLowerCase()));
  if (byContains) return byContains.id;

  return LOCATIONS[0].id;
};

export const getAppointments = async (): Promise<Appointment[]> => {
  try {
    const { data, error } = await supabase.from("appointments").select("*");
    if (error) throw error;
    const normalized = (data || []).map((row: any) => ({
      ...row,
      locationid: normalizeLocationId(row.locationid || row.locationId || row.location_id || row.location || row.branch),
      serviceid: row.serviceid || row.serviceId || row.service_id || SERVICES[0].id,
      requested_time_preference: row.requested_time_preference || row.requestedTimePreference || row.time || "",
      is_confirmed: row.is_confirmed ?? row.isConfirmed ?? row.status === "confirmed",
      booking_source: row.booking_source || row.bookingSource || "web",
      calendar_event_id: row.calendar_event_id || null,
      calendar_sync_status: row.calendar_sync_status || "not_synced",
      calendar_last_synced_at: row.calendar_last_synced_at || null,
      calendar_last_error: row.calendar_last_error || null,
    }));
    return normalized;
  } catch (err) {
    console.error("Fetch Appointments Failed:", err);
    return [];
  }
};

const ENHANCED_BOOKING_COLUMNS = ["requested_time_preference", "confirmed_date", "confirmed_time", "confirmed_duration_minutes", "is_confirmed", "confirmed_at", "confirmation_sent_at", "booking_source", "calendar_event_id", "calendar_sync_status", "calendar_last_synced_at", "calendar_last_error"];

const isSchemaColumnCacheError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("schema cache") || message.includes("could not find the '");
};

const stripEnhancedBookingColumns = (payload: Record<string, unknown>) => {
  const fallback = { ...payload };
  ENHANCED_BOOKING_COLUMNS.forEach((column) => {
    delete fallback[column];
  });
  return fallback;
};

export const saveAppointment = async (app: Appointment) => {
  // Remove phone if empty to avoid DB schema errors
  const appointmentData: any = { ...app };
  appointmentData.requested_time_preference = app.requested_time_preference || app.time || null;
  appointmentData.confirmed_date = app.confirmed_date ?? null;
  appointmentData.confirmed_time = app.confirmed_time ?? null;
  appointmentData.confirmed_duration_minutes = app.confirmed_duration_minutes ?? null;
  appointmentData.is_confirmed = app.is_confirmed ?? false;
  appointmentData.confirmed_at = app.confirmed_at ?? null;
  appointmentData.confirmation_sent_at = app.confirmation_sent_at ?? null;
  appointmentData.booking_source = app.booking_source || "web";
  if (!appointmentData.phone) {
    delete appointmentData.phone;
  }
  const { data, error } = await supabase.from("appointments").insert([appointmentData]).select();
  if (!error) return data;

  if (isSchemaColumnCacheError(error)) {
    const fallbackPayload = stripEnhancedBookingColumns(appointmentData);
    const fallbackResult = await supabase.from("appointments").insert([fallbackPayload]).select();
    if (!fallbackResult.error) {
      console.warn("Inserted appointment using legacy schema fallback.");
      return fallbackResult.data;
    }
    console.error("Supabase Save Fallback Error:", fallbackResult.error);
    throw new Error(`Database Error: ${fallbackResult.error.message}`);
  }

  console.error("Supabase Save Error:", error);
  throw new Error(`Database Error: ${error.message}`);
};

export const createManualAppointment = async (app: Appointment) => {
  return saveAppointment({
    ...app,
    booking_source: "manual",
    requested_time_preference: app.requested_time_preference || app.time || "",
    status: app.status || "pending",
  });
};

export const updateAppointment = async (id: string, updates: Partial<Appointment>) => {
  const payload: Record<string, unknown> = { ...updates };
  if (Object.prototype.hasOwnProperty.call(payload, "requested_time_preference") === false && updates.time) {
    payload.requested_time_preference = updates.time;
  }

  const { data, error } = await supabase.from("appointments").update(payload).eq("id", id).select();
  if (!error) return data;

  if (isSchemaColumnCacheError(error)) {
    const fallbackPayload = stripEnhancedBookingColumns(payload);
    const fallbackResult = await supabase.from("appointments").update(fallbackPayload).eq("id", id).select();
    if (!fallbackResult.error) {
      console.warn("Updated appointment using legacy schema fallback.");
      return fallbackResult.data;
    }
    console.error("Supabase Update Fallback Error:", fallbackResult.error);
    throw new Error(`Database Error: ${fallbackResult.error.message}`);
  }

  console.error("Supabase Update Error:", error);
  throw new Error(`Database Error: ${error.message}`);
};

export const deleteAppointment = async (id: string) => {
  const { error } = await supabase.from("appointments").delete().eq("id", id);
  if (error) {
    console.error("Supabase Delete Error:", error);
    throw new Error(`Database Error: ${error.message}`);
  }
};

const formatHumanDate = (dateStr: string) => {
  if (!dateStr) return "TBC";
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const getLocationName = (locationId: string) => LOCATIONS.find((loc) => loc.id === locationId)?.name || locationId;
const getServiceName = (serviceId: string) => SERVICES.find((service) => service.id === serviceId)?.name || serviceId;

export const sendCustomerConfirmationSms = async (appointment: Appointment) => {
  if (!appointment.phone) {
    throw new Error("Customer phone number is missing.");
  }

  const confirmedDate = appointment.confirmed_date || appointment.date;
  const confirmedTime = appointment.confirmed_time || "TBC";
  const message = `Hi ${appointment.ownername}, ${appointment.dogname} is booked for a ${getServiceName(appointment.serviceid)} at Maisey Days (${getLocationName(appointment.locationid)}) on ${formatHumanDate(confirmedDate)} at ${confirmedTime}. Please reply YES to confirm or call us if you need changes. Thank you 🐾`;

  const result = await invokeEdgeFunction("send-customer-confirmation-sms", {
    to: appointment.phone,
    message,
    bookingId: appointment.id,
  });
  const smsSuccess = Boolean((result as any)?.success ?? false);
  if (!smsSuccess) {
    const providerError = (result as any)?.error || "SMS provider rejected the message.";
    throw new Error(`SMS failed: ${providerError}`);
  }

  return true;
};

export const syncBookingToCalendar = async (appointmentId: string) => {
  const result = await invokeEdgeFunction("sync-booking-to-calendar", {
    appointmentId,
  });

  const success = Boolean((result as any)?.success ?? false);
  if (!success) {
    const syncError = (result as any)?.error || "Calendar sync failed.";
    throw new Error(`Calendar sync failed: ${syncError}`);
  }

  return result;
};

export const syncCalendarChangesFromDiary = async () => {
  const result = await invokeEdgeFunction("calendar-webhook-handler", {});
  const success = Boolean((result as any)?.success ?? false);
  if (!success) {
    const syncError = (result as any)?.error || "Diary inbound sync failed.";
    throw new Error(`Diary sync failed: ${syncError}`);
  }
  return {
    synced: Number((result as any)?.synced || 0),
    updated: Number((result as any)?.updated || 0),
    errors: Number((result as any)?.errors || 0),
    scanned: Number((result as any)?.scanned || 0),
    totalLinked: Number((result as any)?.totalLinked || 0),
  };
};

export const ensureCalendarWatchChannel = async (force = false) => {
  const result = await invokeEdgeFunction("ensure-calendar-watch-channel", { force });
  const success = Boolean((result as any)?.success ?? false);
  if (!success) {
    const renewError = (result as any)?.error || "Could not ensure calendar watch channel.";
    throw new Error(`Watch setup failed: ${renewError}`);
  }
  return {
    renewed: Boolean((result as any)?.renewed ?? false),
    expiration: (result as any)?.expiration || null,
    channelId: (result as any)?.channelId || null,
  };
};

export const confirmAppointmentBooking = async (
  appointment: Appointment,
  confirmation: {
    confirmedDate: string;
    confirmedTime: string;
    confirmedDurationMinutes: number;
  },
) => {
  if (!appointment.id) {
    throw new Error("Booking ID is required to confirm.");
  }

  // Safety check: If already confirmed with SMS sent, don't send again
  if (appointment.is_confirmed && appointment.confirmation_sent_at) {
    console.warn(`Booking ${appointment.id} already confirmed. Skipping duplicate SMS.`);
    // Still update the booking details but skip SMS
    await updateAppointment(appointment.id, {
      status: "confirmed",
      is_confirmed: true,
      confirmed_date: confirmation.confirmedDate,
      confirmed_time: confirmation.confirmedTime,
      confirmed_duration_minutes: confirmation.confirmedDurationMinutes,
    });
    return;
  }

  const nowIso = new Date().toISOString();
  const smsPayload: Appointment = {
    ...appointment,
    confirmed_date: confirmation.confirmedDate,
    confirmed_time: confirmation.confirmedTime,
    confirmed_duration_minutes: confirmation.confirmedDurationMinutes,
  };

  const smsSent = await sendCustomerConfirmationSms(smsPayload);
  if (!smsSent) {
    throw new Error("SMS confirmation failed to send.");
  }

  await updateAppointment(appointment.id, {
    status: "confirmed",
    is_confirmed: true,
    confirmed_date: confirmation.confirmedDate,
    confirmed_time: confirmation.confirmedTime,
    confirmed_duration_minutes: confirmation.confirmedDurationMinutes,
    confirmed_at: nowIso,
    confirmation_sent_at: nowIso,
  });

  try {
    await syncBookingToCalendar(appointment.id);
  } catch (syncErr: any) {
    await updateAppointment(appointment.id, {
      calendar_sync_status: "error",
      calendar_last_error: syncErr?.message || "Calendar sync failed",
    });
  }
};

export const getAvailabilityOverrides = async (): Promise<AvailabilitySlot[]> => {
  try {
    const { data, error } = await supabase.from("availability_overrides").select("*");
    if (error) throw error;
    return data || [];
  } catch (err) {
    return [];
  }
};

export const toggleSlotAvailability = async (locationId: string, date: string, time: string, isAvailable: boolean) => {
  await supabase.from("availability_overrides").delete().match({ locationId, date, time });
  await supabase.from("availability_overrides").insert([{ locationId, date, time, isAvailable }]);
};

export const getWeeklyTemplate = async (): Promise<WeeklyTemplate> => {
  try {
    const { data, error } = await supabase.from("weekly_templates").select("*");
    if (error) throw error;
    const result: WeeklyTemplate = {};
    data?.forEach((row) => {
      result[row.locationId] = row.template_data;
    });
    if (Object.keys(result).length === 0) {
      LOCATIONS.forEach((loc) => {
        result[loc.id] = {};
        for (let i = 0; i < 7; i++) result[loc.id][i] = [...STANDARD_HOURS];
      });
    }
    return result;
  } catch (err) {
    const fallback: WeeklyTemplate = {};
    LOCATIONS.forEach((loc) => {
      fallback[loc.id] = {};
      for (let i = 0; i < 7; i++) fallback[loc.id][i] = [...STANDARD_HOURS];
    });
    return fallback;
  }
};

export const saveWeeklyTemplate = async (template: WeeklyTemplate) => {
  for (const locationId in template) {
    await supabase.from("weekly_templates").upsert({ locationId, template_data: template[locationId] }, { onConflict: "locationId" });
  }
};

export const isSlotAvailable = async (locationId: string, date: string, time: string): Promise<boolean> => {
  try {
    const [year, month, day] = date.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();

    const allTemplates = await getWeeklyTemplate();
    const locationTemplate = allTemplates[locationId];
    if (locationTemplate?.[dayOfWeek] && !locationTemplate[dayOfWeek].includes(time)) return false;

    const overrides = await getAvailabilityOverrides();
    const override = overrides.find((o) => o.locationId === locationId && o.date === date && o.time === time);
    if (override && !override.isAvailable) return false;

    const appointments = await getAppointments();
    const isBooked = appointments.some((a) => a.locationid === locationId && a.date === date && a.time === time);
    return !isBooked;
  } catch (err) {
    return true;
  }
};

export const sendBookingEmail = async (appointment: Appointment, photo?: File | null) => {
  try {
    const locationName = LOCATIONS.find((l) => l.id === appointment.locationid)?.name || appointment.locationid;
    const serviceName = SERVICES.find((s) => s.id === appointment.serviceid)?.name || appointment.serviceid;
    let photoLink: string | null = null;
    if (photo) {
      try {
        console.log("Attempting to upload photo...");
        photoLink = await uploadBookingPhoto(appointment, photo);
        console.log("Photo uploaded successfully:", photoLink);
      } catch (uploadErr) {
        console.error("Photo upload failed:", uploadErr);
        // Continue with email even if photo fails
        photoLink = null;
      }
    }
    // Format date to DD/MM/YYYY
    const formatDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split("-");
      return `${day}/${month}/${year}`;
    };
    // Format time to use 'in the'
    const formatTime = (time: string) => {
      return `in the ${time}`;
    };
    const summaryMessage = `
NEW BOOKING REQUEST

Dog: ${appointment.dogname} (${appointment.dogbreed})
Date of Requested Appointment: ${formatDate(appointment.date)} ${formatTime(appointment.time)}
Location: ${locationName}
Service: ${serviceName}
Owner: ${appointment.ownername}
Email: ${appointment.email}
Phone: ${appointment.phone || "Not provided"}
Notes: ${appointment.notes || "None"}
Contact Share Consent: ${appointment.marketingConsent ? (appointment.marketingConsent === "yes" ? "YES - May share contact details with Dirty Dawg for alternative booking" : "NO - Do not share contact details") : "Not specified"}
${photoLink ? `\nPhoto for ${appointment.dogname} (Owner: ${appointment.ownername}, ${appointment.email}):\n${photoLink}` : "\nNo photo provided"}
    `;
    let response: Response;
    console.log("Sending email with payload:", {
      _subject: `New Booking: ${appointment.dogname}`,
      hasPhoto: !!photoLink,
    });
    response = await fetch(EMAIL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        _subject: `New Booking: ${appointment.dogname}`,
        message: summaryMessage,
        email: appointment.email,
        _replyto: appointment.email,
        name: appointment.ownername,
      }),
    });
    console.log("Email response:", response.status, response.ok);
    return response.ok;
  } catch (e) {
    return false;
  }
};

export const sendConfirmationEmail = async (appointment: Appointment) => {
  try {
    const confirmationMessage = `
Hello ${appointment.ownername},

Thank you for requesting a booking with Maisey Days @ Dirty Dawg! We have received your booking request for ${appointment.dogname}.

We will review your request and be in touch within the next 24 hours to confirm your appointment or discuss any details.

Booking Details:
- Dog: ${appointment.dogname}
- Requested Date & Time: ${appointment.date}
- Service: ${SERVICES.find((s) => s.id === appointment.serviceid)?.name || appointment.serviceid}
- Location: ${LOCATIONS.find((l) => l.id === appointment.locationid)?.name || appointment.locationid}

If you have any questions in the meantime, please don't hesitate to contact us.

Best regards,
Maisey Days @ Dirty Dawg 🐾
    `;

    const result = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_CONFIRMATION_TEMPLATE_ID, {
      to_email: appointment.email,
      to_name: appointment.ownername,
      subject: `Booking Request Received - ${appointment.dogname}`,
      message: confirmationMessage,
      dog_name: appointment.dogname,
    });
    console.log("Confirmation email sent successfully:", result.status);
    return result.status === 200;
  } catch (e) {
    console.error("Error sending confirmation email:", e);
    return false;
  }
};

export const sendHolidayEnquiryConfirmation = async (name: string, email: string): Promise<boolean> => {
  try {
    const result = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_HOLIDAY_TEMPLATE_ID, {
      to_email: email,
      to_name: name,
    });
    return result.status === 200;
  } catch (e) {
    console.error("Error sending holiday enquiry confirmation:", e);
    return false;
  }
};

export const getUnavailableDays = async (locationId: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase.from("availabilities").select("date, day_of_week").eq("isAvailable", false);

    if (error) {
      console.error("Error fetching unavailable dates:", error);
      return [];
    }

    const dates = data?.filter((d) => d.date !== null && d.day_of_week === null).map((d) => d.date) || [];
    console.log("Unavailable dates:", dates);
    return dates;
  } catch (err) {
    console.error("Error in getUnavailableDays:", err);
    return [];
  }
};

export const getUnavailableWeekdays = async (): Promise<number[]> => {
  try {
    const { data, error } = await supabase.from("availabilities").select("day_of_week, date").eq("isAvailable", false);

    if (error) {
      console.error("Error fetching unavailable weekdays:", error);
      return [];
    }

    const weekdays = data?.filter((d) => d.day_of_week !== null && d.date === null).map((d) => d.day_of_week) || [];
    console.log("Unavailable weekdays:", weekdays);
    return weekdays;
  } catch (err) {
    console.error("Error in getUnavailableWeekdays:", err);
    return [];
  }
};

export const saveUnavailableDay = async (date: string, reason: string) => {
  try {
    console.log("Saving unavailable date:", date, reason);
    const { data, error } = await supabase.from("availabilities").insert([{ date, isAvailable: false, reason }]);

    if (error) {
      console.error("Error saving unavailable day:", error);
      throw error;
    }
    console.log("Successfully saved unavailable date");
  } catch (err) {
    console.error("Catch error in saveUnavailableDay:", err);
    throw err;
  }
};

export const removeUnavailableDay = async (date: string) => {
  try {
    console.log("Removing unavailable date:", date);
    const { error } = await supabase.from("availabilities").delete().eq("date", date);

    if (error) {
      console.error("Error removing unavailable day:", error);
      throw error;
    }
    console.log("Successfully removed unavailable date");
  } catch (err) {
    console.error("Catch error in removeUnavailableDay:", err);
    throw err;
  }
};

export const saveUnavailableDateRange = async (startDate: string, endDate: string, reason: string) => {
  try {
    console.log("Saving unavailable date range:", startDate, "to", endDate, reason);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const datesInRange: string[] = [];

    // Generate all dates between start and end (inclusive)
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      datesInRange.push(`${year}-${month}-${day}`);
    }

    // Save all dates
    for (const dateStr of datesInRange) {
      await saveUnavailableDay(dateStr, reason);
    }

    console.log("Successfully saved unavailable date range");
  } catch (err) {
    console.error("Catch error in saveUnavailableDateRange:", err);
    throw err;
  }
};

export const saveUnavailableWeekday = async (dayOfWeek: number, reason: string) => {
  try {
    console.log("Saving unavailable weekday:", dayOfWeek, reason);
    // First delete any existing record for this day of week
    await supabase.from("availabilities").delete().eq("day_of_week", dayOfWeek);

    // Then insert the new record - omit date field entirely so it stays null
    const { data, error } = await supabase.from("availabilities").insert([{ day_of_week: dayOfWeek, isAvailable: false, reason }]);

    if (error) {
      console.error("Error saving unavailable weekday:", error);
      throw error;
    }
    console.log("Successfully saved unavailable weekday");
  } catch (err) {
    console.error("Catch error in saveUnavailableWeekday:", err);
    throw err;
  }
};

export const removeUnavailableWeekday = async (dayOfWeek: number) => {
  try {
    console.log("Removing unavailable weekday:", dayOfWeek);
    const { error } = await supabase.from("availabilities").delete().eq("day_of_week", dayOfWeek);

    if (error) {
      console.error("Error removing unavailable weekday:", error);
      throw error;
    }
    console.log("Successfully removed unavailable weekday");
  } catch (err) {
    console.error("Catch error in removeUnavailableWeekday:", err);
    throw err;
  }
};

export const isDateAvailable = async (locationId: string, date: string): Promise<boolean> => {
  try {
    // Check if specific date is unavailable
    const unavailableDates = await getUnavailableDays(locationId);
    if (unavailableDates.includes(date)) return false;

    // Check if day of week is unavailable
    const [year, month, day] = date.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();

    const unavailableWeekdays = await getUnavailableWeekdays();
    if (unavailableWeekdays.includes(dayOfWeek)) return false;

    return true;
  } catch (err) {
    return true;
  }
};

export const saveUnavailableDays = async (locationId: string, days: number[]) => {
  // This function is no longer used
  return;
};

export const getLastAutoSyncTime = async (): Promise<Date | null> => {
  try {
    const { data, error } = await supabase
      .from("calendar_webhook_logs")
      .select("created_at")
      .eq("message", "Webhook received")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return new Date(data.created_at);
  } catch (err) {
    return null;
  }
};

export const exportAppointmentsToExcel = (appointments: Appointment[]) => {
  const headers = ["Dog Name", "Breed", "Owner", "Email", "Service", "Location", "Date", "Time", "Notes", "Status"];
  const rows = appointments.map((a) => [a.dogname, a.dogbreed, a.ownername, a.email, a.serviceid, a.locationid, a.date, a.time, a.notes || "", a.status]);

  let csv = headers.join(",") + "\n";
  rows.forEach((row) => {
    csv += row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bookings-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const getReminderSettings = async () => {
  const { data, error } = await supabase.from("reminder_settings").select("*").eq("id", 1).single();
  if (error) throw new Error(error.message);
  return data;
};

export const updateReminderSettings = async (settings: any) => {
  const { error } = await supabase
    .from("reminder_settings")
    .update({
      ...settings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
};
