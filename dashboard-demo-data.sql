-- ============================================================
-- DASHBOARD DEMO DATA — for showing off the new Owner Dashboard
-- ============================================================
-- Safe to run: every row is clearly tagged so it's easy to spot and remove.
--   - Owner names all start with "DEMO - "
--   - Emails are all dashdemo1@example.com .. dashdemo12@example.com
--   - Phones use 07700 900xxx — the UK's official OFCOM-reserved range for
--     fictional/test use, so nothing can ever be accidentally texted.
--
-- What it creates (via the existing auto-link trigger, so customers + dogs
-- are created automatically from these appointments, just like real bookings):
--   - ~20 completed grooms spread over the last 8 weeks, across both services
--     and both locations, some WITH an actual price recorded and some
--     WITHOUT (to show the "Record Missing Prices" panel)
--   - 4 pending requests awaiting confirmation
--   - 3 confirmed bookings with deposit not yet paid
--   - 2 confirmed bookings with deposit paid
--   - 2 bookings scheduled for today
--   - 2 customers due for a rebook
--   - 1 cancelled booking
--   - 2 customers flagged as needing the matting release form
--   - 1 multi-dog booking ("Demo Bailey & Demo Max")
--
-- Run dashboard-demo-cleanup.sql afterwards to remove all of it in one go.

