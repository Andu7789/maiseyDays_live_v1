import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const to = normalizeUkPhone(body.to);
    const message = String(body.message || "").trim();

    if (!to || !message) {
      return new Response(JSON.stringify({ success: false, error: "Missing 'to' or 'message'" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const smsTestMode = (Deno.env.get("SMS_TEST_MODE") || "false").toLowerCase() === "true";
    if (smsTestMode) {
      console.log("SMS_TEST_MODE enabled. Skipping provider send.", { to, message });
      return new Response(JSON.stringify({ success: true, provider: "mock", testMode: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vonageApiKey = Deno.env.get("VONAGE_API_KEY");
    const vonageApiSecret = Deno.env.get("VONAGE_API_SECRET");
    const vonageFrom = Deno.env.get("VONAGE_FROM") || "MaiseyDays";

    if (!vonageApiKey || !vonageApiSecret) {
      return new Response(JSON.stringify({ success: false, error: "Vonage credentials missing" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const smsResponse = await fetch("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        api_key: vonageApiKey,
        api_secret: vonageApiSecret,
        from: vonageFrom,
        to,
        text: message,
      }),
    });

    const data = await smsResponse.json();
    const status = data?.messages?.[0]?.status;
    const success = status === "0";
    const providerError = data?.messages?.[0]?.["error-text"] || null;

    return new Response(JSON.stringify({ success, provider: "vonage", data, error: providerError }), {
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
