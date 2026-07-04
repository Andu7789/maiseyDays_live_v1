-- Add colour picker field to advert banner settings.
ALTER TABLE holiday_settings
  ADD COLUMN IF NOT EXISTS advert_color text NULL DEFAULT '#16a34a';
