CREATE SEQUENCE public.ticket_no_seq START 1001;
ALTER TABLE public.approval_requests
  ADD COLUMN ticket_no bigint NOT NULL DEFAULT nextval('public.ticket_no_seq'),
  ADD COLUMN ticket_type text NOT NULL DEFAULT 'APPROVAL',
  ADD COLUMN status text NOT NULL DEFAULT 'OPEN',
  ADD COLUMN priority text NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN assigned_member_id uuid REFERENCES public.organization_members(id),
  ADD COLUMN due_at timestamptz,
  ADD COLUMN approver_level text NOT NULL DEFAULT 'MANAGER',
  ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id),
  ADD COLUMN supplier_name text,
  ADD COLUMN customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN product_id uuid REFERENCES public.inventory_products(id),
  ADD COLUMN task_id uuid REFERENCES public.tasks(id),
  ADD COLUMN location text,
  ADD COLUMN equipment text,
  ADD COLUMN quantity numeric,
  ADD COLUMN approval_kind text,
  ADD COLUMN close_summary text,
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by uuid REFERENCES public.organization_members(id);
ALTER SEQUENCE public.ticket_no_seq OWNED BY public.approval_requests.ticket_no;
CREATE UNIQUE INDEX approval_requests_ticket_no ON public.approval_requests(ticket_no);
UPDATE public.approval_requests SET ticket_type = CASE WHEN request_type='PRICE_QUOTE' THEN 'QUOTE' ELSE 'APPROVAL' END,
  approver_level='HQ',
  status = CASE approval_status WHEN 'APPROVED' THEN 'APPROVED' WHEN 'REJECTED' THEN 'REJECTED' WHEN 'PENDING_APPROVAL' THEN 'PENDING_APPROVAL' ELSE 'OPEN' END;
ALTER TABLE public.approval_requests
  ADD CONSTRAINT tickets_type_chk CHECK (ticket_type IN ('FAULT','PURCHASE','QUOTE','APPROVAL')),
  ADD CONSTRAINT tickets_status_chk CHECK (status IN ('OPEN','IN_PROGRESS','PENDING_APPROVAL','APPROVED','REJECTED','COMPLETED','CLOSED')),
  ADD CONSTRAINT tickets_priority_chk CHECK (priority IN ('HIGH','MEDIUM','LOW')),
  ADD CONSTRAINT tickets_level_chk CHECK (approver_level IN ('MANAGER','HQ'));