-- ---------- Completed grooms: last 8 weeks (revenue trend + top services) ----------
INSERT INTO appointments (ownername, email, phone, dogname, dogbreed, serviceid, locationid, date, time, notes, status, booking_status, confirmed_date, confirmed_time, confirmed_duration_minutes, completed_at, number_of_dogs, deposit_paid, deposit_amount, actual_price, booking_source)
VALUES
  ('DEMO - Sarah Jones',    'dashdemo1@example.com',  '07700900101', 'Demo Rex',     'Labrador',       'full-groom',    'caister',   (CURRENT_DATE - 1), '10:00', '', 'confirmed', 'completed', (CURRENT_DATE - 1), '10:00', 120, (CURRENT_DATE - 1)::timestamptz + interval '12 hours', 1, true, 20, 42, 'manual'),
  ('DEMO - Tom Baker',      'dashdemo2@example.com',  '07700900102', 'Demo Bella',   'Cockapoo',       'bath-brush',    'winterton', (CURRENT_DATE - 3), '14:00', '', 'confirmed', 'completed', (CURRENT_DATE - 3), '14:00', 120, (CURRENT_DATE - 3)::timestamptz + interval '16 hours', 1, true, 20, NULL, 'manual'),
  ('DEMO - Priya Patel',    'dashdemo3@example.com',  '07700900103', 'Demo Max',     'Cocker Spaniel', 'full-groom',    'caister',   (CURRENT_DATE - 5), '12:00', '', 'confirmed', 'completed', (CURRENT_DATE - 5), '12:00', 120, (CURRENT_DATE - 5)::timestamptz + interval '14 hours', 1, true, 20, 38, 'manual'),
  ('DEMO - Liam O''Connor', 'dashdemo4@example.com',  '07700900104', 'Demo Poppy',   'Poodle',         'home-grooming', 'winterton', (CURRENT_DATE - 8), '10:00', '', 'confirmed', 'completed', (CURRENT_DATE - 8), '10:00', 120, (CURRENT_DATE - 8)::timestamptz + interval '12 hours', 1, true, 20, 50, 'manual'),
  ('DEMO - Grace Kelly',    'dashdemo5@example.com',  '07700900105', 'Demo Milo',    'Beagle',         'nail-clipping', 'caister',   (CURRENT_DATE - 9), '16:00', '', 'confirmed', 'completed', (CURRENT_DATE - 9), '16:00', 120, (CURRENT_DATE - 9)::timestamptz + interval '18 hours', 1, true, 20, NULL, 'manual'),
  ('DEMO - Sarah Jones',    'dashdemo1@example.com',  '07700900101', 'Demo Rex',     'Labrador',       'full-groom',    'caister',   (CURRENT_DATE - 14), '10:00', '', 'confirmed', 'completed', (CURRENT_DATE - 14), '10:00', 120, (CURRENT_DATE - 14)::timestamptz + interval '12 hours', 1, true, 20, 35, 'manual'),
  ('DEMO - Nadia Hussain',  'dashdemo6@example.com',  '07700900106', 'Demo Luna',    'Shih Tzu',       'bath-brush',    'winterton', (CURRENT_DATE - 16), '12:00', '', 'confirmed', 'completed', (CURRENT_DATE - 16), '12:00', 120, (CURRENT_DATE - 16)::timestamptz + interval '14 hours', 1, true, 20, 25, 'manual'),
  ('DEMO - Tom Baker',      'dashdemo2@example.com',  '07700900102', 'Demo Bella',   'Cockapoo',       'full-groom',    'winterton', (CURRENT_DATE - 18), '14:00', '', 'confirmed', 'completed', (CURRENT_DATE - 18), '14:00', 120, (CURRENT_DATE - 18)::timestamptz + interval '16 hours', 1, true, 20, NULL, 'manual'),
  ('DEMO - Ellie Brooks',   'dashdemo7@example.com',  '07700900107', 'Demo Charlie', 'Border Collie',  'home-grooming', 'caister',   (CURRENT_DATE - 21), '10:00', '', 'confirmed', 'completed', (CURRENT_DATE - 21), '10:00', 120, (CURRENT_DATE - 21)::timestamptz + interval '12 hours', 1, true, 20, 48, 'manual'),
  ('DEMO - James Wu',       'dashdemo8@example.com',  '07700900108', 'Demo Daisy',   'Cavapoo',        'puppy-intro',   'winterton', (CURRENT_DATE - 23), '16:00', '', 'confirmed', 'completed', (CURRENT_DATE - 23), '16:00', 120, (CURRENT_DATE - 23)::timestamptz + interval '18 hours', 1, true, 20, 15, 'manual'),
  ('DEMO - Priya Patel',    'dashdemo3@example.com',  '07700900103', 'Demo Max',     'Cocker Spaniel', 'full-groom',    'caister',   (CURRENT_DATE - 28), '12:00', '', 'confirmed', 'completed', (CURRENT_DATE - 28), '12:00', 120, (CURRENT_DATE - 28)::timestamptz + interval '14 hours', 1, true, 20, NULL, 'manual'),
  ('DEMO - Grace Kelly',    'dashdemo5@example.com',  '07700900105', 'Demo Milo',    'Beagle',         'bath-brush',    'caister',   (CURRENT_DATE - 30), '16:00', '', 'confirmed', 'completed', (CURRENT_DATE - 30), '16:00', 120, (CURRENT_DATE - 30)::timestamptz + interval '18 hours', 1, true, 20, 27, 'manual'),
  ('DEMO - Liam O''Connor', 'dashdemo4@example.com',  '07700900104', 'Demo Poppy',   'Poodle',         'home-grooming', 'winterton', (CURRENT_DATE - 33), '10:00', '', 'confirmed', 'completed', (CURRENT_DATE - 33), '10:00', 120, (CURRENT_DATE - 33)::timestamptz + interval '12 hours', 1, true, 20, 45, 'manual'),
  ('DEMO - Nadia Hussain',  'dashdemo6@example.com',  '07700900106', 'Demo Luna',    'Shih Tzu',       'full-groom',    'caister',   (CURRENT_DATE - 37), '12:00', '', 'confirmed', 'completed', (CURRENT_DATE - 37), '12:00', 120, (CURRENT_DATE - 37)::timestamptz + interval '14 hours', 1, true, 20, NULL, 'manual'),
  ('DEMO - Ellie Brooks',   'dashdemo7@example.com',  '07700900107', 'Demo Charlie', 'Border Collie',  'nail-clipping', 'winterton', (CURRENT_DATE - 40), '16:00', '', 'confirmed', 'completed', (CURRENT_DATE - 40), '16:00', 120, (CURRENT_DATE - 40)::timestamptz + interval '18 hours', 1, true, 20, 12, 'manual'),
  ('DEMO - James Wu',       'dashdemo8@example.com',  '07700900108', 'Demo Daisy',   'Cavapoo',        'bath-brush',    'caister',   (CURRENT_DATE - 44), '10:00', '', 'confirmed', 'completed', (CURRENT_DATE - 44), '10:00', 120, (CURRENT_DATE - 44)::timestamptz + interval '12 hours', 1, true, 20, NULL, 'manual'),
  ('DEMO - Sarah Jones',    'dashdemo1@example.com',  '07700900101', 'Demo Rex',     'Labrador',       'full-groom',    'winterton', (CURRENT_DATE - 47), '14:00', '', 'confirmed', 'completed', (CURRENT_DATE - 47), '14:00', 120, (CURRENT_DATE - 47)::timestamptz + interval '16 hours', 1, true, 20, 40, 'manual'),
  ('DEMO - Tom Baker',      'dashdemo2@example.com',  '07700900102', 'Demo Bella',   'Cockapoo',       'home-grooming', 'caister',   (CURRENT_DATE - 51), '10:00', '', 'confirmed', 'completed', (CURRENT_DATE - 51), '10:00', 120, (CURRENT_DATE - 51)::timestamptz + interval '12 hours', 1, true, 20, 50, 'manual'),
  ('DEMO - Priya Patel',    'dashdemo3@example.com',  '07700900103', 'Demo Max',     'Cocker Spaniel', 'bath-brush',    'winterton', (CURRENT_DATE - 54), '16:00', '', 'confirmed', 'completed', (CURRENT_DATE - 54), '16:00', 120, (CURRENT_DATE - 54)::timestamptz + interval '18 hours', 1, true, 20, NULL, 'manual'),
  ('DEMO - Grace Kelly',    'dashdemo5@example.com',  '07700900105', 'Demo Milo',    'Beagle',         'full-groom',    'caister',   (CURRENT_DATE - 55), '12:00', '', 'confirmed', 'completed', (CURRENT_DATE - 55), '12:00', 120, (CURRENT_DATE - 55)::timestamptz + interval '14 hours', 1, true, 20, 36, 'manual'),
  -- Multi-dog booking (shows the dog-splitting trigger fix and £20-per-dog deposit)
  ('DEMO - Ellie Brooks',   'dashdemo7@example.com',  '07700900107', 'Demo Bailey & Demo Max', 'Mixed', 'full-groom', 'caister', (CURRENT_DATE - 2), '10:00', 'Two dogs together', 'confirmed', 'completed', (CURRENT_DATE - 2), '10:00', 120, (CURRENT_DATE - 2)::timestamptz + interval '13 hours', 2, true, 40, 80, 'manual')
