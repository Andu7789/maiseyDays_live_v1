import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const two = (value: number) => String(value).padStart(2, "0");

const addMinutesToLocalDateTime = (dateStr: string, timeStr: string, minutes: number) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const dt = new Date(year, month - 1, day, hour, minute, 0);
  dt.setMinutes(dt.getMinutes() + minutes);
  const outDate = `${dt.getFullYear()}-${two(dt.getMonth() + 1)}-${two(dt.getDate())}`;
  const outTime = `${two(dt.getHours())}:${two(dt.getMinutes())}:00`;
  return `${outDate}T${outTime}`;
};

const getGoogleAccessToken = async () => {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth secrets missing (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN).");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();
  if (!response.ok || !data?.access_token) {
    throw new Error(`Could not get Google access token: ${JSON.stringify(data)}`);
  }

  return data.access_token as string;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const appointmentId = String(body?.appointmentId || "").trim();
    if (!appointmentId) {
      return new Response(JSON.stringify({ success: false, error: "appointmentId is required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ success: false, error: "Missing Supabase service credentials" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await supabase.from("calendar_sync_settings").select("mode, test_calendar_id, live_calendar_id, timezone").eq("id", 1).single();
    if (!settings) {
      throw new Error("calendar_sync_settings row is missing");
    }

    const calendarId = settings.mode === "live" ? settings.live_calendar_id : settings.test_calendar_id;
    const timezone = settings.timezone || "Europe/London";

    const { data: appointment, error: appointmentError } = await supabase.from("appointments").select("*").eq("id", appointmentId).single();
    if (appointmentError || !appointment) {
      throw new Error(`Appointment not found: ${appointmentError?.message || appointmentId}`);
    }

    const confirmedDate = appointment.confirmed_date || appointment.date;
    const confirmedTime = appointment.confirmed_time || null;
    const duration = Number(appointment.confirmed_duration_minutes || 90);

    if (!confirmedDate || !confirmedTime) {
      await supabase
        .from("appointments")
        .update({
          calendar_sync_status: "error",
          calendar_last_error: "Missing confirmed date/time for calendar sync",
        })
        .eq("id", appointmentId);

      return new Response(JSON.stringify({ success: false, error: "Missing confirmed date/time for calendar sync" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getGoogleAccessToken();
    const startDateTime = `${confirmedDate}T${String(confirmedTime).slice(0, 5)}:00`;
    const endDateTime = addMinutesToLocalDateTime(confirmedDate, String(confirmedTime).slice(0, 5), duration);

    const eventPayload = {
      summary: `${appointment.dogname} - ${appointment.serviceid}`,
      description: `Owner: ${appointment.ownername}\nDog: ${appointment.dogname}\nPhone: ${appointment.phone || "N/A"}\nEmail: ${appointment.email || "N/A"}\nBooking ID: ${appointment.id}`,
      start: {
        dateTime: startDateTime,
        timeZone: timezone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: timezone,
      },
      extendedProperties: {
        private: {
          booking_id: String(appointment.id),
        },
      },
    };

    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const isUpdate = Boolean(appointment.calendar_event_id);
    const eventUrl = isUpdate ? `${baseUrl}/${encodeURIComponent(appointment.calendar_event_id)}` : baseUrl;

    const googleResponse = await fetch(eventUrl, {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventPayload),
    });

    const googleData = await googleResponse.json();

    if (!googleResponse.ok || !googleData?.id) {
      const errorText = googleData?.error?.message || JSON.stringify(googleData);
      await supabase
        .from("appointments")
        .update({
          calendar_sync_status: "error",
          calendar_last_error: errorText,
        })
        .eq("id", appointmentId);

      return new Response(JSON.stringify({ success: false, error: errorText, provider: "google" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("appointments")
      .update({
        calendar_event_id: googleData.id,
        calendar_sync_status: "synced",
        calendar_last_synced_at: new Date().toISOString(),
        calendar_last_error: null,
      })
      .eq("id", appointmentId);

    return new Response(JSON.stringify({ success: true, calendarEventId: googleData.id, mode: settings.mode }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
