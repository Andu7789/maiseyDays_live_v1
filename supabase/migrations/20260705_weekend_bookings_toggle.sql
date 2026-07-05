-- Toggle for whether customers can book Saturday/Sunday appointments.
-- Weekdays (Mon-Fri) are always bookable; this only affects weekends.
ALTER TABLE holiday_settings ADD COLUMN IF NOT EXISTS weekends_enabled boolean NOT NULL DEFAULT true;