;

-- ---------- Pending requests awaiting confirmation ----------
INSERT INTO appointments (ownername, email, phone, dogname, dogbreed, serviceid, locationid, date, time, notes, status, booking_status, requested_time_preference, number_of_dogs, deposit_paid, deposit_amount, booking_source)
VALUES
  ('DEMO - Fiona Marsh',   'dashdemo9@example.com',  '07700900109', 'Demo Coco',   'Maltese',       'full-groom',  'caister',   (CURRENT_DATE + 4), '10:00', 'First time customer', 'pending', 'pending', '10:00', 1, false, 20, 'web'),
  ('DEMO - Ravi Shah',     'dashdemo10@example.com', '07700900110', 'Demo Buddy',  'Dachshund',     'nail-clipping','winterton', (CURRENT_DATE + 5), '14:00', '', 'pending', 'pending', '14:00', 1, false, 20, 'web'),
  ('DEMO - Holly Grant',   'dashdemo11@example.com', '07700900111', 'Demo Ruby',   'Springer',      'bath-brush',  'caister',   (CURRENT_DATE + 6), '12:00', '', 'pending', 'pending', '12:00', 1, false, 20, 'web'),
  ('DEMO - Marcus Webb',   'dashdemo12@example.com', '07700900112', 'Demo Zeus',   'Rottweiler',    'full-groom',  'winterton', (CURRENT_DATE + 7), '16:00', 'Nervous around dryers', 'pending', 'pending', '16:00', 1, false, 20, 'web')
;

-- ---------- Confirmed, deposit still owed ----------
INSERT INTO appointments (ownername, email, phone, dogname, dogbreed, serviceid, locationid, date, time, notes, status, booking_status, confirmed_date, confirmed_time, confirmed_duration_minutes, number_of_dogs, deposit_paid, deposit_amount, booking_source)
VALUES
  ('DEMO - Sarah Jones',   'dashdemo1@example.com', '07700900101', 'Demo Rex',   'Labrador',   'full-groom',  'caister',   (CURRENT_DATE + 2), '10:00', '', 'confirmed', 'confirmed', (CURRENT_DATE + 2), '10:00', 120, 1, false, 20, 'manual'),
  ('DEMO - Nadia Hussain', 'dashdemo6@example.com', '07700900106', 'Demo Luna',  'Shih Tzu',   'bath-brush',  'winterton', (CURRENT_DATE + 3), '12:00', '', 'confirmed', 'confirmed', (CURRENT_DATE + 3), '12:00', 120, 1, false, 20, 'manual'),
  ('DEMO - James Wu',      'dashdemo8@example.com', '07700900108', 'Demo Daisy', 'Cavapoo',    'home-grooming','caister',  (CURRENT_DATE + 9), '10:00', '', 'confirmed', 'confirmed', (CURRENT_DATE + 9), '10:00', 120, 1, false, 45, 'manual')
