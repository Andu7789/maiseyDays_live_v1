-- Fix permissions on calendar_webhook_logs table
-- Run this in Supabase SQL Editor

-- 1. Check if table exists and has data
SELECT COUNT(*) as total_logs FROM calendar_webhook_logs;

-- 2. Check current RLS status
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'calendar_webhook_logs';

-- 3. Disable RLS or add policy to allow anonymous reads
ALTER TABLE calendar_webhook_logs DISABLE ROW LEVEL SECURITY;

-- OR if you prefer to keep RLS enabled:
-- ALTER TABLE calendar_webhook_logs ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Allow anonymous read access to webhook logs"
--   ON calendar_webhook_logs
--   FOR SELECT
--   USING (true);

-- 4. Verify logs exist
SELECT
  id,
  message,
  created_at,
  LENGTH(extra) as extra_length
FROM calendar_webhook_logs
ORDER BY created_at DESC
LIMIT 10;
