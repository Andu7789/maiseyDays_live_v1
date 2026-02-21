# Repeat Booking Management System - Implementation Plan

## Database Changes

### 1. Add new columns to `appointments` table

```sql
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS booking_status TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS six_week_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_booking_id UUID REFERENCES appointments(id),
  ADD COLUMN IF NOT EXISTS is_repeat_booking BOOLEAN DEFAULT false;

-- Add constraint for booking_status
ALTER TABLE appointments
  ADD CONSTRAINT appointments_booking_status_check
  CHECK (booking_status IN ('pending', 'confirmed', 'completed', 'due_for_rebook', 'cancelled'));

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_appointments_booking_status ON appointments(booking_status);
CREATE INDEX IF NOT EXISTS idx_appointments_completed_at ON appointments(completed_at);
```

### 2. Create `booking_reminders` log table

```sql
CREATE TABLE IF NOT EXISTS booking_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- '6_week_reminder' or 'next_day_summary'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_to TEXT, -- email address
  email_status TEXT, -- 'sent', 'failed', 'bounced'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_reminders_appointment_id ON booking_reminders(appointment_id);
CREATE INDEX IF NOT EXISTS idx_booking_reminders_sent_at ON booking_reminders(sent_at DESC);
```

---

## Edge Functions to Create

### 1. `send-six-week-reminders` (Daily cron at 9am)

**Purpose**: Check for completed bookings that are 6 weeks old and send reminder to salon owner

**Logic**:
- Find all appointments where:
  - `booking_status = 'completed'`
  - `completed_at` is 6 weeks ago (42 days)
  - `six_week_reminder_sent_at` is NULL
- For each match:
  - Send email to salon owner with customer details
  - Update `booking_status = 'due_for_rebook'`
  - Set `six_week_reminder_sent_at = NOW()`
  - Log to `booking_reminders` table

**Email Template**:
```
Subject: 🐾 Time to Rebook: [Dog Name]

Hi [Salon Owner],

It's been 6 weeks since [Dog Name]'s last groom on [Date].

Customer Details:
- Owner: [Owner Name]
- Phone: [Phone]
- Email: [Email]
- Last Service: [Service Name]
- Location: [Location]
- Special Notes: [Notes]

Action: Contact the owner to schedule their next grooming appointment!

View in Admin: [Link to booking]
```

---

### 2. `send-next-day-summary` (Daily cron at 6pm)

**Purpose**: Send tomorrow's grooming schedule to salon owner

**Logic**:
- Find all appointments where:
  - `confirmed_date = tomorrow's date`
  - `booking_status = 'confirmed'`
- Group by location
- Send email with formatted list

**Email Template**:
```
Subject: 📅 Tomorrow's Grooming Schedule - [Date]

Hi [Salon Owner],

Here are your grooming appointments for tomorrow:

CAISTER BRANCH:
- 9:00 AM - Buddy (Golden Retriever) - Full Groom
  Owner: John Smith | Phone: 07xxx | Notes: Nervous around clippers

- 11:00 AM - Max (Poodle) - Bath & Brush
  Owner: Jane Doe | Phone: 07yyy | Notes: None

WINTERTON BRANCH:
- 10:00 AM - Luna (Cockapoo) - Puppy Intro
  Owner: Mike Brown | Phone: 07zzz | Notes: First visit!

Total Appointments: 3
Estimated Revenue: £95

Prep Notes:
- Check supplies for [services needed]
- Review special notes for nervous dogs

View Full Schedule: [Link to admin panel]
```

---

## Admin Dashboard Changes

### 1. Row Color Coding

```tsx
const getRowColor = (appointment: Appointment) => {
  if (appointment.booking_status === 'confirmed') {
    return 'bg-green-50 border-green-200'; // Green
  }
  if (appointment.booking_status === 'due_for_rebook') {
    return 'bg-blue-50 border-blue-200'; // Blue
  }
  if (appointment.booking_status === 'completed') {
    return 'bg-yellow-50 border-yellow-200'; // Yellow
  }
  if (appointment.booking_status === 'cancelled') {
    return 'bg-gray-50 border-gray-200'; // Grey
  }
  return 'bg-white';
};
```

