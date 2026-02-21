-- Check if webhook logs exist
SELECT
  id,
  message,
  created_at
FROM calendar_webhook_logs
ORDER BY created_at DESC
LIMIT 10;

-- If no results, the table might be empty
-- If you see results, check what messages are being logged
