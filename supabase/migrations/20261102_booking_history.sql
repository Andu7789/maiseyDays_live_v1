-- Permanent history of every booking change, so "did this booking get deleted or moved?"
-- can always be answered. The database records it itself (trigger), so nothing is
-- missed whether the change came from the admin page, the website or an edge function.
-- Deleted bookings keep a full copy here and can be restored with md_restore_appointment().

CREATE TABLE IF NOT EXISTS public.md_booking_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  appointment_id UUID,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'restored', 'save_failed', 'message_sent')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT,
  old_row JSONB,
  new_row JSONB,
  changed_fields TEXT[],
  details JSONB,
  search_text TEXT
);

CREATE INDEX IF NOT EXISTS md_booking_history_appointment_idx ON public.md_booking_history (appointment_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS md_booking_history_changed_at_idx ON public.md_booking_history (changed_at DESC);

ALTER TABLE public.md_booking_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "md booking history read" ON public.md_booking_history;
CREATE POLICY "md booking history read" ON public.md_booking_history
  FOR SELECT TO authenticated USING (true);

-- The admin page can only add its own notes (failed saves, messages sent); the
-- created/updated/deleted/restored rows come from the trigger alone.
DROP POLICY IF EXISTS "md booking history app notes" ON public.md_booking_history;
CREATE POLICY "md booking history app notes" ON public.md_booking_history
  FOR INSERT TO authenticated WITH CHECK (action IN ('save_failed', 'message_sent'));

CREATE OR REPLACE FUNCTION public.md_booking_actor()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE coalesce(auth.role(), '')
    WHEN 'authenticated' THEN 'Admin page'
    WHEN 'anon' THEN 'Website'
    ELSE 'Automatic'
  END;
$$;

CREATE OR REPLACE FUNCTION public.md_log_appointment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_row JSONB;
  v_changed TEXT[];
  v_details JSONB;
  v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_action := CASE WHEN current_setting('md.restoring', true) = '1' THEN 'restored' ELSE 'created' END;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_action := 'deleted';
    -- Photos are removed with the booking (ON DELETE CASCADE), so keep their rows for a restore.
    BEGIN
      SELECT jsonb_build_object('photos', coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb))
        INTO v_details
        FROM booking_photos p
        WHERE p.appointment_id = OLD.id;
    EXCEPTION WHEN OTHERS THEN
      v_details := NULL;
    END;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_action := 'updated';
    -- Calendar sync bookkeeping and the customer link aren't changes anyone needs to see.
    SELECT array_agg(n.key ORDER BY n.key)
      INTO v_changed
      FROM jsonb_each(v_new) n
      WHERE n.value IS DISTINCT FROM v_old -> n.key
        AND n.key NOT IN ('calendar_sync_status', 'calendar_last_synced_at', 'calendar_last_error', 'calendar_event_id', 'customer_id');
    IF v_changed IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  v_row := coalesce(v_new, v_old);
  -- Safety catch: if logging ever fails, skip it rather than block the booking save.
  BEGIN
    INSERT INTO md_booking_history (appointment_id, action, actor, old_row, new_row, changed_fields, details, search_text)
    VALUES (
      (v_row ->> 'id')::uuid,
      v_action,
      md_booking_actor(),
      v_old,
      v_new,
      v_changed,
      v_details,
      lower(concat_ws(' ', v_row ->> 'ownername', v_row ->> 'dogname', v_row ->> 'phone', v_row ->> 'email'))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'md_booking_history logging skipped: %', SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- BEFORE DELETE so the booking's photos still exist when we copy them; AFTER for
-- insert/update so the row is final (including the customer-link BEFORE INSERT trigger).
DROP TRIGGER IF EXISTS trg_md_booking_history_delete ON public.appointments;
CREATE TRIGGER trg_md_booking_history_delete
  BEFORE DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.md_log_appointment_change();

DROP TRIGGER IF EXISTS trg_md_booking_history_write ON public.appointments;
CREATE TRIGGER trg_md_booking_history_write
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.md_log_appointment_change();

-- Puts a deleted booking (and its photos) back exactly as it was, with the same id.
CREATE OR REPLACE FUNCTION public.md_restore_appointment(p_history_id BIGINT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
  v_details JSONB;
  v_id UUID;
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' THEN
    RAISE EXCEPTION 'Only the admin can restore bookings.';
  END IF;

  SELECT old_row, details INTO v_old, v_details
    FROM md_booking_history
    WHERE id = p_history_id AND action = 'deleted';
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'That history entry is not a deleted booking.';
  END IF;

  v_id := (v_old ->> 'id')::uuid;
  IF EXISTS (SELECT 1 FROM appointments WHERE id = v_id) THEN
    RAISE EXCEPTION 'This booking is already back in the diary.';
  END IF;

  -- A parent booking that's since been deleted would break the foreign key.
  IF (v_old ->> 'parent_booking_id') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM appointments WHERE id = (v_old ->> 'parent_booking_id')::uuid) THEN
    v_old := v_old - 'parent_booking_id';
  END IF;

  PERFORM set_config('md.restoring', '1', true);
  INSERT INTO appointments SELECT * FROM jsonb_populate_record(NULL::appointments, v_old);
  PERFORM set_config('md.restoring', '', true);

  INSERT INTO booking_photos
    SELECT * FROM jsonb_populate_recordset(NULL::booking_photos, coalesce(v_details -> 'photos', '[]'::jsonb))
    ON CONFLICT (id) DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.md_restore_appointment(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.md_restore_appointment(BIGINT) TO authenticated;
REVOKE ALL ON FUNCTION public.md_log_appointment_change() FROM PUBLIC, anon, authenticated;
