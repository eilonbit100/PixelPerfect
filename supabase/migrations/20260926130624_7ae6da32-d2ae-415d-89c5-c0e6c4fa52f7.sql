
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS photo_path text, ADD COLUMN IF NOT EXISTS desk_note text;

-- Freezes
CREATE TABLE public.customer_freezes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  membership_id uuid NOT NULL REFERENCES public.memberships(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('ABROAD','ILLNESS','RESERVE_DUTY','OTHER')),
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
GRANT SELECT, INSERT ON public.customer_freezes TO authenticated;
GRANT ALL ON public.customer_freezes TO service_role;
ALTER TABLE public.customer_freezes ENABLE ROW LEVEL SECURITY;
CREATE POLICY freezes_select ON public.customer_freezes FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY freezes_insert ON public.customer_freezes FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.apply_freezes(_customer uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE memberships m SET status = 'FROZEN'
  WHERE m.status = 'ACTIVE' AND (_customer IS NULL OR m.customer_id = _customer)
    AND EXISTS (SELECT 1 FROM customer_freezes f WHERE f.membership_id = m.id AND current_date BETWEEN f.start_date AND f.end_date);
  UPDATE memberships m SET status = 'ACTIVE'
  WHERE m.status = 'FROZEN' AND (_customer IS NULL OR m.customer_id = _customer)
    AND EXISTS (SELECT 1 FROM customer_freezes f WHERE f.membership_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM customer_freezes f WHERE f.membership_id = m.id AND current_date BETWEEN f.start_date AND f.end_date);
END $$;

CREATE OR REPLACE FUNCTION public.freezes_apply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m memberships;
BEGIN
  SELECT * INTO _m FROM memberships WHERE id = NEW.membership_id;
  IF _m.id IS NULL OR _m.customer_id <> NEW.customer_id OR _m.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'מנוי לא תקין';
  END IF;
  IF _m.status NOT IN ('ACTIVE','FROZEN') THEN RAISE EXCEPTION 'אפשר להקפיא רק מנוי פעיל'; END IF;
  IF _m.end_date IS NOT NULL THEN
    UPDATE memberships SET end_date = end_date + (NEW.end_date - NEW.start_date + 1) WHERE id = _m.id;
  END IF;
  PERFORM apply_freezes(NEW.customer_id);
  INSERT INTO activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by)
  VALUES (NEW.organization_id, _m.branch_id, 'customer', NEW.customer_id, 'FREEZE',
    'הקפאת מנוי ' || to_char(NEW.start_date,'DD/MM/YYYY') || '–' || to_char(NEW.end_date,'DD/MM/YYYY'), auth.uid());
  RETURN NEW;
END $$;
CREATE TRIGGER freezes_apply AFTER INSERT ON public.customer_freezes FOR EACH ROW EXECUTE FUNCTION public.freezes_apply();

-- Entry reasons
CREATE OR REPLACE FUNCTION public.entry_block_reasons(_customer uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text[] := '{}'; _h customer_compliance_items; _has_mem boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM memberships m JOIN customer_freezes f ON f.membership_id = m.id
             WHERE m.customer_id = _customer AND current_date BETWEEN f.start_date AND f.end_date) THEN
    r := array_append(r, 'FROZEN');
  END IF;
  SELECT EXISTS (SELECT 1 FROM memberships WHERE customer_id = _customer AND status IN ('ACTIVE','FROZEN')
    AND (end_date IS NULL OR end_date >= current_date)) INTO _has_mem;
  IF NOT _has_mem THEN r := array_append(r, 'NO_MEMBERSHIP'); END IF;
  SELECT i.* INTO _h FROM customer_compliance_items i JOIN compliance_requirements q ON q.id = i.requirement_id
   WHERE i.customer_id = _customer AND q.key = 'HEALTH_DECLARATION' LIMIT 1;
  IF _h.id IS NULL OR _h.status = 'MISSING' THEN r := array_append(r, 'HEALTH_MISSING');
  ELSIF _h.status = 'PENDING' THEN r := array_append(r, 'HEALTH_PENDING');
  ELSIF _h.status = 'EXPIRED' OR (_h.expires_at IS NOT NULL AND _h.expires_at < now()) THEN r := array_append(r, 'HEALTH_EXPIRED');
  ELSIF _h.status <> 'VALID' THEN r := array_append(r, 'HEALTH_MISSING');
  END IF;
  IF EXISTS (SELECT 1 FROM payments WHERE customer_id = _customer AND status = 'FAILED') THEN r := array_append(r, 'PAYMENT_FAILED'); END IF;
  RETURN r;
END $$;

