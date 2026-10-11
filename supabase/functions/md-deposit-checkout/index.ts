import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const DEPOSIT_PER_DOG = 10;
const ALLOWED_ORIGINS = ["https://maiseydaysdoggrooming.co.uk", "https://www.maiseydaysdoggrooming.co.uk", "http://localhost:5173"];

const isAllowedOrigin = (origin: string) => ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(workers\.dev|pages\.dev)$/.test(origin);

// Pinned so a change to the account's default API version can't change how these calls behave.
const STRIPE_API_VERSION = "2026-09-30.endive";

const stripe = (path: string, body?: URLSearchParams) =>
  fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${Deno.env.get("MD_STRIPE_SECRET_KEY")}`, "Stripe-Version": STRIPE_API_VERSION, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

// Stops a Checkout page from taking payment. False means it was already paid (or the check failed), so the booking must stay.
async function closeCheckoutSession(sessionId: string) {
  const res = await stripe(`checkout/sessions/${sessionId}/expire`, new URLSearchParams());
  if (res.ok) return true;
  const check = await stripe(`checkout/sessions/${sessionId}`);
  if (check.status === 404) return true; // made under a different Stripe account, so it can't pay this one
  const session = await check.json();
  return check.ok && session.status === "expired";
}

// Spends credit oldest-expiry-first.
async function consumeCredits(supabase: any, email: string, amount: number) {
  let remaining = amount;
  const { data: credits } = await supabase
    .from("md_deposit_credits")
    .select("id, amount, used_amount")
    .ilike("email", email.trim())
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true });
  for (const c of credits || []) {
    if (remaining <= 0) break;
    const left = Number(c.amount) - Number(c.used_amount);
    if (left <= 0) continue;
    const take = Math.min(left, remaining);
    await supabase.from("md_deposit_credits").update({ used_amount: Number(c.used_amount) + take }).eq("id", c.id);
    remaining -= take;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("MD_STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Card payments are not configured yet." }, 500);

    const { action = "create", appointmentId, origin } = await req.json();
    if (!appointmentId) return json({ error: "Missing appointmentId" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: apt, error } = await supabase
      .from("appointments")
      .select("id, email, dogname, number_of_dogs, deposit_paid, booking_status, created_at, stripe_checkout_session_id")
      .eq("id", appointmentId)
      .maybeSingle();
    if (error || !apt) return json({ error: "Booking not found" }, 404);

    // The page polls this after returning from Stripe while the webhook lands.
    if (action === "status") {
      const released = apt.booking_status === "awaiting_payment" && !apt.deposit_paid && Date.now() - new Date(apt.created_at).getTime() > 35 * 60 * 1000;
      return json({ paid: !!apt.deposit_paid, released });
    }

    // Customer backed out of (or failed to reach) the payment page: release the held slot straight away.
    if (action === "abandon") {
      if (apt.deposit_paid || apt.booking_status !== "awaiting_payment") return json({ released: false, paid: !!apt.deposit_paid });
      // The Checkout page stays payable until it expires, so close it first or pressing Back could pay for a deleted booking.
      if (apt.stripe_checkout_session_id && !(await closeCheckoutSession(apt.stripe_checkout_session_id))) return json({ released: false });
      await supabase.from("appointments").delete().eq("id", apt.id).eq("deposit_paid", false);
      return json({ released: true });
    }

    if (apt.deposit_paid) return json({ paid: true });
    if (apt.booking_status !== "awaiting_payment") return json({ error: "This booking is not awaiting payment" }, 400);
    if (!isAllowedOrigin(String(origin || ""))) return json({ error: "Unrecognised site address" }, 400);

    // One payable Checkout page per booking: close any earlier one so the deposit can't be paid twice.
    const previousSessionId = apt.stripe_checkout_session_id;
    if (previousSessionId && !(await closeCheckoutSession(previousSessionId))) {
      return json({ error: "A payment for this booking is already going through. Please wait a moment and refresh." }, 409);
    }

    // Tidy up abandoned, never-paid attempts older than a day.
    await supabase
      .from("appointments")
      .delete()
      .eq("booking_status", "awaiting_payment")
      .eq("deposit_paid", false)
      .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const dogs = Math.max(1, Number(apt.number_of_dogs) || 1);
    const depositTotal = dogs * DEPOSIT_PER_DOG;

    // Credit carried over from an earlier cancelled booking, matched by email.
    const { data: credits } = await supabase
      .from("md_deposit_credits")
      .select("id, amount, used_amount, expires_at")
      .ilike("email", String(apt.email || "").trim())
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true });
    const available = (credits || []).reduce((sum, c) => sum + (Number(c.amount) - Number(c.used_amount)), 0);
    const creditApplied = Math.min(Math.max(available, 0), depositTotal);
    const cardAmount = Math.round((depositTotal - creditApplied) * 100) / 100;

    // Credit covers the whole deposit: no card payment needed.
    if (cardAmount <= 0) {
      const { data: claimed, error: claimError } = await supabase
        .from("appointments")
        .update({
          deposit_paid: true,
          deposit_amount: depositTotal,
          deposit_paid_at: new Date().toISOString(),
          deposit_credit_applied: creditApplied,
          deposit_notes: `Paid with £${creditApplied.toFixed(2)} carried-over credit`,
          booking_status: "pending",
        })
        .eq("id", apt.id)
        .eq("deposit_paid", false)
        .select("id");
      if (claimError) throw claimError;
      // Only the request that flipped deposit_paid spends the credit, so a repeat call can't spend it twice.
      if (claimed?.length) await consumeCredits(supabase, String(apt.email), creditApplied);
      return json({ paid: true, creditApplied });
    }

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("client_reference_id", apt.id);
    form.set("customer_email", String(apt.email));
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", "gbp");
    form.set("line_items[0][price_data][unit_amount]", String(Math.round(cardAmount * 100)));
    form.set("line_items[0][price_data][product_data][name]", `Grooming deposit for ${apt.dogname}${dogs > 1 ? ` (${dogs} dogs)` : ""}`);
    if (creditApplied > 0) form.set("line_items[0][price_data][product_data][description]", `£${depositTotal.toFixed(2)} deposit less £${creditApplied.toFixed(2)} credit`);
    form.set("metadata[appointment_id]", apt.id);
    form.set("metadata[credit_applied]", creditApplied.toFixed(2));
    form.set("metadata[deposit_total]", depositTotal.toFixed(2));
    form.set("payment_intent_data[metadata][appointment_id]", apt.id);
    form.set("expires_at", String(Math.floor(Date.now() / 1000) + 31 * 60));
    form.set("success_url", `${origin}/?deposit=success&aid=${apt.id}`);
    form.set("cancel_url", `${origin}/?deposit=cancelled&aid=${apt.id}`);

    const res = await stripe("checkout/sessions", form);
    const session = await res.json();
    if (!res.ok) {
      console.error("Stripe checkout error:", session);
      return json({ error: "Could not start payment. Please try again." }, 502);
    }

    // Record the new page only if no other request swapped in its own since we read the booking.
    const record = supabase.from("appointments").update({ stripe_checkout_session_id: session.id, deposit_amount: depositTotal }).eq("id", apt.id);
    const { data: recorded, error: recordError } = await (previousSessionId ? record.eq("stripe_checkout_session_id", previousSessionId) : record.is("stripe_checkout_session_id", null)).select("id");
    if (recordError || !recorded?.length) {
      await closeCheckoutSession(session.id);
      if (recordError) throw recordError;
      return json({ error: "A payment for this booking is already being started. Please wait a moment and refresh." }, 409);
    }
    return json({ url: session.url });
  } catch (err: any) {
    console.error("md-deposit-checkout failed:", err);
    return json({ error: "Something went wrong starting payment." }, 500);
  }
});
