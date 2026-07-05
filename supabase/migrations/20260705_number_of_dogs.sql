-- Track how many dogs a single booking covers, so the £20-per-dog deposit
-- can be calculated correctly (e.g. 2 dogs in one appointment = £40 deposit).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS number_of_dogs integer NOT NULL DEFAULT 1;