;

-- ---------- Confirmed, deposit already paid ----------
INSERT INTO appointments (ownername, email, phone, dogname, dogbreed, serviceid, locationid, date, time, notes, status, booking_status, confirmed_date, confirmed_time, confirmed_duration_minutes, number_of_dogs, deposit_paid, deposit_amount, booking_source)
VALUES
  ('DEMO - Grace Kelly',   'dashdemo5@example.com', '07700900105', 'Demo Milo',   'Beagle',        'full-groom', 'caister',   (CURRENT_DATE + 1), '14:00', '', 'confirmed', 'confirmed', (CURRENT_DATE + 1), '14:00', 120, 1, true, 20, 'manual'),
  ('DEMO - Liam O''Connor','dashdemo4@example.com', '07700900104', 'Demo Poppy',  'Poodle',        'home-grooming','winterton',(CURRENT_DATE + 10), '10:00', '', 'confirmed', 'confirmed', (CURRENT_DATE + 10), '10:00', 120, 1, true, 20, 'manual')
;

-- ---------- Today's schedule ----------
INSERT INTO appointments (ownername, email, phone, dogname, dogbreed, serviceid, locationid, date, time, notes, status, booking_status, confirmed_date, confirmed_time, confirmed_duration_minutes, completed_at, number_of_dogs, deposit_paid, deposit_amount, actual_price, booking_source)
VALUES
  ('DEMO - Tom Baker',   'dashdemo2@example.com', '07700900102', 'Demo Bella', 'Cockapoo', 'bath-brush', 'caister',   CURRENT_DATE, '08:00', '', 'confirmed', 'completed', CURRENT_DATE, '08:00', 120, CURRENT_DATE::timestamptz + interval '10 hours', 1, true, 20, 25, 'manual'),
  ('DEMO - Priya Patel', 'dashdemo3@example.com', '07700900103', 'Demo Max',   'Cocker Spaniel', 'full-groom', 'winterton', CURRENT_DATE, '14:00', '', 'confirmed', 'confirmed', CURRENT_DATE, '14:00', 120, NULL, 1, true, 20, NULL, 'manual')
;

-- ---------- Due for rebook ----------
INSERT INTO appointments (ownername, email, phone, dogname, dogbreed, serviceid, locationid, date, time, notes, status, booking_status, confirmed_date, confirmed_time, confirmed_duration_minutes, completed_at, number_of_dogs, deposit_paid, deposit_amount, actual_price, booking_source)
VALUES
  ('DEMO - Ellie Brooks', 'dashdemo7@example.com', '07700900107', 'Demo Charlie', 'Border Collie', 'full-groom', 'caister',   (CURRENT_DATE - 30), '10:00', '', 'confirmed', 'due_for_rebook', (CURRENT_DATE - 30), '10:00', 120, (CURRENT_DATE - 30)::timestamptz + interval '12 hours', 1, true, 20, 35, 'manual'),
  ('DEMO - James Wu',     'dashdemo8@example.com', '07700900108', 'Demo Daisy',   'Cavapoo',       'bath-brush', 'winterton', (CURRENT_DATE - 32), '14:00', '', 'confirmed', 'due_for_rebook', (CURRENT_DATE - 32), '14:00', 120, (CURRENT_DATE - 32)::timestamptz + interval '16 hours', 1, true, 20, 25, 'manual')
;

-- ---------- Cancelled (for the Cancelled filter chip) ----------
INSERT INTO appointments (ownername, email, phone, dogname, dogbreed, serviceid, locationid, date, time, notes, status, booking_status, confirmed_date, confirmed_time, confirmed_duration_minutes, number_of_dogs, deposit_paid, deposit_amount, booking_source)
VALUES
  ('DEMO - Marcus Webb', 'dashdemo12@example.com', '07700900112', 'Demo Zeus', 'Rottweiler', 'full-groom', 'winterton', (CURRENT_DATE + 12), '10:00', 'Customer cancelled', 'cancelled', 'cancelled', (CURRENT_DATE + 12), '10:00', 120, 1, false, 20, 'manual')
;

-- ---------- Flag two demo customers as needing the matting release form ----------
UPDATE customers SET matting_required = true
WHERE email IN ('dashdemo2@example.com', 'dashdemo9@example.com');

-- Done. Refresh the admin Dashboard tab to see it populated.
