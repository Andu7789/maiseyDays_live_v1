-- Add advert banner fields to holiday_settings.
-- advert_start / advert_end control when the banner shows.
-- advert_text is the message displayed. NULL text = banner off even if dates are set.

ALTER TABLE holiday_settings
  ADD COLUMN IF NOT EXISTS advert_start date NULL,
  ADD COLUMN IF NOT EXISTS advert_end   date NULL,
  ADD COLUMN IF NOT EXISTS advert_text  text NULL;
