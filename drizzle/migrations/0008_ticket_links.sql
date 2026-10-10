CREATE INDEX IF NOT EXISTS approval_requests_customer_idx ON public.approval_requests(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS approval_requests_task_idx ON public.approval_requests(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS approval_requests_product_idx ON public.approval_requests(product_id) WHERE product_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._ticket_link_ok(_org uuid, _kind text, _id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _id IS NULL OR CASE _kind
    WHEN 'customer' THEN EXISTS(SELECT 1 FROM customers WHERE id=_id AND organization_id=_org AND deleted_at IS NULL)
    WHEN 'task' THEN EXISTS(SELECT 1 FROM tasks WHERE id=_id AND organization_id=_org AND deleted_at IS NULL AND (branch_id IS NULL OR has_branch_access(_org, branch_id)))
    WHEN 'product' THEN EXISTS(SELECT 1 FROM inventory_products WHERE id=_id AND organization_id=_org AND deleted_at IS NULL)
    ELSE false END
$$;
REVOKE EXECUTE ON FUNCTION public._ticket_link_ok(uuid,text,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_ticket(_org uuid, _branch uuid, _type text, _title text, _details text, _priority text, _data jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _id uuid; _me uuid := current_member_id(_org); _needs boolean := _type IN ('QUOTE','APPROVAL','PURCHASE');
  _c uuid := nullif(_data->>'customer_id','')::uuid; _tk uuid := nullif(_data->>'task_id','')::uuid; _p uuid := nullif(_data->>'product_id','')::uuid;
BEGIN
  IF _me IS NULL OR NOT has_branch_access(_org, _branch) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _type NOT IN ('FAULT','PURCHASE','QUOTE','APPROVAL') THEN RAISE EXCEPTION 'סוג קריאה לא תקין'; END IF;
  IF coalesce(trim(_title),'')='' OR coalesce(trim(_details),'')='' THEN RAISE EXCEPTION 'נושא ותיאור הם שדות חובה'; END IF;
  IF _priority NOT IN ('HIGH','MEDIUM','LOW') THEN RAISE EXCEPTION 'עדיפות לא תקינה'; END IF;
  IF NOT _ticket_link_ok(_org,'customer',_c) OR NOT _ticket_link_ok(_org,'task',_tk) OR NOT _ticket_link_ok(_org,'product',_p) THEN RAISE EXCEPTION 'הפריט המקושר לא נמצא'; END IF;
  INSERT INTO approval_requests(organization_id, branch_id, request_type, ticket_type, title, details, priority, requested_by, submitted_at,
    status, approval_status, approver_level, assigned_member_id, due_at, amount, supplier_id, supplier_name, customer_id, product_id, task_id,
    location, equipment, quantity, approval_kind)
  VALUES (_org, _branch, _type, _type, trim(_title), trim(_details), _priority, _me, now(),
    CASE WHEN _needs THEN 'PENDING_APPROVAL' ELSE 'OPEN' END, CASE WHEN _needs THEN 'PENDING_APPROVAL' ELSE 'DRAFT' END,
    CASE WHEN _data->>'approver_level'='HQ' THEN 'HQ' ELSE 'MANAGER' END,
    nullif(_data->>'assigned_member_id','')::uuid, nullif(_data->>'due_at','')::timestamptz, nullif(_data->>'amount','')::numeric,
    nullif(_data->>'supplier_id','')::uuid, nullif(trim(_data->>'supplier_name'),''), _c, _p, _tk,
    nullif(trim(_data->>'location'),''), nullif(trim(_data->>'equipment'),''),
    nullif(_data->>'quantity','')::numeric, nullif(trim(_data->>'approval_kind'),''))
  RETURNING id INTO _id;
  PERFORM _ticket_log(_id, 'CREATED', 'הקריאה נפתחה', '{}'::jsonb);
  RETURN _id;
END $function$;

CREATE OR REPLACE FUNCTION public.ticket_update(_t uuid, _field text, _value text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t record; mgr boolean := can_manage_ticket(_t); me uuid; v uuid;
BEGIN
  SELECT * INTO t FROM approval_requests WHERE id=_t FOR UPDATE;
  IF t.id IS NULL OR NOT can_view_ticket(_t) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  me := current_member_id(t.organization_id);
  IF t.status='CLOSED' AND NOT (_field='status' AND _value='OPEN' AND mgr) THEN RAISE EXCEPTION 'הקריאה סגורה'; END IF;
  IF _field IN ('customer','task','product') THEN
    IF NOT (mgr OR t.requested_by=me OR t.assigned_member_id=me) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    v := nullif(_value,'')::uuid;
    IF NOT _ticket_link_ok(t.organization_id,_field,v) THEN RAISE EXCEPTION 'הפריט המקושר לא נמצא'; END IF;
    IF _field='customer' THEN UPDATE approval_requests SET customer_id=v, updated_at=now() WHERE id=_t;
      PERFORM _ticket_log(_t,'LINKED',NULL,jsonb_build_object('kind','customer','from',t.customer_id,'to',v));
    ELSIF _field='task' THEN UPDATE approval_requests SET task_id=v, updated_at=now() WHERE id=_t;
      PERFORM _ticket_log(_t,'LINKED',NULL,jsonb_build_object('kind','task','from',t.task_id,'to',v));
    ELSE UPDATE approval_requests SET product_id=v, updated_at=now() WHERE id=_t;
      PERFORM _ticket_log(_t,'LINKED',NULL,jsonb_build_object('kind','product','from',t.product_id,'to',v));
    END IF;
  ELSIF _field='assigned' THEN
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
END $function$;