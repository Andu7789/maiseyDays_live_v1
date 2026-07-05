-- A booking covering multiple dogs stores them as one joined string in
-- appointments.dogname (e.g. "Bailey & Max"). The auto-link trigger was
-- inserting that whole joined string as a single dog record, which then
-- shows up as one bogus "dog" worth only one £20 deposit when rebooking.
-- Split on " & " so each dog gets its own proper record.
CREATE OR REPLACE FUNCTION link_appointment_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
  dog_name text;
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
    UPDATE customers SET
      phone = COALESCE(NULLIF(customers.phone, ''), NEW.phone),
      ownername = CASE WHEN customers.ownername = '' THEN COALESCE(NEW.ownername, '') ELSE customers.ownername END,
      updated_at = now()
    WHERE id = cid;
  END IF;

  NEW.customer_id := cid;

  IF NEW.dogname IS NOT NULL AND NEW.dogname <> '' THEN
    FOR dog_name IN SELECT trim(unnest(string_to_array(NEW.dogname, ' & '))) LOOP
      IF dog_name <> '' THEN
        INSERT INTO dogs (customer_id, name, breed)
        VALUES (cid, dog_name, NEW.dogbreed)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
