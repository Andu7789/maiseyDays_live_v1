import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deployed with verify_jwt = false: Stripe calls this directly and is authenticated by its signature.

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

async function verifySignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.t}.${payload}`)));
  if (expected.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

// Pinned so a change to the account's default API version can't change how these calls behave.
const STRIPE_API_VERSION = "2026-09-30.endive";

// Hands back a card payment that has no booking to attach to (booking deleted, or the deposit was already paid another way).
async function refundOrphanPayment(session: any, reason: string) {
  console.error(`Refunding Checkout ${session.id}: ${reason}`);
  if (!session.payment_intent) return;
  const res = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("MD_STRIPE_SECRET_KEY")}`,
      "Stripe-Version": STRIPE_API_VERSION,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `md-orphan-refund-${session.id}`,
    },
    body: new URLSearchParams({ payment_intent: session.payment_intent, "metadata[reason]": reason }),
  });
  if (!res.ok) throw new Error(`Orphan refund failed: ${JSON.stringify(await res.json())}`); // 500 makes Stripe retry
}

serve(async (req: Request) => {
  const secret = Deno.env.get("MD_STRIPE_WEBHOOK_SECRET");
  const signature = req.headers.get("stripe-signature");
  const payload = await req.text();
  if (!secret || !signature || !(await verifySignature(payload, signature, secret))) {
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(payload);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const id = session.client_reference_id || session.metadata?.appointment_id;
      if (!id || session.payment_status !== "paid") return new Response("ok");

      const creditApplied = Number(session.metadata?.credit_applied || 0);
      const depositTotal = Number(session.metadata?.deposit_total || 0) || Number(session.amount_total) / 100 + creditApplied;

      // Conditional on deposit_paid = false so a retried or duplicate event can't apply the payment (or spend credit) twice.
      const { data: claimed, error: claimError } = await supabase
        .from("appointments")
        .update({
          deposit_paid: true,
          deposit_amount: depositTotal,
          deposit_paid_at: new Date().toISOString(),
          deposit_credit_applied: creditApplied,
          deposit_notes: creditApplied > 0 ? `Paid by card via Stripe plus £${creditApplied.toFixed(2)} carried-over credit` : "Paid by card via Stripe",
          stripe_payment_intent_id: session.payment_intent,
          stripe_checkout_session_id: session.id,
          booking_status: "pending",
        })
        .eq("id", id)
        .eq("deposit_paid", false)
        .select("id, email");
      if (claimError) throw claimError;

      if (!claimed?.length) {
        const { data: current, error: readError } = await supabase.from("appointments").select("stripe_checkout_session_id").eq("id", id).maybeSingle();
        if (readError) throw readError;
        if (!current) await refundOrphanPayment(session, `booking ${id} no longer exists`);
        else if (current.stripe_checkout_session_id !== session.id) await refundOrphanPayment(session, `booking ${id} deposit was already paid`);
        return new Response("ok"); // otherwise this event was already handled
      }
      const apt = claimed[0];

      if (creditApplied > 0) {
        let remaining = creditApplied;
        const { data: credits } = await supabase
          .from("md_deposit_credits")
          .select("id, amount, used_amount")
          .ilike("email", String(apt.email).trim())
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
    } else if (event.type === "checkout.session.expired") {
      // Customer started paying and abandoned it: release the held slot.
      const session = event.data.object;
      const id = session.client_reference_id || session.metadata?.appointment_id;
      if (id) {
        await supabase.from("appointments").delete().eq("id", id).eq("booking_status", "awaiting_payment").eq("deposit_paid", false);
      }
    }
    return new Response("ok");
  } catch (err) {
    console.error("md-stripe-webhook failed:", err);
    return new Response("error", { status: 500 }); // Stripe will retry
  }
});