### 2. Add "Mark as Completed" Button

- Shows for confirmed bookings where `confirmed_date` is in the past
- When clicked:
  - Sets `booking_status = 'completed'`
  - Sets `completed_at = NOW()`
  - Keeps row visible but changes to yellow

### 3. Add "Rebook" Button for Blue Rows

- Shows for `due_for_rebook` status
- Opens booking modal pre-filled with customer details
- Creates new booking with:
  - Same customer info
  - `is_repeat_booking = true`
  - `parent_booking_id = [previous booking ID]`
  - Suggested date = 6 weeks from last completion

### 4. Add Booking History View

- Shows all bookings for a customer
- Groups by dog name
- Displays timeline of visits

---

## Settings Configuration

### Add to Admin Panel Settings

```tsx
<div className="settings-section">
  <h3>Reminder Settings</h3>

  <label>
    <input type="checkbox" checked />
    Enable 6-week rebooking reminders
  </label>

  <label>
    <input type="number" value="42" /> days after completion
  </label>

  <label>
    Reminder email:
    <input type="email" value="owner@maiseydays.com" />
  </label>

  <label>
    <input type="checkbox" checked />
    Send next-day summary
  </label>

  <label>
    Summary time:
    <select><option>6:00 PM</option></select>
  </label>
</div>
```

---

## GitHub Actions Workflows

### `send-six-week-reminders.yml`

```yaml
name: Send 6-Week Rebooking Reminders
on:
  schedule:
    - cron: '0 9 * * *'  # 9am daily
  workflow_dispatch:

jobs:
  send-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger 6-week reminders
        run: |
          curl -X POST \
            https://rmooksnngqyzqraeicvr.supabase.co/functions/v1/send-six-week-reminders \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

### `send-next-day-summary.yml`

```yaml
name: Send Next Day Summary
on:
  schedule:
    - cron: '0 18 * * *'  # 6pm daily
  workflow_dispatch:

jobs:
  send-summary:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger next-day summary
        run: |
          curl -X POST \
            https://rmooksnngqyzqraeicvr.supabase.co/functions/v1/send-next-day-summary \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

---

## Testing Plan

1. **Test 6-week reminder**:
   - Create a test booking with `completed_at = NOW() - INTERVAL '42 days'`
   - Manually trigger edge function
   - Verify email received
   - Check row turns blue

2. **Test next-day summary**:
   - Create test bookings for tomorrow
   - Manually trigger edge function
   - Verify email format
   - Check all appointments included

3. **Test rebook workflow**:
   - Click "Rebook" on blue row
   - Verify pre-filled data
   - Complete rebooking
   - Check new booking is green
   - Verify parent_booking_id link

---

## Phase 1 (Essential - Week 1)
- [ ] Add database columns
- [ ] Create `send-six-week-reminders` edge function
- [ ] Add row color coding to admin
- [ ] Add "Mark as Completed" button
- [ ] Deploy and test

## Phase 2 (Important - Week 2)
- [ ] Create `send-next-day-summary` edge function
- [ ] Add "Rebook" button functionality
- [ ] Add booking history view
- [ ] Set up GitHub Actions cron jobs

## Phase 3 (Nice to Have - Week 3)
- [ ] Add settings page for reminder config
- [ ] Add SMS reminders (optional)
- [ ] Add customer-facing rebooking link
- [ ] Analytics dashboard for repeat bookings

---

## Cost Estimate

- **GitHub Actions**: Free (within limits)
- **Supabase Edge Functions**: Free (within limits)
- **Email Sending**:
  - Option 1: Formspree Free (50 emails/month) - Upgrade to $10/month for unlimited
  - Option 2: SendGrid Free (100 emails/day)
  - Option 3: AWS SES ($0.10 per 1000 emails)

**Recommended**: SendGrid free tier (100/day is plenty for this use case)

---

## Questions to Confirm

1. **Email address**: Where should 6-week reminders be sent? (salon owner email)
2. **Timing**: 6 weeks is 42 days - is this correct or do you want a different interval?
3. **Next-day summary time**: 6pm good or prefer different time?
4. **Locations**: Should reminders be location-specific or combined?
5. **SMS**: Want SMS reminders too or just email?
