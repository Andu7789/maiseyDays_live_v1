-- Removes just the 2 overdue-response demo bookings (dashdemo13/14@example.com),
-- without touching any other dashdemo* rows that might still be around.
DELETE FROM dogs
WHERE customer_id IN (SELECT id FROM customers WHERE email IN ('dashdemo13@example.com', 'dashdemo14@example.com'));

DELETE FROM appointments
WHERE email IN ('dashdemo13@example.com', 'dashdemo14@example.com');

DELETE FROM customers
WHERE email IN ('dashdemo13@example.com', 'dashdemo14@example.com');
