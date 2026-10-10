
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS cancel_reason text, ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS method text;

CREATE TABLE public.report_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  role text CHECK (role IN ('EMPLOYEE','BRANCH_MANAGER','HQ')),
  member_id uuid REFERENCES public.organization_members(id) ON DELETE CASCADE,
  report_key text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_export boolean NOT NULL DEFAULT true,
  own_only boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role IS NULL) <> (member_id IS NULL))
);
CREATE UNIQUE INDEX report_permissions_role_uq ON public.report_permissions(organization_id, role, report_key) WHERE role IS NOT NULL;
CREATE UNIQUE INDEX report_permissions_member_uq ON public.report_permissions(organization_id, member_id, report_key) WHERE member_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_permissions TO authenticated;
GRANT ALL ON public.report_permissions TO service_role;
ALTER TABLE public.report_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rp read" ON public.report_permissions FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));
CREATE POLICY "rp write" ON public.report_permissions FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

CREATE TABLE public.saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  owner_member_id uuid NOT NULL REFERENCES public.organization_members(id),
  name text NOT NULL,
  description text,
  report_key text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  shared_roles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_reports TO authenticated;
GRANT ALL ON public.saved_reports TO service_role;
ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sr read" ON public.saved_reports FOR SELECT TO authenticated USING (
  public.is_org_member(organization_id) AND (owner_member_id = public.current_member_id(organization_id) OR public.member_role(organization_id) = ANY(shared_roles) OR public.is_org_admin(organization_id)));
CREATE POLICY "sr insert" ON public.saved_reports FOR INSERT TO authenticated WITH CHECK (owner_member_id = public.current_member_id(organization_id));
CREATE POLICY "sr update" ON public.saved_reports FOR UPDATE TO authenticated USING (owner_member_id = public.current_member_id(organization_id) OR public.is_org_admin(organization_id));
CREATE POLICY "sr delete" ON public.saved_reports FOR DELETE TO authenticated USING (owner_member_id = public.current_member_id(organization_id) OR public.is_org_admin(organization_id));

CREATE TABLE public.report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  member_id uuid REFERENCES public.organization_members(id),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  report_key text NOT NULL,
  report_name text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  branch_ids uuid[] NOT NULL DEFAULT '{}',
  format text NOT NULL CHECK (format IN ('xlsx','csv','pdf')),
  row_count integer NOT NULL DEFAULT 0,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.report_runs TO authenticated;
GRANT ALL ON public.report_runs TO service_role;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "runs read" ON public.report_runs FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_org_admin(organization_id));
CREATE POLICY "runs insert" ON public.report_runs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));

CREATE TABLE public.cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid REFERENCES public.branches(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  membership_id uuid REFERENCES public.memberships(id),
  reason text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','HANDLED','REJECTED')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz,
  created_by uuid DEFAULT auth.uid()
);
GRANT SELECT, INSERT, UPDATE ON public.cancellation_requests TO authenticated;
GRANT ALL ON public.cancellation_requests TO service_role;
ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr read" ON public.cancellation_requests FOR SELECT TO authenticated USING (public.has_branch_access(organization_id, branch_id));
CREATE POLICY "cr insert" ON public.cancellation_requests FOR INSERT TO authenticated WITH CHECK (public.has_branch_access(organization_id, branch_id));
CREATE POLICY "cr update" ON public.cancellation_requests FOR UPDATE TO authenticated USING (public.is_org_manager(organization_id) AND public.has_branch_access(organization_id, branch_id));

