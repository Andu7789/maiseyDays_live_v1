-- Diagnostic queries for calendar sync issues
-- Run these in Supabase SQL Editor to troubleshoot

-- 1. Check if watch channel is active
SELECT
  id,
  mode,
  calendar_id,
  channel_id,
  expiration,
  webhook_address,
  updated_at,
  -- Check if expired
  CASE
    WHEN expiration < NOW() THEN '⚠️ EXPIRED'
    WHEN expiration < NOW() + INTERVAL '1 day' THEN '⚠️ Expires soon'
    ELSE '✅ Active'
  END as status
FROM calendar_watch_channels
WHERE id = 1;

-- 2. Check recent webhook calls from Google
SELECT
  id,
  message,
  extra,
  created_at
FROM calendar_webhook_logs
ORDER BY created_at DESC
LIMIT 20;

-- 3. Check appointments with calendar sync
SELECT
  id,
  dogname,
  ownername,
  confirmed_date,
  confirmed_time,
  calendar_event_id,
  calendar_sync_status,
  calendar_last_synced_at,
  calendar_last_error
FROM appointments
WHERE calendar_event_id IS NOT NULL
ORDER BY confirmed_date DESC
LIMIT 10;

-- 4. Check calendar sync settings
SELECT
  id,
  mode,
  test_calendar_id,
  live_calendar_id,
  timezone,
  updated_at
FROM calendar_sync_settings
WHERE id = 1;