-- Check-ins
CREATE TABLE public.check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  allowed boolean NOT NULL,
  reasons text[] NOT NULL DEFAULT '{}',
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX check_ins_customer_idx ON public.check_ins(customer_id, created_at DESC);
CREATE INDEX check_ins_branch_idx ON public.check_ins(branch_id, created_at DESC);
GRANT SELECT ON public.check_ins TO authenticated;
GRANT ALL ON public.check_ins TO service_role;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY check_ins_select ON public.check_ins FOR SELECT TO authenticated USING (public.has_branch_access(organization_id, branch_id));

CREATE OR REPLACE FUNCTION public.check_in_customer(_customer uuid, _branch uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; _r text[];
BEGIN
  SELECT organization_id INTO _org FROM customers WHERE id = _customer AND deleted_at IS NULL;
  IF _org IS NULL THEN RAISE EXCEPTION 'לקוח לא נמצא'; END IF;
  IF NOT has_branch_access(_org, _branch) THEN RAISE EXCEPTION 'אין הרשאה לסניף'; END IF;
  PERFORM apply_freezes(_customer);
  _r := entry_block_reasons(_customer);
  INSERT INTO check_ins(organization_id, branch_id, customer_id, allowed, reasons, performed_by)
  VALUES (_org, _branch, _customer, cardinality(_r) = 0, _r, auth.uid());
  RETURN jsonb_build_object('allowed', cardinality(_r) = 0, 'reasons', to_jsonb(_r));
END $$;

-- Classes
CREATE TABLE public.class_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.class_rooms TO authenticated;
GRANT ALL ON public.class_rooms TO service_role;
ALTER TABLE public.class_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY rooms_select ON public.class_rooms FOR SELECT TO authenticated USING (public.has_branch_access(organization_id, branch_id));
CREATE POLICY rooms_insert ON public.class_rooms FOR INSERT TO authenticated WITH CHECK (public.is_org_manager(organization_id) AND public.has_branch_access(organization_id, branch_id));
CREATE POLICY rooms_update ON public.class_rooms FOR UPDATE TO authenticated USING (public.is_org_manager(organization_id) AND public.has_branch_access(organization_id, branch_id));

CREATE TABLE public.class_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  room_id uuid NOT NULL REFERENCES public.class_rooms(id),
  name text NOT NULL,
  instructor_member_id uuid REFERENCES public.organization_members(id),
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  duration_min int NOT NULL DEFAULT 50 CHECK (duration_min > 0),
  capacity int NOT NULL DEFAULT 20 CHECK (capacity > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.class_templates TO authenticated;
GRANT ALL ON public.class_templates TO service_role;
ALTER TABLE public.class_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY ct_select ON public.class_templates FOR SELECT TO authenticated USING (public.has_branch_access(organization_id, branch_id));
CREATE POLICY ct_insert ON public.class_templates FOR INSERT TO authenticated WITH CHECK (public.is_org_manager(organization_id) AND public.has_branch_access(organization_id, branch_id));
CREATE POLICY ct_update ON public.class_templates FOR UPDATE TO authenticated USING (public.is_org_manager(organization_id) AND public.has_branch_access(organization_id, branch_id));
CREATE TRIGGER ct_updated BEFORE UPDATE ON public.class_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.class_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  template_id uuid NOT NULL REFERENCES public.class_templates(id),
  session_date date NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  status text NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED','WAITLIST','CANCELLED')),
  attended boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, session_date, customer_id)
);
GRANT SELECT, UPDATE ON public.class_bookings TO authenticated;
GRANT ALL ON public.class_bookings TO service_role;
ALTER TABLE public.class_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY cb_select ON public.class_bookings FOR SELECT TO authenticated USING (public.has_branch_access(organization_id, branch_id));
CREATE POLICY cb_update ON public.class_bookings FOR UPDATE TO authenticated USING (public.has_branch_access(organization_id, branch_id));

