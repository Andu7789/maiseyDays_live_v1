-- Historically, creating a booking (web or manual) never created a matching
-- row in the `customers` table — only "+ Add Customer" or the intake flow
-- did. That meant a booking could exist with no customer profile, so the
-- contact never showed up when searching the Customer Database. New
-- bookings are now auto-linked in code; this backfills customer records for
-- existing bookings that were missed.
--
-- Note: the email uniqueness rule (customers_email_unique) applies even to
-- soft-deleted customers, so this checks for ANY existing match (deleted or
-- not) before inserting — otherwise a booking whose email belongs to an
-- already-deleted customer (e.g. re-added test data) would collide with it.

INSERT INTO customers (ownername, email, phone, source)
SELECT DISTINCT ON (lower(a.email))
  a.ownername, a.email, a.phone, 'manual'
FROM appointments a
WHERE a.email IS NOT NULL AND a.email <> ''
  AND NOT EXISTS (
    SELECT 1 FROM customers c WHERE lower(c.email) = lower(a.email)
  )
ORDER BY lower(a.email), a.id
ON CONFLICT ((lower(email))) DO NOTHING;

-- Link any appointment still missing customer_id to the matching customer by email.
UPDATE appointments a
SET customer_id = c.id
FROM customers c
WHERE a.customer_id IS NULL
  AND a.email IS NOT NULL AND a.email <> ''
  AND lower(c.email) = lower(a.email);
