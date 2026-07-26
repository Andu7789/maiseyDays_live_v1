-- Tracks when a booking request was submitted, so the admin dashboard can
-- flag web requests that have sat in "pending" for more than 24 hours
-- unanswered. Existing rows backfill to now() (no earlier timestamp exists to
-- recover), so the warning only applies going forward from this migration.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
