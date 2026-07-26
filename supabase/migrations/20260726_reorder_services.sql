-- Reorders the services list: Teeth Cleaning now shows right after Puppy
-- Groom Experience, and Home Grooming moves to the end. Uses UPDATE (not the
-- seed INSERT's ON CONFLICT DO NOTHING) so it takes effect even though
-- service_catalog is already populated in production.
UPDATE service_catalog SET display_order = 0 WHERE id = 'full-groom';
UPDATE service_catalog SET display_order = 1 WHERE id = 'bath-brush';
UPDATE service_catalog SET display_order = 2 WHERE id = 'puppy-intro';
UPDATE service_catalog SET display_order = 3 WHERE id = 'teeth-cleaning';
UPDATE service_catalog SET display_order = 4 WHERE id = 'nail-clipping';
UPDATE service_catalog SET display_order = 5 WHERE id = 'home-grooming';
