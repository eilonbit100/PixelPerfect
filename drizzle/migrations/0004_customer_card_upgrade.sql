CREATE TABLE public.affiliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  is_other boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.affiliations TO authenticated;
GRANT ALL ON public.affiliations TO service_role;
ALTER TABLE public.affiliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY aff_read ON public.affiliations FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY aff_insert ON public.affiliations FOR INSERT TO authenticated WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY aff_update ON public.affiliations FOR UPDATE TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
INSERT INTO public.affiliations(organization_id, name, is_other, sort)
SELECT o.id, v.n, v.o, v.s FROM public.organizations o,
 (VALUES ('הצטרפות פרטית',false,1),('ארגון המורים',false,2),('חבר',false,3),('מכבי UpApp',false,4),('גוף אחר',true,9)) v(n,o,s);

ALTER TABLE public.customers
  ADD COLUMN address text,
  ADD COLUMN birth_date date,
  ADD COLUMN affiliation_id uuid REFERENCES public.affiliations(id),
  ADD COLUMN affiliation_other text;

ALTER TABLE public.leads ADD COLUMN stage text NOT NULL DEFAULT 'LEAD';
UPDATE public.leads SET stage='PROSPECT' WHERE status IN ('CONTACT_ATTEMPT','FOLLOW_UP','TRIAL');
ALTER TABLE public.leads ADD CONSTRAINT leads_stage_chk CHECK (stage IN ('LEAD','PROSPECT'));

ALTER TABLE public.memberships
  ADD COLUMN cancel_note text,
  ADD COLUMN cancel_performed_at timestamptz,
  ADD COLUMN cancelled_by uuid,
  ADD COLUMN cancellation_request_id uuid REFERENCES public.cancellation_requests(id);
ALTER TABLE public.cancellation_requests
  ADD COLUMN note text,
  ADD COLUMN assigned_member_id uuid REFERENCES public.organization_members(id),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public._bm_kpis'::regproc);
  d := replace(d, 'AND status=''OPEN''', 'AND status IN (''OPEN'',''IN_PROGRESS'')');
  d := replace(d, 'r.status<>''OPEN''', 'r.status NOT IN (''OPEN'',''IN_PROGRESS'')');
  EXECUTE d;
END $$;

