-- Estimated price is now a manually editable field on each booking, rather
-- than always being derived from the selected service's list price.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS estimated_price numeric;
