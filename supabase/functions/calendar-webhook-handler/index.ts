import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-goog-channel-token, x-goog-resource-state",
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

const parseDateTime = (dateTime: string) => {
  const date = new Date(dateTime);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${min}`,
  };
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Log all incoming webhook requests for debugging
    const supabaseLog = async (message: string, extra?: any) => {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SERVICE_ROLE_KEY") || "";
        if (!supabaseUrl || !serviceRoleKey) return;
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        await supabase.from("calendar_webhook_logs").insert({
          message,
          extra: extra ? JSON.stringify(extra) : null,
          created_at: new Date().toISOString(),
        });
      } catch (_) {}
    };

    await supabaseLog("Webhook received", {
      headers: Object.fromEntries(req.headers.entries()),
      method: req.method,
      url: req.url,
    });
    const tokenHeader = req.headers.get("x-goog-channel-token");
    const expectedToken = Deno.env.get("GOOGLE_WEBHOOK_TOKEN");
    if (expectedToken && tokenHeader && tokenHeader !== expectedToken) {
      await supabaseLog("Invalid webhook token", { tokenHeader, expectedToken });
      return new Response(JSON.stringify({ success: false, error: "Invalid webhook token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      await supabaseLog("Missing Supabase service credentials");
      return new Response(JSON.stringify({ success: false, error: "Missing Supabase service credentials" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await supabase.from("calendar_sync_settings").select("mode, test_calendar_id, live_calendar_id").eq("id", 1).single();
    if (!settings) {
      await supabaseLog("calendar_sync_settings row is missing");
      throw new Error("calendar_sync_settings row is missing");
    }

    const calendarId = settings.mode === "live" ? settings.live_calendar_id : settings.test_calendar_id;
    const accessToken = await getGoogleAccessToken();

    const { data: appointments } = await supabase.from("appointments").select("id, status, is_confirmed, calendar_event_id, confirmed_date, confirmed_time, confirmed_duration_minutes").not("calendar_event_id", "is", null).limit(500);

    const candidates = (appointments || []).filter((appointment) => appointment.status !== "cancelled");

    let synced = 0;
    let updated = 0;
    let errors = 0;
    let scanned = 0;

    await supabaseLog("Processing appointments", { total: appointments?.length, candidates: candidates.length });

    for (const appointment of candidates) {
      const eventId = appointment.calendar_event_id;
      if (!eventId) continue;
      scanned += 1;

      const eventResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (eventResponse.status === 404) {
        errors += 1;
        await supabaseLog("Event not found in Google Calendar", { appointmentId: appointment.id, eventId });
        await supabase
          .from("appointments")
          .update({
            calendar_sync_status: "error",
            calendar_last_error: "Google Calendar event no longer exists",
          })
          .eq("id", appointment.id);
        continue;
      }

      const eventData = await eventResponse.json();
      if (!eventResponse.ok || eventData?.status === "cancelled") {
        errors += 1;
        await supabaseLog("Event fetch error or cancelled", { appointmentId: appointment.id, eventId, eventData });
        await supabase
          .from("appointments")
          .update({
            calendar_sync_status: "error",
            calendar_last_error: eventData?.error?.message || "Calendar event unavailable",
          })
          .eq("id", appointment.id);
        continue;
      }

      const startDateTime = eventData?.start?.dateTime;
      const endDateTime = eventData?.end?.dateTime;
      if (!startDateTime || !endDateTime) {
        errors += 1;
        await supabaseLog("Missing start or end time", { appointmentId: appointment.id, eventId, eventData });
        continue;
      }

      const startParsed = parseDateTime(startDateTime);
      const startDate = new Date(startDateTime);
      const endDate = new Date(endDateTime);
      const durationMinutes = Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000));

      const changed = appointment.confirmed_date !== startParsed.date || appointment.confirmed_time !== startParsed.time || Number(appointment.confirmed_duration_minutes || 0) !== durationMinutes;

      await supabase
        .from("appointments")
        .update({
          confirmed_date: startParsed.date,
          confirmed_time: startParsed.time,
          confirmed_duration_minutes: durationMinutes,
          calendar_sync_status: "synced",
          calendar_last_synced_at: new Date().toISOString(),
          calendar_last_error: null,
        })
        .eq("id", appointment.id);

      synced += 1;
      if (changed) updated += 1;
      await supabaseLog("Appointment updated from calendar", { appointmentId: appointment.id, eventId, changed });
    }

    // Update last sync timestamp
    await supabase
      .from("calendar_sync_settings")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", 1);

    return new Response(JSON.stringify({ success: true, totalLinked: appointments?.length || 0, scanned, synced, updated, errors }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SERVICE_ROLE_KEY") || "";
      if (supabaseUrl && serviceRoleKey) {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        await supabase.from("calendar_webhook_logs").insert({
          message: "Webhook error",
          extra: String(error),
          created_at: new Date().toISOString(),
        });
      }
    } catch (_) {}
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
