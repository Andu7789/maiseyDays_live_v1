@echo off
REM Sync Maisey Days Calendar
curl -X POST https://rmooksnngqyzqraeicvr.supabase.co/functions/v1/calendar-webhook-handler ^
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29rc25uZ3F5enFyYWVpY3ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTU2NDgsImV4cCI6MjA4NTM3MTY0OH0.N4COImAWUpLz7yS4OJM4Tgsew-On6s_5ee0_F6pw3-c" ^
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29rc25uZ3F5enFyYWVpY3ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTU2NDgsImV4cCI6MjA4NTM3MTY0OH0.N4COImAWUpLz7yS4OJM4Tgsew-On6s_5ee0_F6pw3-c" ^
  -H "Content-Type: application/json"
