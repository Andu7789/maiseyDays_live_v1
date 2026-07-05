-- appointments.booking_status previously defaulted to 'confirmed', which meant
-- any insert that didn't explicitly set it (e.g. a customer's new web booking
-- request) silently became "confirmed" even though nobody had confirmed it.
-- New bookings should default to pending; existing rows are left untouched.
ALTER TABLE appointments ALTER COLUMN booking_status SET DEFAULT 'pending';
