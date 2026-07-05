-- Soft delete for customers: keep the row (and their booking history) but hide
-- it from the normal customer list. Reversible via a Restore action in admin.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS customers_deleted_at_idx ON customers (deleted_at);
