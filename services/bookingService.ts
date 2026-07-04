import { createClient } from "@supabase/supabase-js";
import emailjs from "emailjs-com";
import { Appointment, AvailabilitySlot, WeeklyTemplate } from "../types";
import { EMAIL_ENDPOINT, LOCATIONS, SERVICES, SUPABASE_URL, SUPABASE_ANON_KEY, STANDARD_HOURS, SLOT_TIMES, SLOT_DURATION_MINUTES, BOOKABLE_WEEKDAYS, EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_CONFIRMATION_TEMPLATE_ID, EMAILJS_HOLIDAY_TEMPLATE_ID } from "../constants";

// Initialize EmailJS
emailjs.init(EMAILJS_PUBLIC_KEY);

// Validation for the user's convenience
if (SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("eyJ")) {
  console.warn("⚠️ MAISEY DAYS @ DIRTY DAWG: The SUPABASE_ANON_KEY in constants.tsx does not look like a standard Supabase key. It should start with 'eyJ'. Please double-check your dashboard.");
}

// Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const invokeEdgeFunction = async (functionName: string, payload: Record<string, unknown>) => {
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

export const buildConfirmationMessage = (appointment: Appointment) => {
  const confirmedDate = appointment.confirmed_date || appointment.date;
  const confirmedTime = appointment.confirmed_time || "TBC";
  return `Hi ${appointment.ownername}, ${appointment.dogname} is booked for a ${getServiceName(appointment.serviceid)} at Maisey Days (${getLocationName(appointment.locationid)}) on ${formatHumanDate(confirmedDate)} at ${confirmedTime}. Please reply YES to confirm or call us if you need changes. Thank you 🐾`;
};

