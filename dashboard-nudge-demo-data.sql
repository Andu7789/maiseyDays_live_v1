-- ============================================================
-- REBOOK NUDGE DEMO DATA — for showing off the "Customers Due a Nudge" panel
-- ============================================================
-- Same tagging convention as dashboard-demo-data.sql (DEMO - names,
-- dashdemo*@example.com emails, 07700 900xxx OFCOM test numbers), so the
-- existing dashboard-demo-cleanup.sql removes these too — no separate
-- cleanup needed. Safe to run alongside or instead of the other demo file.
--
-- Each dog here has exactly ONE completed groom and nothing since, at a
-- range of "days ago" past the 28-day threshold, so you can see the panel
-- with a few different overdue lengths.

INSERT INTO appointments (ownername, email, phone, dogname, dogbreed, serviceid, locationid, date, time, notes, status, booking_status, confirmed_date, confirmed_time, confirmed_duration_minutes, completed_at, number_of_dogs, deposit_paid, deposit_amount, actual_price, booking_source)
VALUES
  ('DEMO - Hannah Reid',   'dashdemo13@example.com', '07700900113', 'Demo Winston', 'Golden Retriever', 'full-groom',    'caister',   (CURRENT_DATE - 30), '10:00', '', 'confirmed', 'completed', (CURRENT_DATE - 30), '10:00', 120, (CURRENT_DATE - 30)::timestamptz + interval '12 hours', 1, true, 20, 40, 'manual'),
  ('DEMO - Connor Wallace','dashdemo14@example.com', '07700900114', 'Demo Willow',  'Cockapoo',         'bath-brush',    'winterton', (CURRENT_DATE - 35), '14:00', '', 'confirmed', 'completed', (CURRENT_DATE - 35), '14:00', 120, (CURRENT_DATE - 35)::timestamptz + interval '16 hours', 1, true, 20, 25, 'manual'),
  ('DEMO - Isla Fraser',   'dashdemo15@example.com', '07700900115', 'Demo Otis',    'Poodle',           'home-grooming', 'caister',   (CURRENT_DATE - 45), '10:00', '', 'confirmed', 'completed', (CURRENT_DATE - 45), '10:00', 120, (CURRENT_DATE - 45)::timestamptz + interval '12 hours', 1, true, 20, 48, 'manual'),
  ('DEMO - Oscar Bell',    'dashdemo16@example.com', '07700900116', 'Demo Nala',    'Labrador',         'full-groom',    'winterton', (CURRENT_DATE - 60), '12:00', '', 'confirmed', 'completed', (CURRENT_DATE - 60), '12:00', 120, (CURRENT_DATE - 60)::timestamptz + interval '14 hours', 1, true, 20, 35, 'manual'),
  ('DEMO - Zara Ahmed',    'dashdemo17@example.com', '07700900117', 'Demo Barnaby', 'Beagle',           'nail-clipping', 'caister',   (CURRENT_DATE - 90), '16:00', '', 'confirmed', 'completed', (CURRENT_DATE - 90), '16:00', 120, (CURRENT_DATE - 90)::timestamptz + interval '18 hours', 1, true, 20, 12, 'manual')
;

-- Done. Refresh the admin Dashboard tab — the "Customers Due a Nudge" panel
-- should show all 5, sorted oldest-first (Demo Barnaby, 90 days, at the top).
