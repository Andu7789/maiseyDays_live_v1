-- Repeat Booking Management System
-- Adds columns and tables for managing booking lifecycle and reminders

-- 1. Add new columns to appointments table
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS booking_status TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_28day_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_booking_id UUID REFERENCES appointments(id),
  ADD COLUMN IF NOT EXISTS is_repeat_booking BOOLEAN DEFAULT false;

-- Add constraint for booking_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_booking_status_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_booking_status_check
      CHECK (booking_status IN ('pending', 'confirmed', 'completed', 'due_for_rebook', 'cancelled'));
  END IF;
END$$;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_appointments_booking_status ON appointments(booking_status);
CREATE INDEX IF NOT EXISTS idx_appointments_completed_at ON appointments(completed_at);
CREATE INDEX IF NOT EXISTS idx_appointments_parent_booking ON appointments(parent_booking_id);

-- 2. Create booking_reminders log table
CREATE TABLE IF NOT EXISTS booking_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- '28_day_reminder' or 'next_day_summary'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_to TEXT NOT NULL, -- email address
  email_status TEXT DEFAULT 'sent', -- 'sent', 'failed', 'bounced'
  email_subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_reminders_appointment_id ON booking_reminders(appointment_id);
CREATE INDEX IF NOT EXISTS idx_booking_reminders_sent_at ON booking_reminders(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_reminders_type ON booking_reminders(reminder_type);

-- Disable RLS for booking_reminders (admin-only access via edge functions)
ALTER TABLE booking_reminders DISABLE ROW LEVEL SECURITY;

-- 3. Create reminder settings table
CREATE TABLE IF NOT EXISTS reminder_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled_28day BOOLEAN DEFAULT true,
  days_interval INTEGER DEFAULT 28,
  reminder_email TEXT NOT NULL DEFAULT 'andrew.britain@gmail.com',
  enabled_next_day BOOLEAN DEFAULT true,
  next_day_time TIME DEFAULT '17:00:00',
  split_by_location BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reminder_settings_single_row CHECK (id = 1)
);

-- Insert default settings
INSERT INTO reminder_settings (
  id,
  enabled_28day,
  days_interval,
  reminder_email,
  enabled_next_day,
  next_day_time,
  split_by_location
)
VALUES (
  1,
  true,
  28,
  'andrew.britain@gmail.com',
  true,
  '17:00:00',
  true
)
ON CONFLICT (id)
DO UPDATE SET
  enabled_28day = COALESCE(EXCLUDED.enabled_28day, reminder_settings.enabled_28day),
  days_interval = COALESCE(EXCLUDED.days_interval, reminder_settings.days_interval),
  reminder_email = COALESCE(EXCLUDED.reminder_email, reminder_settings.reminder_email),
  enabled_next_day = COALESCE(EXCLUDED.enabled_next_day, reminder_settings.enabled_next_day),
  next_day_time = COALESCE(EXCLUDED.next_day_time, reminder_settings.next_day_time),
  split_by_location = COALESCE(EXCLUDED.split_by_location, reminder_settings.split_by_location),
  updated_at = NOW();

-- Disable RLS for reminder_settings (needs to be readable by edge functions)
ALTER TABLE reminder_settings DISABLE ROW LEVEL SECURITY;

-- 4. Update existing confirmed bookings to have proper status
UPDATE appointments
SET booking_status = 'confirmed'
WHERE booking_status IS NULL OR booking_status = '';

-- 5. Mark past bookings as completed (older than 1 day and confirmed)
UPDATE appointments
SET
  booking_status = 'completed',
  completed_at = confirmed_date::date + confirmed_time::time
WHERE
  booking_status = 'confirmed'
  AND confirmed_date IS NOT NULL
  AND confirmed_date < CURRENT_DATE - INTERVAL '1 day';
