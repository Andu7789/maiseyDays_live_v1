-- Holiday settings table
-- Stores a single row (id=1) with the holiday start/end dates.
-- When both are NULL, holiday mode is off.

CREATE TABLE IF NOT EXISTS holiday_settings (
  id            int PRIMARY KEY DEFAULT 1,
  holiday_start date NULL,
  holiday_end   date NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Seed the single row (update if already exists)
INSERT INTO holiday_settings (id, holiday_start, holiday_end)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Allow the anon/service role to read and update (same pattern as reminder_settings)
ALTER TABLE holiday_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON holiday_settings
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated update" ON holiday_settings
  FOR UPDATE USING (true);
