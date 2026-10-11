-- Stripe-backed £10 per dog deposit, with refunds and carried-over credit.
-- Additive only: new columns on appointments plus one new md_-prefixed table
-- (this Supabase project is shared with other apps, so never use generic names).

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS deposit_credit_applied numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_refund_method text; -- 'stripe' | 'credit' | 'manual'

ALTER TABLE appointments ALTER COLUMN deposit_amount SET DEFAULT 10.00;
COMMENT ON COLUMN appointments.deposit_amount IS 'Deposit amount (£10 per dog)';
COMMENT ON COLUMN appointments.deposit_paid IS 'Whether the deposit has been paid (set by the Stripe webhook, or manually by the admin)';

-- booking_status = 'awaiting_payment' marks a web request whose Stripe checkout
-- has not completed yet. It holds the slot for 35 minutes, then is ignored.

CREATE TABLE IF NOT EXISTS md_deposit_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  amount numeric(10, 2) NOT NULL,
  used_amount numeric(10, 2) NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  source_appointment_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_md_deposit_credits_email ON md_deposit_credits (lower(email));

-- No policies on purpose: only edge functions (service role) can read or write credits.
ALTER TABLE md_deposit_credits ENABLE ROW LEVEL SECURITY;

-- The existing check constraint on booking_status must allow the new checkout state.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_booking_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_booking_status_check
  CHECK (booking_status = ANY (ARRAY['awaiting_payment'::text, 'pending'::text, 'confirmed'::text, 'completed'::text, 'due_for_rebook'::text, 'cancelled'::text]));
