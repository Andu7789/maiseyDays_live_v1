# Supabase Admin Authentication Setup

## Step 1: Create Admin User

Go to your Supabase dashboard → Authentication → Users → Add user

Create a user with:

- **Email**: your-admin-email@example.com (use your actual email)
- **Password**: Create a strong password
- **Email confirmed**: Check this box

## Step 2: Enable Row Level Security (Optional but Recommended)

Run these SQL commands in Supabase SQL Editor (Database → SQL Editor):

```sql
-- Enable RLS on appointments table
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert appointments (for bookings)
CREATE POLICY "Allow public to create bookings"
ON appointments FOR INSERT
TO anon
WITH CHECK (true);

-- Allow authenticated admins to view all appointments
CREATE POLICY "Allow admins to view appointments"
ON appointments FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated admins to update/delete appointments
CREATE POLICY "Allow admins to manage appointments"
ON appointments FOR ALL
TO authenticated
USING (true);

-- Similar policies for other admin tables
ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admins to manage availability"
ON availability_overrides FOR ALL
TO authenticated
USING (true);

ALTER TABLE weekly_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admins to manage templates"
ON weekly_templates FOR ALL
TO authenticated
USING (true);

ALTER TABLE availabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admins to manage availabilities"
ON availabilities FOR ALL
TO authenticated
USING (true);

-- Allow public read access to check availability
CREATE POLICY "Allow public to read availabilities"
ON availabilities FOR SELECT
TO anon
USING (true);
```

## Step 3: Test Admin Login

1. Go to your website
2. Click "Admin Login"
3. Enter the email and password you created in Step 1
4. You should now have secure access to the admin dashboard

## Security Benefits

✅ No hardcoded passwords in source code
✅ Passwords stored securely server-side
✅ Session-based authentication
✅ Automatic token refresh
✅ Row Level Security prevents unauthorized access
✅ Can add multiple admin users easily

## Troubleshooting

**Login fails**: Check that:

- Email confirmation is enabled in Supabase dashboard
- Your Supabase URL and anon key are correct in constants.tsx
- The user exists in Authentication → Users

**Can't access data**: Make sure you've run the RLS policies SQL above.

## New Admin Booking + Reminder Setup (Phase 2)

Run the migration in `supabase/migrations/20260213_admin_booking_enhancements.sql`.

This adds:

- Confirmed booking fields (`confirmed_date`, `confirmed_time`, `confirmed_duration_minutes`, `is_confirmed`)
- Requested preference field (`requested_time_preference`)
- Booking source (`web` or `manual`)
- Admin notification settings/log tables

### Deploy Edge Functions

Deploy these functions:

- `send-customer-confirmation-sms`
- `daily-admin-reminders`

Set function secrets:

- `VONAGE_API_KEY`
- `VONAGE_API_SECRET`
- `VONAGE_FROM`
- `SUPABASE_SERVICE_ROLE_KEY` (for `daily-admin-reminders`)
- `ADMIN_EMAIL_WEBHOOK_URL` (Formspree or another email webhook)

### Schedule daily reminders

Create a daily schedule (recommended: early morning UK time) for `daily-admin-reminders`.

The function sends:

- 6-week follow-up email reminder to `andrew.britain@gmail.com` (stored in `admin_notification_settings`)
- Day-before groom summary SMS to `+447875200849` (stored in `admin_notification_settings`)

Update these later with:

```sql
update admin_notification_settings
set reminder_email = 'new-email@example.com', reminder_phone = '+44...'
where id = 1;
```

## Two-Way Diary Setup (Google Calendar)

Run the migration in `supabase/migrations/20260213_calendar_sync_settings.sql`.
Run the migration in `supabase/migrations/20260213_google_watch_channel.sql`.

This adds:

- Calendar mapping fields on `appointments`
- `calendar_sync_settings` table with test/live mode switch

### Test mode vs live mode

Use test mode now (your personal Google calendar), then switch to live mode later without code changes.

```sql
-- View current calendar mode/settings
select * from calendar_sync_settings where id = 1;

-- Update calendar IDs/emails
update calendar_sync_settings
set
	test_calendar_id = 'primary',
	test_owner_email = 'andrew.britain@gmail.com',
	live_calendar_id = 'BUSINESS_CALENDAR_ID',
	live_owner_email = 'BUSINESS_OWNER_EMAIL'
where id = 1;

-- Keep testing on personal calendar
update calendar_sync_settings set mode = 'test' where id = 1;

-- Go live later on business owner calendar
update calendar_sync_settings set mode = 'live' where id = 1;
```

### Important for two-way sync

- OAuth credentials must have access to both calendars.
- Webhook handler should read `calendar_sync_settings.mode` and only sync against the active calendar.
- When switching `mode` to `live`, test mode data remains in DB for rollback safety.

### Deploy diary sync functions

Deploy:

```bash
npx supabase functions deploy sync-booking-to-calendar --project-ref rmooksnngqyzqraeicvr
npx supabase functions deploy calendar-webhook-handler --project-ref rmooksnngqyzqraeicvr
npx supabase functions deploy ensure-calendar-watch-channel --project-ref rmooksnngqyzqraeicvr
```

Set required secrets:

```bash
npx supabase secrets set --project-ref rmooksnngqyzqraeicvr \
	GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID" \
	GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET" \
	GOOGLE_REFRESH_TOKEN="YOUR_GOOGLE_REFRESH_TOKEN" \
	APP_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
	GOOGLE_WEBHOOK_TOKEN="YOUR_RANDOM_TOKEN"
```

Note: `supabase secrets set` skips names starting with `SUPABASE_`, so use `APP_SERVICE_ROLE_KEY` as the custom fallback secret.

Optional webhook token hardening:

```bash
npx supabase secrets set --project-ref rmooksnngqyzqraeicvr GOOGLE_WEBHOOK_TOKEN="YOUR_RANDOM_TOKEN"
```

Optional explicit callback URL (if different from your Supabase function URL):

```bash
npx supabase secrets set --project-ref rmooksnngqyzqraeicvr GOOGLE_WEBHOOK_CALLBACK_URL="https://rmooksnngqyzqraeicvr.supabase.co/functions/v1/calendar-webhook-handler"
```

### How sync works now

- Outbound: when confirmed booking details are saved/confirmed in admin, the app calls `sync-booking-to-calendar` and writes `calendar_event_id` + sync status.
- Inbound: `calendar-webhook-handler` pulls changed event times for mapped bookings and updates `confirmed_date`, `confirmed_time`, and duration in `appointments`.
- Watch automation: `ensure-calendar-watch-channel` keeps Google push notifications active by renewing channel subscriptions before expiry.

### Activate automatic inbound sync (no manual button required)

1. In admin Bookings, click `🔔 Ensure Watch` once (or call function manually).
2. Schedule `ensure-calendar-watch-channel` to run daily (or every 6-12 hours).
3. Google will notify `calendar-webhook-handler` when events change; admin updates flow in automatically.

To run inbound sync manually during testing, POST to:

`https://rmooksnngqyzqraeicvr.supabase.co/functions/v1/calendar-webhook-handler`
