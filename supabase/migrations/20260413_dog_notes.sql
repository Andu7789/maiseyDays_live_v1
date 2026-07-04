-- Dog notes table
-- Stores persistent groomer notes per dog, keyed on owner email + dog name.
-- Notes persist across all appointments (e.g. temperament, allergies, coat info).

CREATE TABLE IF NOT EXISTS dog_notes (
  id           bigserial PRIMARY KEY,
  owner_email  text NOT NULL,
  dog_name     text NOT NULL,
  notes        text NOT NULL DEFAULT '',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_email, dog_name)
);

ALTER TABLE dog_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON dog_notes
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert" ON dog_notes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON dog_notes
  FOR UPDATE USING (true);
