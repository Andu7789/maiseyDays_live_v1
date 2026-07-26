-- ============================================================
-- OVERDUE-RESPONSE DEMO DATA — for showing off the new 24h warning
-- ============================================================
-- Same tagging convention as dashboard-demo-data.sql (DEMO - owner names,
-- dashdemoN@example.com emails, 07700 900xxx OFCOM test phone range), so
-- dashboard-demo-cleanup.sql (LIKE 'dashdemo%@example.com') removes these too.
--
-- Two "pending" web requests, backdated via created_at to 30 and 50 hours
-- ago, so they immediately show up as overdue (>24h, no response yet).

INSERT INTO appointments (ownername, email, phone, dogname, dogbreed, serviceid, locationid, date, time, notes, status, booking_status, requested_time_preference, number_of_dogs, deposit_paid, deposit_amount, booking_source, created_at)
VALUES
  ('DEMO - Overdue Owner 1', 'dashdemo13@example.com', '07700900113', 'Demo Winston', 'Beagle',    'full-groom', 'caister',   (CURRENT_DATE + 4), '10:00', 'Sent via website, needs a reply', 'pending', 'pending', '10:00', 1, false, 20, 'web', now() - interval '30 hours'),
  ('DEMO - Overdue Owner 2', 'dashdemo14@example.com', '07700900114', 'Demo Pixel',   'Cockapoo', 'bath-brush', 'winterton', (CURRENT_DATE + 5), '14:00', 'Sent via website, needs a reply', 'pending', 'pending', '14:00', 1, false, 20, 'web', now() - interval '50 hours')
;

-- Done. Refresh the admin Dashboard/Bookings/Diary tabs to see the overdue warning.
