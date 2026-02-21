-- Update calendar sync settings for Maisey Days
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/rmooksnngqyzqraeicvr/sql

UPDATE calendar_sync_settings
SET
  test_calendar_id = 'andrew.britain@gmail.com',
  test_owner_email = 'andrew.britain@gmail.com',
  updated_at = NOW()
WHERE id = 1;

-- Verify the update
SELECT
  id,
  mode,
  test_calendar_id,
  live_calendar_id,
  test_owner_email,
  live_owner_email,
  timezone
FROM calendar_sync_settings;
