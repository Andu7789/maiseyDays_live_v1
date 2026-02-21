# Set Up Automatic Calendar Sync with Supabase Cron Jobs

## Option 1: Use Supabase Edge Function Cron (Recommended)

Supabase doesn't have built-in cron for edge functions, but you can use an external cron service.

### Using Cron-Job.org (Free)

1. Go to [https://cron-job.org/](https://cron-job.org/) and create a free account

2. Create a new cron job:
   - **URL**: `https://rmooksnngqyzqraeicvr.supabase.co/functions/v1/calendar-webhook-handler`
   - **Method**: POST
   - **Schedule**: Every 10 minutes
   - **Headers**:
     - `apikey`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29rc25uZ3F5enFyYWVpY3ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTU2NDgsImV4cCI6MjA4NTM3MTY0OH0.N4COImAWUpLz7yS4OJM4Tgsew-On6s_5ee0_F6pw3-c`
     - `Authorization`: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29rc25uZ3F5enFyYWVpY3ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTU2NDgsImV4cCI6MjA4NTM3MTY0OH0.N4COImAWUpLz7yS4OJM4Tgsew-On6s_5ee0_F6pw3-c`
     - `Content-Type`: `application/json`

3. Save and enable

### Using EasyCron (Free tier available)

1. Go to [https://www.easycron.com/](https://www.easycron.com/)
2. Create account
3. Create cron job with same settings as above

### Using GitHub Actions (Free for public repos)

Create `.github/workflows/sync-calendar.yml`:

```yaml
name: Sync Google Calendar
on:
  schedule:
    - cron: '*/10 * * * *'  # Every 10 minutes
  workflow_dispatch:  # Allow manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Call Calendar Sync
        run: |
          curl -X POST \
            https://rmooksnngqyzqraeicvr.supabase.co/functions/v1/calendar-webhook-handler \
            -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29rc25uZ3F5enFyYWVpY3ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTU2NDgsImV4cCI6MjA4NTM3MTY0OH0.N4COImAWUpLz7yS4OJM4Tgsew-On6s_5ee0_F6pw3-c" \
            -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29rc25uZ3F5enFyYWVpY3ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTU2NDgsImV4cCI6MjA4NTM3MTY0OH0.N4COImAWUpLz7yS4OJM4Tgsew-On6s_5ee0_F6pw3-c" \
            -H "Content-Type: application/json"
```

## Option 2: Supabase Database Cron (pg_cron extension)

If Supabase has pg_cron enabled, you can schedule database jobs.

```sql
-- Enable pg_cron extension (may require Supabase support)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule calendar sync every 10 minutes
SELECT cron.schedule(
  'calendar-sync',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url:='https://rmooksnngqyzqraeicvr.supabase.co/functions/v1/calendar-webhook-handler',
    headers:='{"apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29rc25uZ3F5enFyYWVpY3ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTU2NDgsImV4cCI6MjA4NTM3MTY0OH0.N4COImAWUpLz7yS4OJM4Tgsew-On6s_5ee0_F6pw3-c", "Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);

-- View scheduled jobs
SELECT * FROM cron.job;

-- Unschedule if needed
SELECT cron.unschedule('calendar-sync');
```

## Test the Auto-Sync

After setting up cron:

1. Edit an event in Google Calendar
2. Wait 10 minutes (or whatever interval you set)
3. Refresh your admin panel
4. The booking should be updated automatically!

## Monitoring

Check webhook logs to see if sync is running:

```sql
SELECT message, created_at
FROM calendar_webhook_logs
ORDER BY created_at DESC
LIMIT 20;
```

You should see entries every 10 minutes showing "Webhook received" and "Processing appointments".
