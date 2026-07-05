-- Tracks how a "customer is due a rebook nudge" item on the dashboard was
-- resolved: Rachel either contacted the customer, or marked them as no
-- longer expected to return. Either one clears it from the dashboard list.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rebook_contacted_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rebook_closed_at timestamptz;
