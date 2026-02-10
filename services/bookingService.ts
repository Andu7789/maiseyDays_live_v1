import { createClient } from "@supabase/supabase-js";
import emailjs from "emailjs-com";
import { Appointment, AvailabilitySlot, WeeklyTemplate } from "../types";
import { EMAIL_ENDPOINT, LOCATIONS, SERVICES, SUPABASE_URL, SUPABASE_ANON_KEY, STANDARD_HOURS, EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_CONFIRMATION_TEMPLATE_ID } from "../constants";

// Initialize EmailJS
emailjs.init(EMAILJS_PUBLIC_KEY);

// Validation for the user's convenience
if (SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("eyJ")) {
  console.warn("⚠️ MAISEY DAYS @ DIRTY DAWG: The SUPABASE_ANON_KEY in constants.tsx does not look like a standard Supabase key. It should start with 'eyJ'. Please double-check your dashboard.");
}

// Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

export const getAppointments = async (): Promise<Appointment[]> => {
  try {
    const { data, error } = await supabase.from("appointments").select("*");
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Fetch Appointments Failed:", err);
    return [];
  }
};

export const saveAppointment = async (app: Appointment) => {
  // Remove phone if empty to avoid DB schema errors
  const appointmentData: any = { ...app };
  if (!appointmentData.phone) {
    delete appointmentData.phone;
  }
  const { data, error } = await supabase.from("appointments").insert([appointmentData]).select();
  if (error) {
    console.error("Supabase Save Error:", error);
    throw new Error(`Database Error: ${error.message}`);
  }
  return data;
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
