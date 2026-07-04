import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const to = String(body.to || "").trim();
    const name = String(body.name || "").trim() || "there";
    const link = String(body.link || "").trim();

    if (!to || !link) {
      return jsonResponse({ success: false, error: "Missing 'to' or 'link'" });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return jsonResponse({ success: false, error: "Email is not configured yet (RESEND_API_KEY missing). Use WhatsApp or SMS instead." });
    }

    const fromAddress = Deno.env.get("INTAKE_FROM_EMAIL") || "Maisey Days @ Dirty Dawg <onboarding@resend.dev>";
    const firstName = name.split(/\s+/)[0];

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #059669;">Maisey Days @ Dirty Dawg 🐾</h2>
        <p>Hi ${firstName},</p>
        <p>Thanks for booking with us! Before your appointment, please fill in our quick grooming agreement form — it only takes a couple of minutes and helps us give your dog the best possible groom.</p>
        <p style="margin: 28px 0;">
          <a href="${link}" style="background: #059669; color: #ffffff; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: bold;">Complete Your Grooming Agreement</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">If the button doesn't work, copy and paste this link into your browser:<br>${link}</p>
        <p>See you soon!<br>Maisey Days @ Dirty Dawg</p>
      </div>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject: "Please complete your grooming agreement 🐾",
        html,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerError = data?.message || `Resend returned status ${response.status}`;
      return jsonResponse({ success: false, error: providerError });
    }

    return jsonResponse({ success: true, id: data?.id || null });
  } catch (error) {
    console.error("send-intake-email error:", error);
    return jsonResponse({ success: false, error: "Something went wrong sending the email." });
  }
});