CREATE OR REPLACE FUNCTION public._log_customer(_cust uuid, _type text, _desc text, _meta jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
  SELECT c.organization_id, c.home_branch_id, 'customer', c.id, _type, _desc, auth.uid(), coalesce(_meta,'{}'::jsonb) FROM customers c WHERE c.id=_cust;
$$;
REVOKE ALL ON FUNCTION public._log_customer(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.open_cancellation_request(_membership uuid, _requested_at date, _reason text, _note text, _assigned uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; _id uuid;
BEGIN
  SELECT * INTO m FROM memberships WHERE id=_membership;
  IF m.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT has_branch_access(m.organization_id, m.branch_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF m.status IN ('CANCELLED','EXPIRED') THEN RAISE EXCEPTION 'המנוי כבר אינו פעיל'; END IF;
  IF coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'יש לציין סיבה'; END IF;
  IF _requested_at IS NULL OR _requested_at > current_date THEN RAISE EXCEPTION 'תאריך קבלת הבקשה אינו תקין'; END IF;
  IF EXISTS (SELECT 1 FROM cancellation_requests WHERE membership_id=m.id AND status IN ('OPEN','IN_PROGRESS')) THEN RAISE EXCEPTION 'כבר קיימת בקשת ביטול פתוחה למנוי זה'; END IF;
  INSERT INTO cancellation_requests(organization_id, branch_id, customer_id, membership_id, reason, note, status, requested_at, created_by, assigned_member_id)
  VALUES (m.organization_id, m.branch_id, m.customer_id, m.id, trim(_reason), nullif(trim(_note),''), 'OPEN', (_requested_at::timestamp AT TIME ZONE 'Asia/Jerusalem'), auth.uid(), _assigned)
  RETURNING id INTO _id;
  PERFORM _log_customer(m.customer_id, 'CANCEL_REQUEST', 'נפתחה בקשת ביטול ל־'||m.display_name||': '||trim(_reason), jsonb_build_object('request_id',_id,'membership_id',m.id));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.update_cancellation_request(_request uuid, _status text, _assigned uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM cancellation_requests WHERE id=_request FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (is_org_manager(r.organization_id) AND has_branch_access(r.organization_id, r.branch_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _status NOT IN ('OPEN','IN_PROGRESS','HANDLED','REJECTED') THEN RAISE EXCEPTION 'סטטוס לא תקין'; END IF;
  UPDATE cancellation_requests SET status=_status, assigned_member_id=_assigned, note=coalesce(nullif(trim(_note),''), note),
    handled_at = CASE WHEN _status IN ('HANDLED','REJECTED') THEN coalesce(handled_at, now()) ELSE NULL END, updated_at=now()
  WHERE id=_request;
  PERFORM _log_customer(r.customer_id, 'CANCEL_REQUEST_STATUS', 'סטטוס בקשת ביטול עודכן', jsonb_build_object('request_id',_request,'from',r.status,'to',_status));
END $$;

CREATE OR REPLACE FUNCTION public.cancel_membership(_membership uuid, _effective date, _reason text, _note text, _request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record;
BEGIN
  SELECT * INTO m FROM memberships WHERE id=_membership FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (is_org_manager(m.organization_id) AND has_branch_access(m.organization_id, m.branch_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF m.status='CANCELLED' THEN RAISE EXCEPTION 'המנוי כבר בוטל'; END IF;
  IF _effective IS NULL THEN RAISE EXCEPTION 'חובה לציין תאריך כניסת הביטול לתוקף'; END IF;
  IF coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'יש לציין סיבת ביטול'; END IF;
  IF _request IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cancellation_requests WHERE id=_request AND membership_id=m.id) THEN RAISE EXCEPTION 'הבקשה אינה שייכת למנוי'; END IF;
  UPDATE memberships SET status='CANCELLED', cancelled_at=(_effective::timestamp AT TIME ZONE 'Asia/Jerusalem'), cancel_reason=trim(_reason),
    cancel_note=nullif(trim(_note),''), cancel_performed_at=now(), cancelled_by=auth.uid(), cancellation_request_id=_request,
    end_date = LEAST(coalesce(end_date,_effective), _effective)
  WHERE id=m.id;
  IF _request IS NOT NULL THEN
    UPDATE cancellation_requests SET status='HANDLED', handled_at=coalesce(handled_at,now()), updated_at=now() WHERE id=_request;
  END IF;
  PERFORM _log_customer(m.customer_id, 'MEMBERSHIP_CANCELLED', 'המנוי '||m.display_name||' בוטל, בתוקף מ־'||to_char(_effective,'DD/MM/YYYY')||': '||trim(_reason), jsonb_build_object('membership_id',m.id,'request_id',_request));
END $$;

CREATE OR REPLACE FUNCTION public.change_membership_plan(_membership uuid, _plan uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; p record;
BEGIN
  SELECT * INTO m FROM memberships WHERE id=_membership FOR UPDATE;
  SELECT * INTO p FROM membership_plans WHERE id=_plan AND active;
  IF m.id IS NULL OR p.id IS NULL OR p.organization_id<>m.organization_id THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (is_org_manager(m.organization_id) AND has_branch_access(m.organization_id, m.branch_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF m.status NOT IN ('ACTIVE','FROZEN','PENDING') THEN RAISE EXCEPTION 'ניתן לשנות מסלול רק למנוי פעיל'; END IF;
  UPDATE memberships SET membership_plan_id=p.id, display_name=p.name, price=p.price WHERE id=m.id;
  PERFORM _log_customer(m.customer_id, 'PLAN_CHANGED', 'שינוי מסלול: '||m.display_name||' ← '||p.name, jsonb_build_object('membership_id',m.id,'old_price',m.price,'new_price',p.price));
END $$;

CREATE OR REPLACE FUNCTION public.end_freeze(_freeze uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f record; m record; _lost int;
BEGIN
  SELECT * INTO f FROM customer_freezes WHERE id=_freeze FOR UPDATE;
  IF f.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO m FROM memberships WHERE id=f.membership_id;
  IF NOT has_branch_access(m.organization_id, m.branch_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT (current_date BETWEEN f.start_date AND f.end_date) THEN RAISE EXCEPTION 'ההקפאה אינה פעילה כעת'; END IF;
  _lost := f.end_date - current_date;
  UPDATE customer_freezes SET end_date = greatest(f.start_date, current_date - 1) WHERE id=f.id;
  IF _lost > 0 AND m.end_date IS NOT NULL THEN UPDATE memberships SET end_date = end_date - _lost WHERE id=m.id; END IF;
  UPDATE memberships SET status='ACTIVE' WHERE id=m.id AND status='FROZEN';
  PERFORM _log_customer(f.customer_id, 'FREEZE_ENDED', 'ההקפאה הסתיימה מוקדם', jsonb_build_object('freeze_id',f.id,'days_returned',_lost));
END $$;

CREATE OR REPLACE FUNCTION public.convert_lead_to_customer(_lead uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
declare _l record; _c uuid;
begin
  select * into _l from public.leads where id=_lead and deleted_at is null for update;
  if _l.id is null then raise exception 'NOT_FOUND'; end if;
  if not public.has_branch_access(_l.organization_id, _l.branch_id) then raise exception 'FORBIDDEN'; end if;
  if _l.converted_customer_id is not null then return _l.converted_customer_id; end if;
  if _l.normalized_phone is not null then
    select id into _c from public.customers where organization_id=_l.organization_id and normalized_phone=_l.normalized_phone and deleted_at is null limit 1;
  end if;
  if _c is null then
    insert into public.customers(organization_id, home_branch_id, full_name, phone, email, status, created_by)
    values (_l.organization_id, _l.branch_id, _l.full_name, _l.phone, _l.email, 'PENDING', auth.uid()) returning id into _c;
  end if;
  update public.leads set status='WON', converted_customer_id=_c where id=_lead;
  update public.tasks set entity_type='customer', entity_id=_c where entity_type='lead' and entity_id=_lead;
  insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata, created_at)
  select organization_id, branch_id, 'customer', _c, activity_type, description, performed_by, metadata || jsonb_build_object('from_lead', _lead), created_at
  from public.activities where entity_type='lead' and entity_id=_lead;
  insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
  values (_l.organization_id, _l.branch_id, 'customer', _c, 'CUSTOMER_CREATED', 'הומר ממתעניין', auth.uid(), jsonb_build_object('lead_id', _lead));
  return _c;
end $$;

CREATE OR REPLACE FUNCTION public.find_person_by_phone(_org uuid, _phone text)
RETURNS TABLE(kind text, id uuid, full_name text, status text, stage text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT 'customer'::text, c.id, c.full_name, c.status, NULL::text FROM customers c
   WHERE c.organization_id=_org AND c.deleted_at IS NULL AND c.normalized_phone = normalize_phone(_phone)
  UNION ALL
  SELECT 'lead'::text, l.id, l.full_name, l.status, l.stage FROM leads l
   WHERE l.organization_id=_org AND l.deleted_at IS NULL AND l.converted_customer_id IS NULL AND l.normalized_phone = normalize_phone(_phone);
$$;

REVOKE EXECUTE ON FUNCTION public.open_cancellation_request(uuid,date,text,text,uuid), public.update_cancellation_request(uuid,text,uuid,text),
  public.cancel_membership(uuid,date,text,text,uuid), public.change_membership_plan(uuid,uuid), public.end_freeze(uuid), public.find_person_by_phone(uuid,text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_cancellation_request(uuid,date,text,text,uuid), public.update_cancellation_request(uuid,text,uuid,text),
  public.cancel_membership(uuid,date,text,text,uuid), public.change_membership_plan(uuid,uuid), public.end_freeze(uuid), public.find_person_by_phone(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.memberships_guard_cancel() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status='CANCELLED' AND NEW.cancelled_at IS NULL AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'CANCELLED') THEN
    RAISE EXCEPTION 'אין לבטל מנוי ללא תאריך ביטול אפקטיבי';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER memberships_guard_cancel BEFORE INSERT OR UPDATE OF status ON public.memberships
  FOR EACH ROW WHEN (NEW.status='CANCELLED') EXECUTE FUNCTION public.memberships_guard_cancel();