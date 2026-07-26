-- Service catalog persistence: Settings > Manage Services previously only
-- edited in-memory React state (lost on refresh, never seen by customers).
-- This makes it a real, database-backed catalog that both the admin Settings
-- tab and the public booking page read from.
--
-- Named service_catalog rather than "services" because an empty, unreferenced
-- "services" table already exists (uuid id, camelCase columns — doesn't match
-- this app's text-id/snake_case convention, and nothing in the code reads
-- from it). Left untouched rather than reused or dropped.
CREATE TABLE IF NOT EXISTS service_catalog (
  id text PRIMARY KEY,
  name text NOT NULL,
  price text NOT NULL DEFAULT '',
  duration text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  image text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public to read service_catalog" ON service_catalog FOR SELECT TO public USING (true);
CREATE POLICY "Allow admins to manage service_catalog" ON service_catalog FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed with the existing hardcoded list so nothing changes for customers or
-- the admin until someone actually edits or adds a service.
INSERT INTO service_catalog (id, name, price, duration, description, image, display_order) VALUES
  ('full-groom', 'Full Grooming Package', 'From £35', '2-3 Hours', 'Includes a bath, blow-dry, styling, de-shedding, nail trim, paw pads, ear cleaning, and hygiene trim.', '/services/full-groom.png', 0),
  ('bath-brush', 'Bath, Blow-Dry & Brush', 'From £25', '1-1.5 Hours', 'Includes a bath, blow-dry, brush and removal of small matts', 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&q=80&w=800', 1),
  ('puppy-intro', 'Puppy Groom Experience', 'From £15', '30 mins to 1hr', 'A gentle introduction for puppies, introducing them to grooming in a calm and positive way', '/image0.png', 2),
  ('teeth-cleaning', 'Teeth Cleaning', 'From £30', '+15 Mins', 'Gentle ultrasonic teeth cleaning — no scraping, noise or vibration, so it''s stress-free even for nervous dogs. Removes plaque and tartar buildup and freshens breath. Option extra alongside any groom.', 'https://images.unsplash.com/photo-1534526238597-9187ddf131d7?auto=format&fit=crop&q=80&w=800', 3),
  ('nail-clipping', 'Nail Clipping', 'From £12', '+30 Mins', 'Professional nail trimming to keep your dog''s paws healthy and comfortable. Option extra, paw pads trim available.', 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&q=80&w=800', 4),
  ('home-grooming', 'Home Grooming', '£45', '2-3 Hours', 'Grooming in the comfort of your home with a calm, tailored setup. Includes bath (if available), blow-dry, styling, de-shedding, nail trim, and hygiene trim.', '/services/home-grooming.png', 5)
ON CONFLICT (id) DO NOTHING;

-- Public bucket for service photos (customer-facing images, unlike the
-- private booking-photos bucket).
INSERT INTO storage.buckets (id, name, public) VALUES ('service-photos', 'service-photos', true)
ON CONFLICT (id) DO NOTHING;
