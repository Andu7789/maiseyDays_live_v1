-- Winterton branch closed; the salon moved to Hemsby. Re-point existing rows
-- so old and upcoming bookings still resolve to a known location.
UPDATE appointments SET locationid = 'hemsby' WHERE locationid = 'winterton';
UPDATE availabilities SET locationid = 'hemsby' WHERE locationid = 'winterton';
