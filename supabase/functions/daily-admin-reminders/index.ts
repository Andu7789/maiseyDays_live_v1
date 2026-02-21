import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const toISODate = (date: Date) => date.toISOString().slice(0, 10);

const formatDate = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const normalizeUkPhone = (raw: string) => {
  const cleaned = String(raw || "")
    .replace(/\s+/g, "")
    .replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("0")) return `+44${cleaned.slice(1)}`;
  if (cleaned.startsWith("44")) return `+${cleaned}`;
  return cleaned;
};

const sendAdminEmail = async (to: string, subject: string, message: string) => {
  const endpoint = Deno.env.get("ADMIN_EMAIL_WEBHOOK_URL");
  if (!endpoint) return { success: false, reason: "ADMIN_EMAIL_WEBHOOK_URL missing" };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ _subject: subject, email: to, _replyto: to, message, name: "Maisey Days Admin" }),
  });

  return { success: response.ok };
};

const sendAdminSms = async (to: string, message: string) => {
  const smsTestMode = (Deno.env.get("SMS_TEST_MODE") || "false").toLowerCase() === "true";
  if (smsTestMode) {
    console.log("SMS_TEST_MODE enabled. Skipping admin reminder SMS.", { to, message });
    return { success: true, provider: "mock", testMode: true };
  }

  const vonageApiKey = Deno.env.get("VONAGE_API_KEY");
  const vonageApiSecret = Deno.env.get("VONAGE_API_SECRET");
  const vonageFrom = Deno.env.get("VONAGE_FROM") || "MaiseyDays";
  if (!vonageApiKey || !vonageApiSecret) return { success: false, reason: "Vonage credentials missing" };

  const response = await fetch("https://rest.nexmo.com/sms/json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      api_key: vonageApiKey,
      api_secret: vonageApiSecret,
      from: vonageFrom,
      to: normalizeUkPhone(to),
      text: message,
    }),
  });

  const data = await response.json();
  return { success: data?.messages?.[0]?.status === "0", data };
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ success: false, error: "Missing Supabase service credentials" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await supabase.from("admin_notification_settings").select("reminder_email, reminder_phone").eq("id", 1).single();
    const reminderEmail = settings?.reminder_email || "andrew.britain@gmail.com";
    const reminderPhone = settings?.reminder_phone || "+447875200849";

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const sixWeeksAgo = new Date(today);
    sixWeeksAgo.setDate(today.getDate() - 42);

    const sixWeeksDate = toISODate(sixWeeksAgo);
    const tomorrowDate = toISODate(tomorrow);

    const { data: confirmedBookings } = await supabase.from("appointments").select("id, ownername, email, phone, dogname, serviceid, confirmed_date, confirmed_time, is_confirmed").eq("is_confirmed", true).not("confirmed_date", "is", null);

    const groupedByDog = new Map();
    for (const booking of confirmedBookings || []) {
      const key = `${booking.dogname}::${booking.ownername}`;
      const existing = groupedByDog.get(key);
      if (!existing || booking.confirmed_date > existing.confirmed_date) groupedByDog.set(key, booking);
    }

    const dueForSixWeekReminder = [...groupedByDog.values()].filter((booking: any) => booking.confirmed_date === sixWeeksDate);

    if (dueForSixWeekReminder.length > 0) {
      const lines = dueForSixWeekReminder.map((booking: any) => {
        return `- ${booking.dogname} (${booking.ownername}), last groom: ${formatDate(booking.confirmed_date)}, contact: ${booking.phone || "No phone"} / ${booking.email || "No email"}`;
      });

      await sendAdminEmail(reminderEmail, `6-week follow-up due (${formatDate(toISODate(today))})`, `Dogs due for follow-up today:\n\n${lines.join("\n")}`);
    }

    const tomorrowBookings = (confirmedBookings || []).filter((booking: any) => booking.confirmed_date === tomorrowDate);

    if (tomorrowBookings.length > 0) {
      const summary = tomorrowBookings.map((booking: any) => `${booking.confirmed_time || "TBC"} ${booking.dogname} (${booking.serviceid})`).join(", ");
      await sendAdminSms(reminderPhone, `Tomorrow's grooms (${formatDate(tomorrowDate)}): ${tomorrowBookings.length}. ${summary}`);
    }

    await supabase.from("admin_notification_log").insert([
      {
        notification_type: "daily-admin-reminders",
        destination: `${reminderEmail} | ${reminderPhone}`,
        payload: {
          sixWeeksDate,
          tomorrowDate,
          sixWeekCount: dueForSixWeekReminder.length,
          tomorrowCount: tomorrowBookings.length,
        },
        success: true,
      },
    ]);

    return new Response(JSON.stringify({ success: true, sixWeekCount: dueForSixWeekReminder.length, tomorrowCount: tomorrowBookings.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
