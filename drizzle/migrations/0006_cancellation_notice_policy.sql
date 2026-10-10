CREATE TABLE public.cancellation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid REFERENCES public.branches(id),
  membership_plan_id uuid REFERENCES public.membership_plans(id),
  notice_unit text NOT NULL DEFAULT 'MONTHS' CHECK (notice_unit IN ('IMMEDIATE','DAYS','MONTHS')),
  notice_value integer NOT NULL DEFAULT 1 CHECK (notice_value >= 0 AND notice_value <= 365),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (branch_id IS NULL OR membership_plan_id IS NULL)
);
CREATE UNIQUE INDEX cancellation_policies_scope ON public.cancellation_policies (organization_id, coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(membership_plan_id,'00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cancellation_policies TO authenticated;
GRANT ALL ON public.cancellation_policies TO service_role;
ALTER TABLE public.cancellation_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY cp_read ON public.cancellation_policies FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY cp_insert ON public.cancellation_policies FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY cp_update ON public.cancellation_policies FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY cp_delete ON public.cancellation_policies FOR DELETE TO authenticated USING (public.is_org_admin(organization_id) AND (branch_id IS NOT NULL OR membership_plan_id IS NOT NULL));
INSERT INTO public.cancellation_policies(organization_id, notice_unit, notice_value) SELECT id, 'MONTHS', 1 FROM public.organizations;

ALTER TABLE public.cancellation_requests
  ADD COLUMN effective_date date,
  ADD COLUMN policy_snapshot jsonb;
ALTER TABLE public.memberships
  ADD COLUMN scheduled_cancel_date date,
  ADD COLUMN cancel_override_reason text,
  ADD COLUMN cancel_approved_by uuid,
  ADD COLUMN cancel_approved_at timestamptz;

-- Resolve policy: plan > branch > organization
CREATE OR REPLACE FUNCTION public.cancellation_policy_for(_membership uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('unit', p.notice_unit, 'value', p.notice_value, 'scope', CASE WHEN p.membership_plan_id IS NOT NULL THEN 'PLAN' WHEN p.branch_id IS NOT NULL THEN 'BRANCH' ELSE 'ORG' END)
  FROM memberships m JOIN cancellation_policies p ON p.organization_id=m.organization_id
   AND (p.membership_plan_id = m.membership_plan_id OR p.branch_id = m.branch_id OR (p.branch_id IS NULL AND p.membership_plan_id IS NULL))
  WHERE m.id=_membership
  ORDER BY (p.membership_plan_id IS NOT NULL) DESC, (p.branch_id IS NOT NULL) DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.notice_date(_from date, _policy jsonb)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE coalesce(_policy->>'unit','MONTHS')
    WHEN 'IMMEDIATE' THEN _from
    WHEN 'DAYS' THEN _from + coalesce((_policy->>'value')::int,0)
    ELSE (_from + make_interval(months => coalesce((_policy->>'value')::int,1)))::date END
$$;

CREATE OR REPLACE FUNCTION public.preview_cancellation_date(_membership uuid, _requested date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; p jsonb;
BEGIN
  SELECT * INTO m FROM memberships WHERE id=_membership;
  IF m.id IS NULL OR NOT has_branch_access(m.organization_id, m.branch_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  p := coalesce(cancellation_policy_for(_membership), '{"unit":"MONTHS","value":1,"scope":"DEFAULT"}'::jsonb);
  RETURN p || jsonb_build_object('effective_date', notice_date(_requested, p));
END $$;

CREATE OR REPLACE FUNCTION public.open_cancellation_request(_membership uuid, _requested_at date, _reason text, _note text, _assigned uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; _id uuid; p jsonb; eff date;
BEGIN
  SELECT * INTO m FROM memberships WHERE id=_membership;
  IF m.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT has_branch_access(m.organization_id, m.branch_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF m.status IN ('CANCELLED','EXPIRED') THEN RAISE EXCEPTION 'המנוי כבר אינו פעיל'; END IF;
  IF m.scheduled_cancel_date IS NOT NULL THEN RAISE EXCEPTION 'למנוי כבר מתוכנן ביטול'; END IF;
  IF coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'יש לציין סיבה'; END IF;
  IF _requested_at IS NULL OR _requested_at > current_date THEN RAISE EXCEPTION 'תאריך קבלת הבקשה אינו תקין'; END IF;
  IF EXISTS (SELECT 1 FROM cancellation_requests WHERE membership_id=m.id AND status IN ('OPEN','IN_PROGRESS')) THEN RAISE EXCEPTION 'כבר קיימת בקשת ביטול פתוחה למנוי זה'; END IF;
  p := coalesce(cancellation_policy_for(m.id), '{"unit":"MONTHS","value":1,"scope":"DEFAULT"}'::jsonb);
  eff := notice_date(_requested_at, p);
  INSERT INTO cancellation_requests(organization_id, branch_id, customer_id, membership_id, reason, note, status, requested_at, created_by, assigned_member_id, effective_date, policy_snapshot)
  VALUES (m.organization_id, m.branch_id, m.customer_id, m.id, trim(_reason), nullif(trim(_note),''), 'OPEN', (_requested_at::timestamp AT TIME ZONE 'Asia/Jerusalem'), auth.uid(), _assigned, eff, p)
  RETURNING id INTO _id;
  PERFORM _log_customer(m.customer_id, 'CANCEL_REQUEST', 'נפתחה בקשת ביטול ל־'||m.display_name||', בתוקף מ־'||to_char(eff,'DD/MM/YYYY')||': '||trim(_reason), jsonb_build_object('request_id',_id,'membership_id',m.id,'effective_date',eff));
  RETURN _id;
END $$;

-- Apply due scheduled cancellations
CREATE OR REPLACE FUNCTION public.apply_scheduled_cancellations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  WITH u AS (
    UPDATE memberships SET status='CANCELLED', cancelled_at=(scheduled_cancel_date::timestamp AT TIME ZONE 'Asia/Jerusalem'),
      end_date = LEAST(coalesce(end_date, scheduled_cancel_date), scheduled_cancel_date)
    WHERE scheduled_cancel_date IS NOT NULL AND scheduled_cancel_date <= (now() AT TIME ZONE 'Asia/Jerusalem')::date AND status <> 'CANCELLED'
    RETURNING id, customer_id, display_name, scheduled_cancel_date)
  INSERT INTO activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, metadata)
  SELECT c.organization_id, c.home_branch_id, 'customer', c.id, 'MEMBERSHIP_CANCELLED', 'הביטול המתוכנן של '||u.display_name||' נכנס לתוקף', jsonb_build_object('membership_id', u.id, 'automatic', true)
  FROM u JOIN customers c ON c.id=u.customer_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.apply_scheduled_cancellations() FROM PUBLIC, anon, authenticated;

-- Approve cancellation (manager+). Earlier than policy requires an exception reason.
DROP FUNCTION IF EXISTS public.cancel_membership(uuid,date,text,text,uuid);
CREATE FUNCTION public.cancel_membership(_membership uuid, _effective date, _reason text, _note text, _request uuid, _override_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; r record; p jsonb; minimum date; today date := (now() AT TIME ZONE 'Asia/Jerusalem')::date; overridden boolean;
BEGIN
  SELECT * INTO m FROM memberships WHERE id=_membership FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (is_org_manager(m.organization_id) AND has_branch_access(m.organization_id, m.branch_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF m.status='CANCELLED' THEN RAISE EXCEPTION 'המנוי כבר בוטל'; END IF;
  IF m.scheduled_cancel_date IS NOT NULL THEN RAISE EXCEPTION 'למנוי כבר מתוכנן ביטול'; END IF;
  IF _effective IS NULL THEN RAISE EXCEPTION 'חובה לציין תאריך כניסת הביטול לתוקף'; END IF;
  IF coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'יש לציין סיבת ביטול'; END IF;
  IF _request IS NOT NULL THEN
    SELECT * INTO r FROM cancellation_requests WHERE id=_request AND membership_id=m.id;
    IF r.id IS NULL THEN RAISE EXCEPTION 'הבקשה אינה שייכת למנוי'; END IF;
    minimum := coalesce(r.effective_date, notice_date((r.requested_at AT TIME ZONE 'Asia/Jerusalem')::date, coalesce(r.policy_snapshot, cancellation_policy_for(m.id))));
  ELSE
    minimum := notice_date(today, coalesce(cancellation_policy_for(m.id), '{"unit":"MONTHS","value":1}'::jsonb));
  END IF;
  overridden := _effective < minimum;
  IF overridden AND coalesce(trim(_override_reason),'')='' THEN
    RAISE EXCEPTION 'התאריך מוקדם מתקופת ההודעה המוקדמת (%). נדרשת סיבת חריגה', to_char(minimum,'DD/MM/YYYY');
  END IF;
  UPDATE memberships SET scheduled_cancel_date=_effective, cancel_reason=trim(_reason), cancel_note=nullif(trim(_note),''),
    cancel_performed_at=now(), cancelled_by=auth.uid(), cancellation_request_id=_request,
    cancel_override_reason = CASE WHEN overridden THEN trim(_override_reason) END,
    cancel_approved_by=current_member_id(m.organization_id), cancel_approved_at=now()
  WHERE id=m.id;
  IF _request IS NOT NULL THEN
    UPDATE cancellation_requests SET status='HANDLED', handled_at=coalesce(handled_at,now()), updated_at=now() WHERE id=_request;
  END IF;
  PERFORM _log_customer(m.customer_id, 'MEMBERSHIP_CANCEL_APPROVED',
    'אושר ביטול '||m.display_name||' בתוקף מ־'||to_char(_effective,'DD/MM/YYYY')||': '||trim(_reason)
      || CASE WHEN overridden THEN ' · חריגה מתקופת ההודעה (מינימום '||to_char(minimum,'DD/MM/YYYY')||'): '||trim(_override_reason) ELSE '' END,
    jsonb_build_object('membership_id',m.id,'request_id',_request,'effective_date',_effective,'minimum_date',minimum,'override',overridden));
  PERFORM apply_scheduled_cancellations();
  RETURN jsonb_build_object('effective_date', _effective, 'minimum_date', minimum, 'override', overridden, 'immediate', _effective <= today);
END $$;

REVOKE EXECUTE ON FUNCTION public.cancel_membership(uuid,date,text,text,uuid,text), public.preview_cancellation_date(uuid,date), public.cancellation_policy_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_membership(uuid,date,text,text,uuid,text), public.preview_cancellation_date(uuid,date), public.cancellation_policy_for(uuid) TO authenticated;

-- Branch report: future (approved, not yet effective) cancellations
DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public._bm_kpis'::regproc);
  d := replace(d, '''cancelled_no_date'', (', '''cancel_scheduled'', (SELECT count(*) FROM memberships WHERE organization_id=_org AND branch_id=ANY(br) AND status<>''CANCELLED'' AND scheduled_cancel_date IS NOT NULL),
    ''cancelled_no_date'', (');
  EXECUTE d;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('apply-scheduled-cancellations', '5 21 * * *', 'SELECT public.apply_scheduled_cancellations()');