export const sendCustomerConfirmationSms = async (appointment: Appointment) => {
  if (!appointment.phone) {
    throw new Error("Customer phone number is missing.");
  }

  const message = buildConfirmationMessage(appointment);

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

export const confirmAppointmentBooking = async (
  appointment: Appointment,
  confirmation: {
    confirmedDate: string;
    confirmedTime: string;
    confirmedDurationMinutes: number;
  },
  channel: "sms" | "whatsapp" = "sms",
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

  // WhatsApp messages are opened/sent by the admin in the browser, so only SMS goes via Vonage
  if (channel === "sms") {
    const smsSent = await sendCustomerConfirmationSms(smsPayload);
    if (!smsSent) {
      throw new Error("SMS confirmation failed to send.");
    }
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

const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

// Older pending bookings requested a rough preference instead of an exact slot
const LEGACY_PREFERENCE_SLOTS: Record<string, string[]> = {
  morning: ["08:00", "10:00"],
  afternoon: ["12:00", "14:00"],
  evening: ["16:00", "18:00"],
};

const blockOverlappingSlots = (blocked: Set<string>, startMinutes: number, durationMinutes: number) => {
  const endMinutes = startMinutes + durationMinutes;
  SLOT_TIMES.forEach((slot) => {
    const slotStart = timeToMinutes(slot);
    if (startMinutes < slotStart + SLOT_DURATION_MINUTES && endMinutes > slotStart) {
      blocked.add(slot);
    }
  });
};

/**
 * Returns the free 2-hour slot start times for a location on a date.
 * Both pending requests and confirmed bookings block their slot.
 */
export const getAvailableSlotTimes = async (locationId: string, date: string): Promise<string[]> => {
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  if (!BOOKABLE_WEEKDAYS.includes(dayOfWeek)) return [];

  const dateOpen = await isDateAvailable(locationId, date);
  if (!dateOpen) return [];

  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("date, time, requested_time_preference, status, booking_status, confirmed_date, confirmed_time, confirmed_duration_minutes, locationid")
      .or(`date.eq.${date},confirmed_date.eq.${date}`);
    if (error) throw error;

    const blocked = new Set<string>();
    for (const row of data || []) {
      if (normalizeLocationId(row.locationid) !== locationId) continue;
      const schedule = getEffectiveSchedule(row as Appointment);
      if (!schedule || schedule.date !== date) continue;
      blockOverlappingSlots(blocked, schedule.startMinutes, schedule.durationMinutes);
    }

    return SLOT_TIMES.filter((slot) => !blocked.has(slot));
  } catch (err) {
    console.error("Slot availability check failed:", err);
    // Fail open (matching existing availability behaviour) rather than blocking all bookings
    return [...SLOT_TIMES];
  }
};

/** Returns the effective diary slot for a booking: confirmed time wins, else the requested slot. */
export const getEffectiveSchedule = (apt: Appointment): { date: string; startMinutes: number; durationMinutes: number; timeLabel: string } | null => {
  if (apt.status === "cancelled" || apt.booking_status === "cancelled") return null;

  if (apt.confirmed_date && apt.confirmed_time) {
    const timeLabel = String(apt.confirmed_time).slice(0, 5);
    return {
      date: apt.confirmed_date,
      startMinutes: timeToMinutes(timeLabel),
      durationMinutes: Number(apt.confirmed_duration_minutes) || SLOT_DURATION_MINUTES,
      timeLabel,
    };
  }

  if (!apt.date) return null;
  const requested = String(apt.time || apt.requested_time_preference || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(requested)) {
    return { date: apt.date, startMinutes: timeToMinutes(requested), durationMinutes: SLOT_DURATION_MINUTES, timeLabel: requested };
  }
  const legacySlots = LEGACY_PREFERENCE_SLOTS[requested.toLowerCase()];
  if (legacySlots?.length) {
    return { date: apt.date, startMinutes: timeToMinutes(legacySlots[0]), durationMinutes: legacySlots.length * SLOT_DURATION_MINUTES, timeLabel: `${requested} (TBC)` };
  }
  // No usable time at all — place at the first slot, flagged as TBC
  return { date: apt.date, startMinutes: timeToMinutes(SLOT_TIMES[0]), durationMinutes: SLOT_DURATION_MINUTES, timeLabel: "time TBC" };
};

/**
 * Finds an existing booking that overlaps the given date/time/duration at a location.
 * Used to warn the admin before creating a double booking. Returns null when clear.
 */
export const findBookingClash = async (locationId: string, date: string, time: string, durationMinutes: number, excludeAppointmentId?: string): Promise<Appointment | null> => {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .or(`date.eq.${date},confirmed_date.eq.${date}`);
    if (error) throw error;

    const start = timeToMinutes(time);
    const end = start + durationMinutes;

    for (const row of data || []) {
      if (excludeAppointmentId && row.id === excludeAppointmentId) continue;
      if (normalizeLocationId(row.locationid) !== locationId) continue;
      const schedule = getEffectiveSchedule(row as Appointment);
      if (!schedule || schedule.date !== date) continue;
      if (start < schedule.startMinutes + schedule.durationMinutes && end > schedule.startMinutes) {
        return row as Appointment;
      }
    }
    return null;
  } catch (err) {
    console.error("Clash check failed:", err);
    return null;
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

export const getHolidaySettings = async (): Promise<{
  holiday_start: string | null;
  holiday_end: string | null;
  advert_start: string | null;
  advert_end: string | null;
  advert_text: string | null;
  advert_color: string | null;
}> => {
  const { data, error } = await supabase
    .from("holiday_settings")
    .select("holiday_start, holiday_end, advert_start, advert_end, advert_text, advert_color")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const updateHolidaySettings = async (holidayStart: string | null, holidayEnd: string | null) => {
  const { error } = await supabase
    .from("holiday_settings")
    .update({ holiday_start: holidayStart || null, holiday_end: holidayEnd || null, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
};

export const updateAdvertSettings = async (advertStart: string | null, advertEnd: string | null, advertText: string | null, advertColor: string | null) => {
  const { error } = await supabase
    .from("holiday_settings")
    .update({ advert_start: advertStart || null, advert_end: advertEnd || null, advert_text: advertText || null, advert_color: advertColor || null, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
};

export const getAllDogNotes = async (): Promise<Record<string, Record<string, string>>> => {
  const { data, error } = await supabase
    .from("dog_notes")
    .select("owner_email, dog_name, notes")
    .neq("notes", "");
  if (error) throw new Error(error.message);
  const result: Record<string, Record<string, string>> = {};
  for (const row of data ?? []) {
    if (!result[row.owner_email]) result[row.owner_email] = {};
    result[row.owner_email][row.dog_name] = row.notes;
  }
  return result;
};

export const getDogNotes = async (ownerEmail: string): Promise<Record<string, string>> => {
  const { data, error } = await supabase
    .from("dog_notes")
    .select("dog_name, notes")
    .eq("owner_email", ownerEmail);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((row) => [row.dog_name, row.notes]));
};

export const upsertDogNote = async (ownerEmail: string, dogName: string, notes: string) => {
  const { error } = await supabase.from("dog_notes").upsert(
    { owner_email: ownerEmail, dog_name: dogName, notes, updated_at: new Date().toISOString() },
    { onConflict: "owner_email,dog_name" }
  );
  if (error) throw new Error(error.message);
};
