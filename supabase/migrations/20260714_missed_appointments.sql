-- Bookings now auto-complete once their date passes, so the old manual
-- "Mark Completed" button is repurposed into a "Mark Missed" flag for
-- no-shows, with a reason that surfaces as a warning next time that
-- customer is booked again.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS missed boolean NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS missed_reason text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS missed_at timestamptz;
