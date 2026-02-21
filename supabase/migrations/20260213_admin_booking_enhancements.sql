-- Admin booking enhancements
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS requested_time_preference TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_date DATE,
  ADD COLUMN IF NOT EXISTS confirmed_time TIME,
  ADD COLUMN IF NOT EXISTS confirmed_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT 'web';

ALTER TABLE appointments
  ALTER COLUMN booking_source SET DEFAULT 'web';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_booking_source_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_booking_source_check CHECK (booking_source IN ('web', 'manual'));
  END IF;
END$$;

UPDATE appointments
SET
  requested_time_preference = COALESCE(requested_time_preference, time),
  is_confirmed = CASE WHEN status = 'confirmed' THEN TRUE ELSE COALESCE(is_confirmed, FALSE) END,
  confirmed_date = CASE
    WHEN status = 'confirmed' AND confirmed_date IS NULL AND date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN date::text::date
    ELSE confirmed_date
  END,
  confirmed_time = CASE
    WHEN status = 'confirmed' AND confirmed_time IS NULL AND time ~ '^[0-9]{2}:[0-9]{2}$' THEN time::time
    ELSE confirmed_time
  END
WHERE requested_time_preference IS NULL OR is_confirmed IS DISTINCT FROM (status = 'confirmed') OR (status = 'confirmed' AND confirmed_date IS NULL);

CREATE INDEX IF NOT EXISTS idx_appointments_confirmed_date ON appointments (confirmed_date);
CREATE INDEX IF NOT EXISTS idx_appointments_is_confirmed ON appointments (is_confirmed);
CREATE INDEX IF NOT EXISTS idx_appointments_booking_source ON appointments (booking_source);

CREATE TABLE IF NOT EXISTS admin_notification_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  reminder_email TEXT NOT NULL,
  reminder_phone TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_notification_settings_single_row CHECK (id = 1)
);

INSERT INTO admin_notification_settings (id, reminder_email, reminder_phone)
VALUES (1, 'andrew.britain@gmail.com', '+447875200849')
ON CONFLICT (id)
DO UPDATE SET
  reminder_email = EXCLUDED.reminder_email,
  reminder_phone = EXCLUDED.reminder_phone,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS admin_notification_log (
  id BIGSERIAL PRIMARY KEY,
  notification_type TEXT NOT NULL,
  destination TEXT NOT NULL,
  payload JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL DEFAULT TRUE
);
