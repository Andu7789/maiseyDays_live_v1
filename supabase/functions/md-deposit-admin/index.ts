import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Pinned so a change to the account's default API version can't change how these calls behave.
const STRIPE_API_VERSION = "2026-09-30.endive";

const CREDIT_VALID_MONTHS = 12;
const addMonths = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // The anon key is public, and this Supabase project is shared with other apps whose users can also sign in,
    // so a valid session isn't enough: the email must be on the Maisey Days admin allowlist.
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    const admins = (Deno.env.get("MD_ADMIN_EMAILS") || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const userEmail = (userData?.user?.email || "").toLowerCase();
    if (authError || !userEmail || !admins.includes(userEmail)) return json({ error: "Admin sign-in required" }, 401);

    const { action, appointmentId, email } = await req.json();

    if (action === "balance") {
      const { data } = await supabase
        .from("md_deposit_credits")
        .select("amount, used_amount, expires_at")
        .ilike("email", String(email || "").trim())
        .gt("expires_at", new Date().toISOString());
      const live = (data || []).filter((c) => Number(c.amount) - Number(c.used_amount) > 0);
      const balance = live.reduce((sum, c) => sum + (Number(c.amount) - Number(c.used_amount)), 0);
      const expiresAt = live.map((c) => c.expires_at).sort()[0] || null;
      return json({ balance, expiresAt });
    }

    if (!appointmentId) return json({ error: "Missing appointmentId" }, 400);
    const { data: apt } = await supabase.from("appointments").select("*").eq("id", appointmentId).maybeSingle();
    if (!apt) return json({ error: "Booking not found" }, 404);
    if (!apt.deposit_paid) return json({ error: "No deposit has been paid on this booking" }, 400);
    if (apt.deposit_refunded_at) return json({ error: "This deposit has already been refunded or carried over" }, 400);

    const depositTotal = Number(apt.deposit_amount) || 0;
    const creditPortion = Number(apt.deposit_credit_applied) || 0;
    const nowIso = new Date().toISOString();

    if (action === "refund") {
      const stripeKey = Deno.env.get("MD_STRIPE_SECRET_KEY");
      if (!stripeKey) return json({ error: "Stripe is not configured" }, 500);
      if (!apt.stripe_payment_intent_id) return json({ error: "This deposit wasn't paid through Stripe. Refund it by hand, then use Mark Refunded/Handled." }, 400);

      const cardAmount = Math.round((depositTotal - creditPortion) * 100);
      if (cardAmount > 0) {
        const form = new URLSearchParams({ payment_intent: apt.stripe_payment_intent_id, amount: String(cardAmount), "metadata[appointment_id]": apt.id });
        const res = await fetch("https://api.stripe.com/v1/refunds", {
          method: "POST",
          headers: { Authorization: `Bearer ${stripeKey}`, "Stripe-Version": STRIPE_API_VERSION, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `md-refund-${apt.id}` },
          body: form,
        });
        const refund = await res.json();
        if (!res.ok) {
          console.error("Stripe refund error:", refund);
          return json({ error: refund?.error?.message || "Stripe refused the refund" }, 502);
        }
      }
      // Any part of the deposit that was paid with credit goes back to being credit.
      if (creditPortion > 0) {
        await supabase.from("md_deposit_credits").insert({ email: String(apt.email).trim().toLowerCase(), amount: creditPortion, expires_at: addMonths(CREDIT_VALID_MONTHS), source_appointment_id: apt.id, note: "Credit restored after refund" });
      }
      await supabase.from("appointments").update({ deposit_refunded_at: nowIso, deposit_refund_method: "stripe" }).eq("id", apt.id);
      return json({ success: true, refundedToCard: cardAmount / 100, creditRestored: creditPortion });
    }

    if (action === "credit") {
      if (!apt.email) return json({ error: "This booking has no email to attach credit to" }, 400);
      const expiresAt = addMonths(CREDIT_VALID_MONTHS);
      await supabase.from("md_deposit_credits").insert({ email: String(apt.email).trim().toLowerCase(), amount: depositTotal, expires_at: expiresAt, source_appointment_id: apt.id, note: `Carried over from cancelled booking for ${apt.dogname}` });
      await supabase.from("appointments").update({ deposit_refunded_at: nowIso, deposit_refund_method: "credit" }).eq("id", apt.id);
      return json({ success: true, credit: depositTotal, expiresAt });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("md-deposit-admin failed:", err);
    return json({ error: "Something went wrong." }, 500);
  }
});
