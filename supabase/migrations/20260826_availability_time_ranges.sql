-- Lets a closed date/weekday cover just part of the day (e.g. "closed
-- Wednesdays 09:00-12:00") instead of always blocking the whole day. NULL
-- start/end (the default, and every existing row) still means the whole
-- day/date is closed, so nothing already set changes meaning.
ALTER TABLE availabilities ADD COLUMN IF NOT EXISTS start_time text;
ALTER TABLE availabilities ADD COLUMN IF NOT EXISTS end_time text;
