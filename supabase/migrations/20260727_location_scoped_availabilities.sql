-- Closed dates/weekdays ("availabilities") previously applied to every location
-- at once — booking out one branch for a date closed it everywhere. Adds a
-- location scope: NULL locationid = both locations (matches all existing rows,
-- so nothing already set changes meaning), a specific id ("caister"/"winterton")
-- = that location only.
ALTER TABLE availabilities ADD COLUMN IF NOT EXISTS locationid text;
