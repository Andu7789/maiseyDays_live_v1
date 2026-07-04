-- Customer intake system: real customer records + dogs + digital grooming agreement.
-- Run this in the Supabase SQL editor (or via supabase db push).

-- ============================================================
-- 1. CUSTOMERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ownername text NOT NULL DEFAULT '',
  email text,
  phone text,
  address text,
  hear_about_us text,
  sms_ok boolean,
  alt_contact_name text,
  alt_contact_phone text,
  vet_name text,
  emergency_vet_name text,
  emergency_vet_phone text,
  emergency_vet_address text,
  treats_ok boolean,
  photo_consent boolean,
  -- Intake form tracking
  intake_token text UNIQUE,
  intake_status text NOT NULL DEFAULT 'not_sent' CHECK (intake_status IN ('not_sent', 'sent', 'completed')),
  intake_sent_at timestamptz,
  intake_sent_via text,
  intake_completed_at timestamptz,
  -- Digital signature
  signature_data text,
  signed_at timestamptz,
  terms_version text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One customer per email address (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique
  ON customers (lower(email))
  WHERE email IS NOT NULL AND email <> '';

-- ============================================================
-- 2. DOGS TABLE (multiple dogs per customer)
-- ============================================================
CREATE TABLE IF NOT EXISTS dogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  breed text,
  dob text,
  sex text CHECK (sex IN ('male', 'female') OR sex IS NULL),
  neutered boolean,
  vaccinated boolean,
  behaviour_notes text,
  health_conditions text,
  needs_prescribed_shampoo boolean,
  medication_details text,
  needs_muzzle boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dogs_customer_name_unique
  ON dogs (customer_id, lower(name));

-- ============================================================
-- 3. LINK APPOINTMENTS TO CUSTOMERS
-- ============================================================
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS appointments_customer_id_idx ON appointments (customer_id);

-- ============================================================
-- 4. ROW LEVEL SECURITY (same permissive pattern as the rest of the project)
-- ============================================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read customers"   ON customers FOR SELECT USING (true);
CREATE POLICY "Allow insert customers" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update customers" ON customers FOR UPDATE USING (true);
CREATE POLICY "Allow delete customers" ON customers FOR DELETE USING (true);

ALTER TABLE dogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read dogs"   ON dogs FOR SELECT USING (true);
CREATE POLICY "Allow insert dogs" ON dogs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update dogs" ON dogs FOR UPDATE USING (true);
CREATE POLICY "Allow delete dogs" ON dogs FOR DELETE USING (true);

-- ============================================================
-- 5. BACKFILL customers + dogs from existing appointments
-- ============================================================
INSERT INTO customers (ownername, email, phone, source)
SELECT DISTINCT ON (lower(email))
  COALESCE(ownername, ''), email, phone, 'backfill'
FROM appointments
WHERE email IS NOT NULL AND email <> ''
ORDER BY lower(email), confirmed_at DESC NULLS LAST
ON CONFLICT DO NOTHING;

UPDATE appointments a
SET customer_id = c.id
FROM customers c
WHERE a.customer_id IS NULL
  AND a.email IS NOT NULL
  AND lower(a.email) = lower(c.email);

INSERT INTO dogs (customer_id, name, breed)
SELECT DISTINCT ON (a.customer_id, lower(a.dogname))
  a.customer_id, a.dogname, a.dogbreed
FROM appointments a
WHERE a.customer_id IS NOT NULL AND a.dogname IS NOT NULL AND a.dogname <> ''
ORDER BY a.customer_id, lower(a.dogname), a.confirmed_at DESC NULLS LAST
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. AUTO-LINK TRIGGER: every new appointment (web booking or manual)
--    creates/updates the matching customer record and dog entry.
--    Never blocks the booking if anything goes wrong.
-- ============================================================
CREATE OR REPLACE FUNCTION link_appointment_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO cid FROM customers WHERE lower(email) = lower(NEW.email) LIMIT 1;

  IF cid IS NULL THEN
    INSERT INTO customers (ownername, email, phone, source)
    VALUES (COALESCE(NEW.ownername, ''), NEW.email, NEW.phone, 'web')
    RETURNING id INTO cid;
  ELSE
    -- Fill in phone/name if we didn't have them before
    UPDATE customers SET
      phone = COALESCE(NULLIF(customers.phone, ''), NEW.phone),
      ownername = CASE WHEN customers.ownername = '' THEN COALESCE(NEW.ownername, '') ELSE customers.ownername END,
      updated_at = now()
    WHERE id = cid;
  END IF;

  NEW.customer_id := cid;

  IF NEW.dogname IS NOT NULL AND NEW.dogname <> '' THEN
    INSERT INTO dogs (customer_id, name, breed)
    VALUES (cid, NEW.dogname, NEW.dogbreed)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_appointment_customer ON appointments;
CREATE TRIGGER trg_link_appointment_customer
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION link_appointment_customer();
