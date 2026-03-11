-- Add deposit tracking fields to appointments table
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10, 2) DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_notes TEXT;

-- Add index for quick filtering of unpaid deposits
CREATE INDEX IF NOT EXISTS idx_appointments_deposit_paid ON appointments(deposit_paid);

-- Add comment for documentation
COMMENT ON COLUMN appointments.deposit_paid IS 'Whether the £20 deposit has been paid';
COMMENT ON COLUMN appointments.deposit_amount IS 'Deposit amount (default £20)';
COMMENT ON COLUMN appointments.deposit_paid_at IS 'Timestamp when deposit was marked as paid';
COMMENT ON COLUMN appointments.deposit_notes IS 'Notes about deposit payment method or status';