CREATE OR REPLACE FUNCTION public.report_perm(_org uuid, _key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _role text := public.member_role(_org); _me uuid := public.current_member_id(_org); r record;
BEGIN
  IF _role IS NULL THEN RETURN jsonb_build_object('view',false,'export',false,'own',false); END IF;
  SELECT can_view, can_export, own_only INTO r FROM report_permissions WHERE organization_id=_org AND member_id=_me AND report_key=_key;
  IF FOUND THEN RETURN jsonb_build_object('view',r.can_view,'export',r.can_export,'own',r.own_only); END IF;
  SELECT can_view, can_export, own_only INTO r FROM report_permissions WHERE organization_id=_org AND role=_role AND report_key=_key;
  IF FOUND THEN RETURN jsonb_build_object('view',r.can_view,'export',r.can_export,'own',r.own_only); END IF;
  IF _role IN ('HQ','BRANCH_MANAGER') THEN RETURN jsonb_build_object('view',true,'export',true,'own',false); END IF;
  IF _key = ANY(ARRAY['purchases','active','lead_followup','leads_no_task','duplicate_leads','checkins','class_attendance','treatments']) THEN
    RETURN jsonb_build_object('view',true,'export',true,'own',false); END IF;
  IF _key IN ('lead_conversion','tasks_done') THEN RETURN jsonb_build_object('view',true,'export',true,'own',true); END IF;
  RETURN jsonb_build_object('view',false,'export',false,'own',false);
END $$;

CREATE OR REPLACE FUNCTION public.my_report_permissions(_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_object_agg(k, public.report_perm(_org, k)) FROM unnest(ARRAY[
    'cancellations','purchases','active','new_members','cancel_requests','debtors','receipts','sales_by_item',
    'lead_followup','leads_no_task','duplicate_leads','lead_conversion','staff_performance','tasks_done',
    'invalid_cards','checkins','class_attendance','treatments','_builder','_share']) k
$$;

CREATE OR REPLACE FUNCTION public.report_branches(_org uuid, _branches uuid[])
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(array_agg(id), '{}') FROM branches WHERE organization_id=_org AND deleted_at IS NULL
    AND public.has_branch_access(_org, id) AND (_branches IS NULL OR cardinality(_branches)=0 OR id = ANY(_branches))
$$;

CREATE OR REPLACE FUNCTION public.run_report(_org uuid, _key text, _from date, _to date, _branches uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p jsonb := public.report_perm(_org, _key); br uuid[] := public.report_branches(_org, _branches);
  me uuid := public.current_member_id(_org); own boolean; res jsonb; tz text := 'Asia/Jerusalem';
BEGIN
  IF NOT coalesce((p->>'view')::boolean,false) THEN RAISE EXCEPTION 'אין הרשאה לדוח זה' USING ERRCODE='42501'; END IF;
  own := coalesce((p->>'own')::boolean,false);
  IF _key = 'cancellations' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT c.id customer_id, c.full_name, c.phone, m.display_name plan, (m.cancelled_at AT TIME ZONE tz)::date requested,
      coalesce(m.end_date, (coalesce(m.cancelled_at,m.updated_at) AT TIME ZONE tz)::date) effective, m.cancel_reason reason, b.name branch
      FROM memberships m JOIN customers c ON c.id=m.customer_id LEFT JOIN branches b ON b.id=m.branch_id
      WHERE m.organization_id=_org AND m.status='CANCELLED' AND m.branch_id = ANY(br)
        AND (coalesce(m.cancelled_at,m.updated_at) AT TIME ZONE tz)::date BETWEEN _from AND _to ORDER BY m.updated_at DESC LIMIT 5000) t;
  ELSIF _key = 'purchases' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT c.id customer_id, c.full_name, c.phone, (p2.paid_at AT TIME ZONE tz)::date paid_on,
      coalesce(m.display_name,'רכישה') item, p2.amount,
      (SELECT om.display_name FROM leads l JOIN organization_members om ON om.id=l.assigned_member_id WHERE l.converted_customer_id=c.id LIMIT 1) seller,
      b.name branch
      FROM payments p2 JOIN customers c ON c.id=p2.customer_id LEFT JOIN memberships m ON m.id=p2.membership_id LEFT JOIN branches b ON b.id=p2.branch_id
      WHERE p2.organization_id=_org AND p2.status='PAID' AND p2.branch_id = ANY(br) AND (p2.paid_at AT TIME ZONE tz)::date BETWEEN _from AND _to
      ORDER BY p2.paid_at DESC LIMIT 5000) t;
  ELSIF _key = 'active' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT c.id customer_id, c.full_name, c.phone, m.display_name plan, m.start_date, m.end_date, m.status, b.name branch
      FROM memberships m JOIN customers c ON c.id=m.customer_id LEFT JOIN branches b ON b.id=m.branch_id
      WHERE m.organization_id=_org AND m.branch_id = ANY(br) AND m.status IN ('ACTIVE','FROZEN')
        AND m.start_date <= _to AND (m.end_date IS NULL OR m.end_date >= _to) AND c.deleted_at IS NULL
      ORDER BY c.full_name LIMIT 5000) t;
  ELSIF _key = 'new_members' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT c.id customer_id, c.full_name, c.phone, m.display_name plan, m.start_date, m.price, b.name branch
      FROM memberships m JOIN customers c ON c.id=m.customer_id LEFT JOIN branches b ON b.id=m.branch_id
      WHERE m.organization_id=_org AND m.branch_id = ANY(br) AND m.start_date BETWEEN _from AND _to ORDER BY m.start_date DESC LIMIT 5000) t;
  ELSIF _key = 'cancel_requests' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT c.id customer_id, c.full_name, c.phone, (r.requested_at AT TIME ZONE tz)::date requested, r.reason,
      CASE r.status WHEN 'OPEN' THEN 'פתוחה' WHEN 'HANDLED' THEN 'טופלה' ELSE 'נדחתה' END status, (r.handled_at AT TIME ZONE tz)::date handled, b.name branch
      FROM cancellation_requests r JOIN customers c ON c.id=r.customer_id LEFT JOIN branches b ON b.id=r.branch_id
      WHERE r.organization_id=_org AND r.branch_id = ANY(br) AND (r.requested_at AT TIME ZONE tz)::date BETWEEN _from AND _to ORDER BY r.requested_at DESC LIMIT 5000) t;
  ELSIF _key = 'debtors' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT c.id customer_id, c.full_name, c.phone, p2.amount, (coalesce(p2.due_at,p2.created_at) AT TIME ZONE tz)::date due_on,
      CASE p2.status WHEN 'FAILED' THEN 'נכשל' ELSE 'ממתין' END status, p2.failure_reason reason, b.name branch
      FROM payments p2 JOIN customers c ON c.id=p2.customer_id LEFT JOIN branches b ON b.id=p2.branch_id
      WHERE p2.organization_id=_org AND p2.branch_id = ANY(br) AND (p2.status='FAILED' OR (p2.status='PENDING' AND p2.due_at < now()))
        AND (coalesce(p2.due_at,p2.created_at) AT TIME ZONE tz)::date BETWEEN _from AND _to ORDER BY p2.due_at LIMIT 5000) t;
  ELSIF _key = 'receipts' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT c.id customer_id, (p2.paid_at AT TIME ZONE tz)::date paid_on, p2.external_reference receipt_no, c.full_name, p2.amount,
      c.payment_method method, b.name branch
      FROM payments p2 JOIN customers c ON c.id=p2.customer_id LEFT JOIN branches b ON b.id=p2.branch_id
      WHERE p2.organization_id=_org AND p2.status='PAID' AND p2.branch_id = ANY(br) AND (p2.paid_at AT TIME ZONE tz)::date BETWEEN _from AND _to
      ORDER BY p2.paid_at DESC LIMIT 5000) t;
  ELSIF _key = 'sales_by_item' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT coalesce(m.display_name,'אחר') item, count(*) sales_count,
      coalesce(sum(p2.amount) FILTER (WHERE p2.status <> 'CANCELLED'),0) sold, coalesce(sum(p2.amount) FILTER (WHERE p2.status='PAID'),0) collected,
      coalesce(sum(p2.amount) FILTER (WHERE p2.status IN ('PENDING','FAILED')),0) open_amount
      FROM payments p2 LEFT JOIN memberships m ON m.id=p2.membership_id
      WHERE p2.organization_id=_org AND p2.branch_id = ANY(br) AND (p2.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to
      GROUP BY 1 ORDER BY 3 DESC) t;
  ELSIF _key = 'lead_followup' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT l.id lead_id, om.display_name seller, l.full_name, l.phone, l.status,
      (l.last_activity_at AT TIME ZONE tz)::date last_contact,
      (SELECT (min(tk.due_at) AT TIME ZONE tz)::date FROM tasks tk WHERE tk.entity_type='lead' AND tk.entity_id=l.id AND tk.status IN ('OPEN','IN_PROGRESS') AND tk.deleted_at IS NULL) next_followup,
      (SELECT a.activity_type FROM activities a WHERE a.entity_type='lead' AND a.entity_id=l.id ORDER BY a.created_at DESC LIMIT 1) last_result
      FROM leads l LEFT JOIN organization_members om ON om.id=l.assigned_member_id
      WHERE l.organization_id=_org AND l.deleted_at IS NULL AND l.branch_id = ANY(br) AND (NOT own OR l.assigned_member_id=me)
        AND (l.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to ORDER BY om.display_name NULLS LAST, l.last_activity_at LIMIT 5000) t;
  ELSIF _key = 'leads_no_task' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT l.id lead_id, l.full_name, l.phone, (l.created_at AT TIME ZONE tz)::date created_on, l.source, l.status, b.name branch
      FROM leads l LEFT JOIN branches b ON b.id=l.branch_id
      WHERE l.organization_id=_org AND l.deleted_at IS NULL AND l.branch_id = ANY(br) AND l.status NOT IN ('WON','LOST') AND (NOT own OR l.assigned_member_id=me)
        AND (l.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to
        AND NOT EXISTS (SELECT 1 FROM tasks tk WHERE tk.entity_type='lead' AND tk.entity_id=l.id AND tk.deleted_at IS NULL)
      ORDER BY l.created_at DESC LIMIT 5000) t;
  ELSIF _key = 'duplicate_leads' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT l.id lead_id, l.normalized_phone dup_key, l.full_name, l.phone, (l.created_at AT TIME ZONE tz)::date created_on, l.status, b.name branch,
      count(*) OVER (PARTITION BY l.normalized_phone) dup_count
      FROM leads l LEFT JOIN branches b ON b.id=l.branch_id
      WHERE l.organization_id=_org AND l.deleted_at IS NULL AND l.branch_id = ANY(br) AND l.normalized_phone IS NOT NULL
        AND l.normalized_phone IN (SELECT normalized_phone FROM leads WHERE organization_id=_org AND deleted_at IS NULL AND normalized_phone IS NOT NULL
          AND branch_id = ANY(br) GROUP BY 1 HAVING count(*)>1 AND bool_or((created_at AT TIME ZONE tz)::date BETWEEN _from AND _to))
      ORDER BY l.normalized_phone, l.created_at LIMIT 5000) t;
  ELSIF _key = 'lead_conversion' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT b.name branch, count(DISTINCT coalesce(l.normalized_phone, l.id::text)) unique_leads,
      count(DISTINCT coalesce(l.normalized_phone, l.id::text)) FILTER (WHERE l.converted_customer_id IS NOT NULL OR l.status='WON') converted,
      round(100.0 * count(DISTINCT coalesce(l.normalized_phone, l.id::text)) FILTER (WHERE l.converted_customer_id IS NOT NULL OR l.status='WON')
        / nullif(count(DISTINCT coalesce(l.normalized_phone, l.id::text)),0), 1) rate
      FROM leads l JOIN branches b ON b.id=l.branch_id
      WHERE l.organization_id=_org AND l.deleted_at IS NULL AND l.branch_id = ANY(br) AND (NOT own OR l.assigned_member_id=me)
        AND (l.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to GROUP BY b.name ORDER BY b.name) t;
  ELSIF _key = 'staff_performance' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT om.display_name employee,
      (SELECT count(*) FROM tasks tk WHERE tk.assigned_member_id=om.id AND tk.branch_id = ANY(br) AND (tk.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to) tasks_handled,
      (SELECT count(*) FROM tasks tk WHERE tk.assigned_member_id=om.id AND tk.status='COMPLETED' AND tk.branch_id = ANY(br) AND (tk.completed_at AT TIME ZONE tz)::date BETWEEN _from AND _to) tasks_done,
      (SELECT count(*) FROM tasks tk WHERE tk.assigned_member_id=om.id AND coalesce(tk.entity_type,'')<>'lead' AND tk.branch_id = ANY(br) AND (tk.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to) non_sales_tasks,
      (SELECT count(*) FROM leads l WHERE l.assigned_member_id=om.id AND l.status='WON' AND l.branch_id = ANY(br) AND (l.updated_at AT TIME ZONE tz)::date BETWEEN _from AND _to) sales,
      (SELECT round(100.0*count(*) FILTER (WHERE l.status='WON')/nullif(count(*),0),1) FROM leads l WHERE l.assigned_member_id=om.id AND l.branch_id = ANY(br) AND (l.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to) conversion,
      (SELECT count(*) FROM activities a WHERE a.performed_by=om.user_id AND a.organization_id=_org AND a.activity_type IN ('CALL','WHATSAPP','MEETING','NOTE') AND a.branch_id = ANY(br) AND (a.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to) interactions,
      (SELECT count(DISTINCT a.entity_id) FROM activities a WHERE a.performed_by=om.user_id AND a.organization_id=_org AND a.entity_type='lead' AND a.activity_type IN ('CALL','WHATSAPP','MEETING','NOTE') AND a.branch_id = ANY(br) AND (a.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to) unique_contacts
      FROM organization_members om WHERE om.organization_id=_org AND om.status IN ('ACTIVE','INVITED')
        AND (om.role='HQ' OR EXISTS (SELECT 1 FROM member_branch_access a WHERE a.organization_member_id=om.id AND a.branch_id = ANY(br)))
        AND (NOT own OR om.id=me)
      ORDER BY om.display_name) t;
  ELSIF _key = 'tasks_done' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT om.display_name employee, tk.title, CASE tk.entity_type WHEN 'lead' THEN 'מכירות' WHEN 'customer' THEN 'לקוח' ELSE 'כללי' END task_type,
      (tk.created_at AT TIME ZONE tz)::date created_on, (tk.completed_at AT TIME ZONE tz)::date done_on, b.name branch
      FROM tasks tk LEFT JOIN organization_members om ON om.id=tk.assigned_member_id LEFT JOIN branches b ON b.id=tk.branch_id
      WHERE tk.organization_id=_org AND tk.deleted_at IS NULL AND tk.status='COMPLETED' AND tk.branch_id = ANY(br) AND (NOT own OR tk.assigned_member_id=me)
        AND (tk.completed_at AT TIME ZONE tz)::date BETWEEN _from AND _to ORDER BY tk.completed_at DESC LIMIT 5000) t;
  ELSIF _key = 'invalid_cards' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT * FROM (SELECT c.id customer_id, c.full_name, c.phone, b.name branch,
      concat_ws(' · ',
        (SELECT string_agg(cr.name || CASE ci.status WHEN 'EXPIRED' THEN ' (פג)' WHEN 'PENDING' THEN ' (ממתין)' ELSE ' (חסר)' END, ', ')
          FROM customer_compliance_items ci JOIN compliance_requirements cr ON cr.id=ci.requirement_id
          WHERE ci.customer_id=c.id AND ci.status IN ('MISSING','PENDING','EXPIRED')),
        CASE WHEN EXISTS (SELECT 1 FROM payments p2 WHERE p2.customer_id=c.id AND p2.status='FAILED') THEN 'תשלום שנכשל' END,
        CASE WHEN c.phone IS NULL OR c.national_id IS NULL THEN 'פרטים אישיים חסרים' END) problems
      FROM customers c LEFT JOIN branches b ON b.id=c.home_branch_id
      WHERE c.organization_id=_org AND c.deleted_at IS NULL AND c.home_branch_id = ANY(br)) x WHERE problems <> '' ORDER BY full_name LIMIT 5000) t;
  ELSIF _key = 'checkins' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT c.id customer_id, (ci.created_at AT TIME ZONE tz) at_time, c.full_name, b.name branch,
      CASE WHEN ci.allowed THEN 'מאושרת' ELSE 'נדחתה' END result, array_to_string(ci.reasons, ',') reasons, ci.method
      FROM check_ins ci JOIN customers c ON c.id=ci.customer_id LEFT JOIN branches b ON b.id=ci.branch_id
      WHERE ci.organization_id=_org AND ci.branch_id = ANY(br) AND (ci.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to
      ORDER BY ci.created_at DESC LIMIT 5000) t;
  ELSIF _key = 'class_attendance' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT ct.name class_name, bk.session_date, om.display_name instructor, b.name branch,
      count(*) FILTER (WHERE bk.status='BOOKED') booked, count(*) FILTER (WHERE bk.attended) attended,
      count(*) FILTER (WHERE bk.status='CANCELLED') cancelled, count(*) FILTER (WHERE bk.status='BOOKED' AND NOT bk.attended AND bk.session_date < current_date) no_show,
      count(*) FILTER (WHERE bk.status='WAITLIST') waitlist, ct.capacity
      FROM class_bookings bk JOIN class_templates ct ON ct.id=bk.template_id LEFT JOIN organization_members om ON om.id=ct.instructor_member_id LEFT JOIN branches b ON b.id=bk.branch_id
      WHERE bk.organization_id=_org AND bk.branch_id = ANY(br) AND bk.session_date BETWEEN _from AND _to
      GROUP BY ct.name, bk.session_date, om.display_name, b.name, ct.capacity ORDER BY bk.session_date DESC, ct.name LIMIT 5000) t;
  ELSIF _key = 'treatments' THEN
    RETURN jsonb_build_object('unavailable', true, 'rows', '[]'::jsonb, 'branches', to_jsonb(br));
  ELSE RAISE EXCEPTION 'דוח לא מוכר';
  END IF;
  RETURN jsonb_build_object('rows', coalesce(res,'[]'::jsonb), 'branches', to_jsonb(br), 'own', own);
END $$;

CREATE OR REPLACE FUNCTION public.run_custom_report(_org uuid, _source text, _columns text[], _from date, _to date, _branches uuid[] DEFAULT NULL, _status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE br uuid[] := public.report_branches(_org, _branches); src jsonb; cols text; c text; res jsonb;
  m jsonb := '{
   "customers":{"t":"customers","b":"home_branch_id","d":"x.joined_at","fin":false,"c":{"full_name":"x.full_name","phone":"x.phone","email":"x.email","status":"x.status","joined_at":"(x.joined_at at time zone ''Asia/Jerusalem'')::date","payment_method":"x.payment_method"}},
   "leads":{"t":"leads","b":"branch_id","d":"x.created_at","fin":false,"c":{"full_name":"x.full_name","phone":"x.phone","source":"x.source","status":"x.status","created_at":"(x.created_at at time zone ''Asia/Jerusalem'')::date","loss_reason":"x.loss_reason"}},
   "memberships":{"t":"memberships","b":"branch_id","d":"x.start_date::timestamp","fin":false,"c":{"customer_name":"(select full_name from public.customers where id=x.customer_id)","display_name":"x.display_name","price":"x.price","start_date":"x.start_date","end_date":"x.end_date","status":"x.status"}},
   "payments":{"t":"payments","b":"branch_id","d":"coalesce(x.paid_at,x.due_at,x.created_at)","fin":true,"c":{"customer_name":"(select full_name from public.customers where id=x.customer_id)","amount":"x.amount","status":"x.status","paid_at":"(x.paid_at at time zone ''Asia/Jerusalem'')::date","due_at":"(x.due_at at time zone ''Asia/Jerusalem'')::date","failure_reason":"x.failure_reason"}},
   "tasks":{"t":"tasks","b":"branch_id","d":"x.created_at","fin":false,"c":{"title":"x.title","assignee":"(select display_name from public.organization_members where id=x.assigned_member_id)","status":"x.status","priority":"x.priority","due_at":"(x.due_at at time zone ''Asia/Jerusalem'')::date","completed_at":"(x.completed_at at time zone ''Asia/Jerusalem'')::date"}},
   "check_ins":{"t":"check_ins","b":"branch_id","d":"x.created_at","fin":false,"c":{"customer_name":"(select full_name from public.customers where id=x.customer_id)","created_at":"(x.created_at at time zone ''Asia/Jerusalem'')","allowed":"x.allowed","reasons":"array_to_string(x.reasons, '','')"}}
  }'::jsonb;
BEGIN
  IF NOT coalesce((public.report_perm(_org,'_builder')->>'view')::boolean,false) THEN RAISE EXCEPTION 'אין הרשאה ליצירת דוחות' USING ERRCODE='42501'; END IF;
  src := m->_source;
  IF src IS NULL THEN RAISE EXCEPTION 'מקור לא מאושר'; END IF;
  IF (src->>'fin')::boolean AND NOT coalesce((public.report_perm(_org,'receipts')->>'view')::boolean,false) THEN RAISE EXCEPTION 'אין הרשאה למידע כספי' USING ERRCODE='42501'; END IF;
  FOREACH c IN ARRAY coalesce(_columns,'{}') LOOP
    IF NOT (src->'c') ? c THEN RAISE EXCEPTION 'שדה לא מאושר: %', c; END IF;
    cols := concat_ws(', ', cols, format('%s AS %I', src->'c'->>c, c));
  END LOOP;
  IF cols IS NULL THEN RAISE EXCEPTION 'יש לבחור עמודות'; END IF;
  EXECUTE format('SELECT jsonb_agg(t) FROM (SELECT %s FROM public.%I x WHERE x.organization_id=$1 AND x.%I = ANY($2) AND (%s AT TIME ZONE ''Asia/Jerusalem'')::date BETWEEN $3 AND $4 %s LIMIT 5000) t',
    cols, src->>'t', src->>'b', src->>'d', CASE WHEN _status IS NOT NULL AND _status <> '' THEN 'AND x.status = $5' ELSE '' END)
    INTO res USING _org, br, _from, _to, _status;
  RETURN jsonb_build_object('rows', coalesce(res,'[]'::jsonb), 'branches', to_jsonb(br));
END $$;

REVOKE EXECUTE ON FUNCTION public.report_perm(uuid,text), public.my_report_permissions(uuid), public.report_branches(uuid,uuid[]),
  public.run_report(uuid,text,date,date,uuid[]), public.run_custom_report(uuid,text,text[],date,date,uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_report_permissions(uuid), public.run_report(uuid,text,date,date,uuid[]),
  public.run_custom_report(uuid,text,text[],date,date,uuid[],text) TO authenticated;

CREATE POLICY "exports read own" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='report-exports' AND (storage.foldername(name))[2] = auth.uid()::text AND public.is_org_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "exports insert own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='report-exports' AND (storage.foldername(name))[2] = auth.uid()::text AND public.is_org_member(((storage.foldername(name))[1])::uuid));
