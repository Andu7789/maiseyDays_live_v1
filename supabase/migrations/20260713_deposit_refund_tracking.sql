-- Tracks whether a paid deposit on a now-cancelled booking has been
-- refunded/dealt with. Left null when a booking is cancelled with a
-- deposit paid, so it shows as "owed" on the customer's record until an
-- admin explicitly marks it handled (refunded, kept as credit, etc.).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_refunded_at timestamptz;
