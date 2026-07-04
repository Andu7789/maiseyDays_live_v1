-- Matting Release consent tracking on customer records.
-- Run this in the Supabase SQL editor.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS matting_required boolean NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS matting_signed_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS matting_signed_via text; -- 'digital' | 'paper'
ALTER TABLE customers ADD COLUMN IF NOT EXISTS matting_signature text;
