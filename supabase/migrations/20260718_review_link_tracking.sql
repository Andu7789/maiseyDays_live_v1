-- Lets the admin store their Google review link once in Settings, and tracks
-- per-customer whether they've been asked for a review yet, so the Customer
-- Database can highlight anyone who's completed a groom but hasn't been asked.
ALTER TABLE holiday_settings ADD COLUMN IF NOT EXISTS google_review_link text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS review_link_sent_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS review_link_sent_via text;
