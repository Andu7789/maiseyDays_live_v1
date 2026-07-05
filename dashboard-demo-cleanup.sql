-- ============================================================
-- DASHBOARD DEMO DATA CLEANUP
-- ============================================================
-- Removes everything created by dashboard-demo-data.sql. Safe to run any
-- time — it only ever matches the dashdemo1..12@example.com test emails.
-- Deletes dogs and appointments first, then the customer records themselves.

DELETE FROM dogs
WHERE customer_id IN (SELECT id FROM customers WHERE email LIKE 'dashdemo%@example.com');

DELETE FROM appointments
WHERE email LIKE 'dashdemo%@example.com';

DELETE FROM customers
WHERE email LIKE 'dashdemo%@example.com';

-- Done. Refresh the admin Dashboard tab — all demo data will be gone.
