-- Oral care chart: one row per tooth finding, per dog, per date.
-- Keyed on owner email + dog name (same as dog_notes) so it follows the dog across every booking.
-- md_ prefix because this Supabase project is shared with other apps.

CREATE TABLE IF NOT EXISTS md_dog_oral_care (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  dog_name text NOT NULL,
  tooth text NOT NULL,            -- e.g. 'A1' to 'A12'
  condition text NOT NULL,        -- e.g. 'Missing', 'Tartar (mild)'
  note text,
  recorded_on date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_md_dog_oral_care_dog ON md_dog_oral_care (lower(owner_email), lower(dog_name));

-- Health records: signed-in users only, never the public anon key.
ALTER TABLE md_dog_oral_care ENABLE ROW LEVEL SECURITY;

CREATE POLICY "md oral care read" ON md_dog_oral_care FOR SELECT TO authenticated USING (true);
CREATE POLICY "md oral care insert" ON md_dog_oral_care FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "md oral care update" ON md_dog_oral_care FOR UPDATE TO authenticated USING (true);
CREATE POLICY "md oral care delete" ON md_dog_oral_care FOR DELETE TO authenticated USING (true);
