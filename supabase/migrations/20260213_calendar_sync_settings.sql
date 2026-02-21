-- Calendar sync configuration (test vs live)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS calendar_event_id TEXT,
  ADD COLUMN IF NOT EXISTS calendar_sync_status TEXT NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS calendar_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calendar_last_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_calendar_sync_status_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_calendar_sync_status_check CHECK (calendar_sync_status IN ('not_synced', 'synced', 'error'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_appointments_calendar_event_id ON appointments (calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_appointments_calendar_sync_status ON appointments (calendar_sync_status);

CREATE TABLE IF NOT EXISTS calendar_sync_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'test',
  test_calendar_id TEXT NOT NULL,
  live_calendar_id TEXT NOT NULL,
  test_owner_email TEXT,
  live_owner_email TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/London',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_sync_settings_single_row CHECK (id = 1),
  CONSTRAINT calendar_sync_settings_mode_check CHECK (mode IN ('test', 'live'))
);

INSERT INTO calendar_sync_settings (
  id,
  mode,
  test_calendar_id,
  live_calendar_id,
  test_owner_email,
  live_owner_email,
  timezone
)
VALUES (
  1,
  'test',
  'primary',
  'REPLACE_WITH_BUSINESS_CALENDAR_ID',
  'andrew.britain@gmail.com',
  'REPLACE_WITH_BUSINESS_OWNER_EMAIL',
  'Europe/London'
)
ON CONFLICT (id)
DO UPDATE SET
  test_calendar_id = COALESCE(NULLIF(EXCLUDED.test_calendar_id, ''), calendar_sync_settings.test_calendar_id),
  live_calendar_id = COALESCE(NULLIF(EXCLUDED.live_calendar_id, ''), calendar_sync_settings.live_calendar_id),
  test_owner_email = COALESCE(NULLIF(EXCLUDED.test_owner_email, ''), calendar_sync_settings.test_owner_email),
  live_owner_email = COALESCE(NULLIF(EXCLUDED.live_owner_email, ''), calendar_sync_settings.live_owner_email),
  timezone = COALESCE(NULLIF(EXCLUDED.timezone, ''), calendar_sync_settings.timezone),
  updated_at = NOW();
