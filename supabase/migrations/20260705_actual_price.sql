-- Lets the groomer record what was actually charged for a booking (matting,
-- multi-dog, breed surcharges etc. all mean the real price often differs from
-- the advertised "From £X" service price). NULL means "not recorded yet" —
-- revenue reporting falls back to an estimate until this is filled in.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS actual_price numeric;
