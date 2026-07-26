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

const wrapHtml = (bodyHtml: string) => `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
    <h2 style="color: #059669;">Maisey Days @ Dirty Dawg 🐾</h2>
    ${bodyHtml}
  </div>
`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const to = String(body.to || "").trim();
    const template = String(body.template || "");
    const name = String(body.name || "").trim() || "there";
    const firstName = name.split(/\s+/)[0];

    if (!to || !template) {
      return jsonResponse({ success: false, error: "Missing 'to' or 'template'" });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return jsonResponse({ success: false, error: "Email is not configured yet (RESEND_API_KEY missing)." });
    }
    const fromAddress = Deno.env.get("INTAKE_FROM_EMAIL") || "Maisey Days @ Dirty Dawg <onboarding@resend.dev>";

    let subject: string;
    let html: string;

    if (template === "booking-received") {
      const dogName = String(body.dogName || "your dog");
      const date = String(body.date || "");
      const serviceName = String(body.serviceName || "");
      const locationName = String(body.locationName || "");
      subject = `APPOINTMENT PENDING - ${dogName}`;
      html = wrapHtml(`
        <p>Hi ${firstName},</p>
        <p>Thanks for requesting a pamper session for <strong>${dogName}</strong>! 🐶</p>
        <p><strong style="font-size: 16px; color: red;">🛑 PLEASE NOTE: THIS IS NOT A CONFIRMED BOOKING YET.</strong></p>
        <p>We're just checking our diary and will get back to you within 48 hours to either confirm your appointment or discuss alternative dates and times that work for you.</p>
        <p><strong>Booking Details:</strong><br>
        Dog: ${dogName}<br>
        Requested Date: ${date}<br>
        Service: ${serviceName}<br>
        Location: ${locationName}</p>
        <p>If you have any questions in the meantime, please do not hesitate to contact us on 07368 465966.</p>
        <p>We look forward to seeing you soon!</p>
        <p>Warm regards,<br>Rachel<br>Maisey Days @ Dirty Dawg 🐾</p>
      `);
    } else if (template === "holiday-enquiry") {
      subject = "Thanks for your enquiry - Maisey Days @ Dirty Dawg";
      html = wrapHtml(`
        <p>Hello ${firstName},</p>
        <p>Thank you for your enquiry! We're currently away, but we've received your details and will be in touch as soon as we're back to arrange your appointment.</p>
        <p>Best regards,<br>Maisey Days @ Dirty Dawg 🐾</p>
      `);
    } else if (template === "custom") {
      // Free-form reply typed by the admin (e.g. replying to a booking request),
      // sent through the properly-authenticated domain instead of a personal inbox.
      subject = String(body.subject || "Message from Maisey Days @ Dirty Dawg").trim();
      const messageText = String(body.message || "").trim();
      if (!messageText) {
        return jsonResponse({ success: false, error: "Message is empty." });
      }
      const escapedHtml = messageText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
      html = wrapHtml(`<p>${escapedHtml}</p>`);
    } else {
      return jsonResponse({ success: false, error: "Unknown template." });
    }

    const replyTo = String(body.replyTo || "").trim();

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerError = data?.message || `Resend returned status ${response.status}`;
      return jsonResponse({ success: false, error: providerError });
    }

    return jsonResponse({ success: true, id: data?.id || null });
  } catch (error) {
    console.error("send-customer-email error:", error);
    return jsonResponse({ success: false, error: "Something went wrong sending the email." });
  }
});