CREATE TABLE public.ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  ticket_id uuid NOT NULL REFERENCES public.approval_requests(id),
  event_type text NOT NULL,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid REFERENCES public.organization_members(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_events_ticket ON public.ticket_events(ticket_id, created_at);
CREATE TABLE public.ticket_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  ticket_id uuid NOT NULL REFERENCES public.approval_requests(id),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by uuid REFERENCES public.organization_members(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ticket_events, public.ticket_files TO authenticated;
GRANT ALL ON public.ticket_events, public.ticket_files TO service_role;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_files ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_ticket(_t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM approval_requests t WHERE t.id=_t AND (
    is_org_admin(t.organization_id)
    OR (has_branch_access(t.organization_id, t.branch_id) AND (is_org_manager(t.organization_id)
        OR t.requested_by = current_member_id(t.organization_id) OR t.assigned_member_id = current_member_id(t.organization_id)))))
$$;
CREATE OR REPLACE FUNCTION public.can_manage_ticket(_t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM approval_requests t WHERE t.id=_t AND (is_org_admin(t.organization_id)
    OR (is_org_manager(t.organization_id) AND has_branch_access(t.organization_id, t.branch_id))))
$$;
CREATE POLICY te_read ON public.ticket_events FOR SELECT TO authenticated USING (public.can_view_ticket(ticket_id));
CREATE POLICY tf_read ON public.ticket_files FOR SELECT TO authenticated USING (public.can_view_ticket(ticket_id));

DROP POLICY approvals_select ON public.approval_requests;
DROP POLICY approvals_insert ON public.approval_requests;
DROP POLICY approvals_update ON public.approval_requests;
CREATE POLICY tickets_select ON public.approval_requests FOR SELECT TO authenticated USING (public.can_view_ticket(id));

CREATE OR REPLACE FUNCTION public._ticket_log(_t uuid, _type text, _body text, _meta jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO ticket_events(organization_id, ticket_id, event_type, body, metadata, performed_by)
  SELECT t.organization_id, t.id, _type, _body, coalesce(_meta,'{}'::jsonb), current_member_id(t.organization_id) FROM approval_requests t WHERE t.id=_t;
$$;
REVOKE ALL ON FUNCTION public._ticket_log(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_ticket(_org uuid, _branch uuid, _type text, _title text, _details text, _priority text, _data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _me uuid := current_member_id(_org); _needs boolean := _type IN ('QUOTE','APPROVAL','PURCHASE');
BEGIN
  IF _me IS NULL OR NOT has_branch_access(_org, _branch) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _type NOT IN ('FAULT','PURCHASE','QUOTE','APPROVAL') THEN RAISE EXCEPTION 'סוג קריאה לא תקין'; END IF;
  IF coalesce(trim(_title),'')='' OR coalesce(trim(_details),'')='' THEN RAISE EXCEPTION 'נושא ותיאור הם שדות חובה'; END IF;
  IF _priority NOT IN ('HIGH','MEDIUM','LOW') THEN RAISE EXCEPTION 'עדיפות לא תקינה'; END IF;
  INSERT INTO approval_requests(organization_id, branch_id, request_type, ticket_type, title, details, priority, requested_by, submitted_at,
    status, approval_status, approver_level, assigned_member_id, due_at, amount, supplier_id, supplier_name, customer_id, product_id,
    location, equipment, quantity, approval_kind)
  VALUES (_org, _branch, _type, _type, trim(_title), trim(_details), _priority, _me, now(),
    CASE WHEN _needs THEN 'PENDING_APPROVAL' ELSE 'OPEN' END, CASE WHEN _needs THEN 'PENDING_APPROVAL' ELSE 'DRAFT' END,
    CASE WHEN _data->>'approver_level'='HQ' THEN 'HQ' ELSE 'MANAGER' END,
    nullif(_data->>'assigned_member_id','')::uuid, nullif(_data->>'due_at','')::timestamptz, nullif(_data->>'amount','')::numeric,
    nullif(_data->>'supplier_id','')::uuid, nullif(trim(_data->>'supplier_name'),''), nullif(_data->>'customer_id','')::uuid,
    nullif(_data->>'product_id','')::uuid, nullif(trim(_data->>'location'),''), nullif(trim(_data->>'equipment'),''),
    nullif(_data->>'quantity','')::numeric, nullif(trim(_data->>'approval_kind'),''))
  RETURNING id INTO _id;
  PERFORM _ticket_log(_id, 'CREATED', 'הקריאה נפתחה', '{}'::jsonb);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.ticket_update(_t uuid, _field text, _value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; mgr boolean := can_manage_ticket(_t); me uuid;
BEGIN
  SELECT * INTO t FROM approval_requests WHERE id=_t FOR UPDATE;
  IF t.id IS NULL OR NOT can_view_ticket(_t) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  me := current_member_id(t.organization_id);
  IF t.status='CLOSED' AND NOT (_field='status' AND _value='OPEN' AND mgr) THEN RAISE EXCEPTION 'הקריאה סגורה'; END IF;
  IF _field='assigned' THEN
    IF NOT mgr THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    UPDATE approval_requests SET assigned_member_id=nullif(_value,'')::uuid, updated_at=now() WHERE id=_t;
    PERFORM _ticket_log(_t,'ASSIGNED',NULL,jsonb_build_object('from',t.assigned_member_id,'to',nullif(_value,'')));
  ELSIF _field='priority' THEN
    IF NOT mgr THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF _value NOT IN ('HIGH','MEDIUM','LOW') THEN RAISE EXCEPTION 'עדיפות לא תקינה'; END IF;
    UPDATE approval_requests SET priority=_value, updated_at=now() WHERE id=_t;
    PERFORM _ticket_log(_t,'PRIORITY',NULL,jsonb_build_object('from',t.priority,'to',_value));
  ELSIF _field='due' THEN
    IF NOT mgr THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    UPDATE approval_requests SET due_at=nullif(_value,'')::timestamptz, updated_at=now() WHERE id=_t;
    PERFORM _ticket_log(_t,'DUE',NULL,jsonb_build_object('from',t.due_at,'to',nullif(_value,'')));
  ELSIF _field='status' THEN
    IF _value IN ('APPROVED','REJECTED','CLOSED') THEN RAISE EXCEPTION 'יש להשתמש בפעולת אישור/דחייה/סגירה'; END IF;
    IF _value NOT IN ('OPEN','IN_PROGRESS','PENDING_APPROVAL','COMPLETED') THEN RAISE EXCEPTION 'סטטוס לא תקין'; END IF;
    IF NOT mgr AND NOT (t.assigned_member_id = me AND _value IN ('IN_PROGRESS','COMPLETED')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    UPDATE approval_requests SET status=_value, updated_at=now(),
      approval_status = CASE WHEN _value='PENDING_APPROVAL' THEN 'PENDING_APPROVAL' ELSE approval_status END,
      closed_at = CASE WHEN t.status='CLOSED' THEN NULL ELSE closed_at END
    WHERE id=_t;
    PERFORM _ticket_log(_t, CASE WHEN t.status='CLOSED' THEN 'REOPENED' ELSE 'STATUS' END, NULL, jsonb_build_object('from',t.status,'to',_value));
  ELSE RAISE EXCEPTION 'שדה לא תקין';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ticket_decide(_t uuid, _approve boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM approval_requests WHERE id=_t FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF t.approver_level='HQ' AND NOT is_org_admin(t.organization_id) THEN RAISE EXCEPTION 'נדרש אישור מטה'; END IF;
  IF NOT can_manage_ticket(_t) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF t.requested_by = current_member_id(t.organization_id) AND NOT is_org_admin(t.organization_id) THEN RAISE EXCEPTION 'לא ניתן לאשר בקשה שפתחת'; END IF;
  IF t.status <> 'PENDING_APPROVAL' THEN RAISE EXCEPTION 'הקריאה אינה ממתינה לאישור'; END IF;
  IF NOT _approve AND coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'חובה לציין סיבת דחייה'; END IF;
  UPDATE approval_requests SET status = CASE WHEN _approve THEN 'APPROVED' ELSE 'REJECTED' END,
    approval_status = CASE WHEN _approve THEN 'APPROVED' ELSE 'REJECTED' END,
    approved_by=current_member_id(t.organization_id), approved_at=now(), rejection_reason = CASE WHEN _approve THEN NULL ELSE trim(_reason) END, updated_at=now()
  WHERE id=_t;
  PERFORM _ticket_log(_t, CASE WHEN _approve THEN 'APPROVED' ELSE 'REJECTED' END, nullif(trim(_reason),''), '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.ticket_close(_t uuid, _summary text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM approval_requests WHERE id=_t FOR UPDATE;
  IF t.id IS NULL OR NOT can_manage_ticket(_t) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF t.status='CLOSED' THEN RAISE EXCEPTION 'הקריאה כבר סגורה'; END IF;
  IF t.status='PENDING_APPROVAL' THEN RAISE EXCEPTION 'יש לאשר או לדחות לפני סגירה'; END IF;
  IF coalesce(trim(_summary),'')='' THEN RAISE EXCEPTION 'חובה להזין סיכום טיפול'; END IF;
  UPDATE approval_requests SET status='CLOSED', close_summary=trim(_summary), closed_at=now(), closed_by=current_member_id(t.organization_id), updated_at=now() WHERE id=_t;
  PERFORM _ticket_log(_t, 'CLOSED', trim(_summary), jsonb_build_object('from', t.status));
END $$;

CREATE OR REPLACE FUNCTION public.ticket_comment(_t uuid, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT can_view_ticket(_t) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF coalesce(trim(_body),'')='' THEN RAISE EXCEPTION 'ההערה ריקה'; END IF;
  PERFORM _ticket_log(_t, 'COMMENT', trim(_body), '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.ticket_add_file(_t uuid, _path text, _name text, _mime text, _size integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM approval_requests WHERE id=_t;
  IF t.id IS NULL OR NOT can_view_ticket(_t) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _path NOT LIKE t.organization_id::text||'/'||t.id::text||'/%' THEN RAISE EXCEPTION 'נתיב קובץ לא תקין'; END IF;
  IF _mime NOT IN ('image/jpeg','image/png','image/webp','image/heic','application/pdf') THEN RAISE EXCEPTION 'סוג קובץ לא נתמך (תמונה או PDF בלבד)'; END IF;
  IF _size > 10*1024*1024 THEN RAISE EXCEPTION 'הקובץ גדול מ־10MB'; END IF;
  INSERT INTO ticket_files(organization_id, ticket_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (t.organization_id, t.id, _path, _name, _mime, _size, current_member_id(t.organization_id));
  PERFORM _ticket_log(_t, 'FILE', _name, '{}'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.create_ticket(uuid,uuid,text,text,text,text,jsonb), public.ticket_update(uuid,text,text), public.ticket_decide(uuid,boolean,text),
  public.ticket_close(uuid,text), public.ticket_comment(uuid,text), public.ticket_add_file(uuid,text,text,text,integer), public.can_view_ticket(uuid), public.can_manage_ticket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ticket(uuid,uuid,text,text,text,text,jsonb), public.ticket_update(uuid,text,text), public.ticket_decide(uuid,boolean,text),
  public.ticket_close(uuid,text), public.ticket_comment(uuid,text), public.ticket_add_file(uuid,text,text,text,integer), public.can_view_ticket(uuid), public.can_manage_ticket(uuid) TO authenticated;

CREATE POLICY "ticket files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='ticket-files' AND public.can_view_ticket(((storage.foldername(name))[2])::uuid));
CREATE POLICY "ticket files upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='ticket-files' AND public.can_view_ticket(((storage.foldername(name))[2])::uuid));