CREATE OR REPLACE FUNCTION public.book_class(_template uuid, _date date, _customer uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t class_templates; _r text[]; _n int; _st text;
BEGIN
  SELECT * INTO _t FROM class_templates WHERE id = _template AND active FOR UPDATE;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'שיעור לא נמצא'; END IF;
  IF NOT has_branch_access(_t.organization_id, _t.branch_id) THEN RAISE EXCEPTION 'אין הרשאה לסניף'; END IF;
  IF extract(dow FROM _date)::int <> _t.weekday THEN RAISE EXCEPTION 'תאריך לא תואם ליום השיעור'; END IF;
  IF _date < current_date THEN RAISE EXCEPTION 'לא ניתן להירשם לשיעור שעבר'; END IF;
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = _customer AND organization_id = _t.organization_id) THEN RAISE EXCEPTION 'לקוח לא נמצא'; END IF;
  _r := entry_block_reasons(_customer);
  IF cardinality(_r) > 0 THEN RAISE EXCEPTION 'הלקוח חסום לכניסה ולא ניתן לרשום אותו'; END IF;
  SELECT count(*) INTO _n FROM class_bookings WHERE template_id = _template AND session_date = _date AND status = 'BOOKED';
  _st := CASE WHEN _n < _t.capacity THEN 'BOOKED' ELSE 'WAITLIST' END;
  INSERT INTO class_bookings(organization_id, branch_id, template_id, session_date, customer_id, status)
  VALUES (_t.organization_id, _t.branch_id, _template, _date, _customer, _st)
  ON CONFLICT (template_id, session_date, customer_id) DO UPDATE SET status = EXCLUDED.status, attended = false
  WHERE class_bookings.status = 'CANCELLED';
  IF NOT FOUND THEN RAISE EXCEPTION 'הלקוח כבר רשום לשיעור'; END IF;
  RETURN _st;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_booking(_booking uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b class_bookings; _next uuid;
BEGIN
  SELECT * INTO _b FROM class_bookings WHERE id = _booking FOR UPDATE;
  IF _b.id IS NULL OR NOT has_branch_access(_b.organization_id, _b.branch_id) THEN RAISE EXCEPTION 'לא נמצא'; END IF;
  UPDATE class_bookings SET status = 'CANCELLED', attended = false WHERE id = _booking;
  IF _b.status = 'BOOKED' THEN
    SELECT id INTO _next FROM class_bookings WHERE template_id = _b.template_id AND session_date = _b.session_date AND status = 'WAITLIST' ORDER BY created_at LIMIT 1;
    IF _next IS NOT NULL THEN UPDATE class_bookings SET status = 'BOOKED' WHERE id = _next; END IF;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.apply_freezes(uuid), public.entry_block_reasons(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.check_in_customer(uuid,uuid), public.book_class(uuid,date,uuid), public.cancel_booking(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.check_in_customer(uuid,uuid), public.book_class(uuid,date,uuid), public.cancel_booking(uuid), public.entry_block_reasons(uuid) TO authenticated;

-- Photos storage policies (bucket created separately): path = <org_id>/<customer_id>/...
CREATE POLICY "photos read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'customer-photos' AND public.is_org_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "photos insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'customer-photos' AND public.is_org_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "photos update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'customer-photos' AND public.is_org_member(((storage.foldername(name))[1])::uuid));

-- Demo seed
INSERT INTO public.class_rooms(organization_id, branch_id, name)
SELECT b.organization_id, b.id, r.n FROM public.branches b CROSS JOIN (VALUES ('סטודיו 1'),('פילאטיס מכשירים')) r(n)
WHERE b.organization_id = '00000000-0000-0000-0000-00000000a001';

INSERT INTO public.class_templates(organization_id, branch_id, room_id, name, instructor_member_id, weekday, start_time, duration_min, capacity)
SELECT r.organization_id, r.branch_id, r.id, s.name,
  (SELECT id FROM public.organization_members m WHERE m.organization_id = r.organization_id ORDER BY m.username OFFSET (s.i % 4) LIMIT 1),
  s.wd, s.t::time, 50, CASE WHEN r.name = 'פילאטיס מכשירים' THEN 8 ELSE 20 END
FROM public.class_rooms r
JOIN (VALUES
  (1,'יוגה',0,'08:00',true),(2,'BodyPump',0,'19:00',true),(3,'זומבה',1,'18:30',true),(4,'HIIT',2,'07:00',true),
  (5,'יוגה',3,'20:00',true),(6,'BodyPump',4,'18:00',true),(7,'פילאטיס מכשירים',0,'09:00',false),(8,'פילאטיס מכשירים',2,'17:00',false),
  (9,'פילאטיס מכשירים',4,'10:00',false),(10,'פילאטיס מכשירים',1,'20:00',false)
) s(i,name,wd,t,studio) ON (s.studio = (r.name = 'סטודיו 1'))
WHERE r.organization_id = '00000000-0000-0000-0000-00000000a001';

INSERT INTO public.check_ins(organization_id, branch_id, customer_id, allowed, reasons, created_at)
SELECT c.organization_id, c.home_branch_id, c.id, cardinality(public.entry_block_reasons(c.id)) = 0, public.entry_block_reasons(c.id),
  now() - ((abs(hashtext(c.id::text || g::text)) % 20) || ' days')::interval - ((abs(hashtext(g::text || c.id::text)) % 600) || ' minutes')::interval
FROM public.customers c CROSS JOIN generate_series(1,3) g
WHERE c.organization_id = '00000000-0000-0000-0000-00000000a001' AND c.home_branch_id IS NOT NULL AND c.deleted_at IS NULL
  AND abs(hashtext(c.id::text)) % 3 = 0;
