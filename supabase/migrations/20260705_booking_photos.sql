-- Photos attached to a booking (before/after grooming shots etc.).
-- Multiple photos per booking are supported; the actual image bytes live in
-- the existing "booking-photos" storage bucket, this table just tracks the
-- storage path + a bit of metadata (a fresh signed URL is generated on view,
-- so photos never go dead from an expired link).
CREATE TABLE IF NOT EXISTS booking_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  photo_type text NOT NULL DEFAULT 'other' CHECK (photo_type IN ('before', 'after', 'other')),
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_photos_appointment_id_idx ON booking_photos (appointment_id);

ALTER TABLE booking_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read booking_photos"   ON booking_photos FOR SELECT USING (true);
CREATE POLICY "Allow insert booking_photos" ON booking_photos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update booking_photos" ON booking_photos FOR UPDATE USING (true);
CREATE POLICY "Allow delete booking_photos" ON booking_photos FOR DELETE USING (true);
