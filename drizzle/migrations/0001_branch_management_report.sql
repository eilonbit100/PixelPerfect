
-- Customers counted as active members on day d in branches br (distinct, so no double counting)
CREATE OR REPLACE FUNCTION public._bm_active(_org uuid, br uuid[], d date)
RETURNS TABLE(customer_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT m.customer_id FROM memberships m JOIN customers c ON c.id=m.customer_id AND c.deleted_at IS NULL
  WHERE m.organization_id=_org AND (br IS NULL OR m.branch_id = ANY(br)) AND m.status <> 'PENDING'
    AND m.start_date <= d AND (m.end_date IS NULL OR m.end_date >= d)
    AND NOT (m.status='CANCELLED' AND (m.cancelled_at IS NULL OR (m.cancelled_at AT TIME ZONE 'Asia/Jerusalem')::date <= d))
$$;

CREATE OR REPLACE FUNCTION public._bm_kpis(_org uuid, br uuid[], _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE tz text := 'Asia/Jerusalem'; r jsonb; a_start int; a_end int; joins int; renewals int; tin int; leavers int; tout int;
BEGIN
  SELECT count(*) INTO a_start FROM public._bm_active(_org, br, _from - 1);
  SELECT count(*) INTO a_end FROM public._bm_active(_org, br, _to);
  -- first-ever membership in the organization started in the period
  SELECT count(DISTINCT m.customer_id) INTO joins FROM memberships m WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND m.status<>'PENDING'
    AND m.start_date BETWEEN _from AND _to AND NOT EXISTS (SELECT 1 FROM memberships p WHERE p.customer_id=m.customer_id AND p.id<>m.id AND p.status<>'PENDING' AND (p.start_date < m.start_date OR (p.start_date=m.start_date AND p.created_at < m.created_at)));
  SELECT count(DISTINCT m.customer_id) INTO renewals FROM memberships m WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND m.status<>'PENDING'
    AND m.start_date BETWEEN _from AND _to AND EXISTS (SELECT 1 FROM memberships p WHERE p.customer_id=m.customer_id AND p.id<>m.id AND p.branch_id=ANY(br) AND p.status<>'PENDING' AND p.start_date < m.start_date);
  SELECT count(DISTINCT m.customer_id) INTO tin FROM memberships m WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND m.status<>'PENDING'
    AND m.start_date BETWEEN _from AND _to
    AND EXISTS (SELECT 1 FROM memberships p WHERE p.customer_id=m.customer_id AND p.status<>'PENDING' AND p.start_date < m.start_date AND NOT (p.branch_id=ANY(br)))
    AND NOT EXISTS (SELECT 1 FROM memberships p WHERE p.customer_id=m.customer_id AND p.id<>m.id AND p.status<>'PENDING' AND p.start_date < m.start_date AND p.branch_id=ANY(br));
  -- active at start, not active here at end: left the club, or moved to another branch
  SELECT count(*) FILTER (WHERE o.customer_id IS NULL), count(*) FILTER (WHERE o.customer_id IS NOT NULL) INTO leavers, tout
    FROM public._bm_active(_org, br, _from - 1) s
    LEFT JOIN public._bm_active(_org, br, _to) e ON e.customer_id=s.customer_id
    LEFT JOIN public._bm_active(_org, NULL, _to) o ON o.customer_id=s.customer_id
    WHERE e.customer_id IS NULL;
  SELECT jsonb_build_object(
    'active_start', a_start, 'active_end', a_end,
    'growth_pct', CASE WHEN a_start > 0 THEN round((a_end - a_start) * 100.0 / a_start, 1) END,
    'joins', joins, 'renewals', renewals, 'transfers_in', tin, 'leavers', leavers, 'transfers_out', tout, 'net', joins - leavers,
    'frozen_end', (SELECT count(DISTINCT f.customer_id) FROM customer_freezes f JOIN memberships m ON m.id=f.membership_id WHERE m.branch_id=ANY(br) AND _to BETWEEN f.start_date AND f.end_date),
    'freezes_started', (SELECT count(*) FROM customer_freezes f JOIN memberships m ON m.id=f.membership_id WHERE m.branch_id=ANY(br) AND f.start_date BETWEEN _from AND _to),
    'sold_count', (SELECT count(*) FROM memberships m WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND (m.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to),
    'sold_amount', (SELECT coalesce(sum(m.price),0) FROM memberships m WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND (m.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to),
    'collected', (SELECT coalesce(sum(amount),0) FROM payments WHERE organization_id=_org AND branch_id=ANY(br) AND status='PAID' AND (paid_at AT TIME ZONE tz)::date BETWEEN _from AND _to),
    'collected_count', (SELECT count(*) FROM payments WHERE organization_id=_org AND branch_id=ANY(br) AND status='PAID' AND (paid_at AT TIME ZONE tz)::date BETWEEN _from AND _to),
    'debt', (SELECT coalesce(sum(amount),0) FROM payments WHERE organization_id=_org AND branch_id=ANY(br) AND status IN ('FAILED','PENDING') AND (coalesce(due_at,created_at) AT TIME ZONE tz)::date <= _to),
    'debt_count', (SELECT count(*) FROM payments WHERE organization_id=_org AND branch_id=ANY(br) AND status IN ('FAILED','PENDING') AND (coalesce(due_at,created_at) AT TIME ZONE tz)::date <= _to),
    'cancelled', (SELECT count(*) FROM memberships WHERE organization_id=_org AND branch_id=ANY(br) AND status='CANCELLED' AND (cancelled_at AT TIME ZONE tz)::date BETWEEN _from AND _to),
    'cancelled_no_date', (SELECT count(*) FROM memberships WHERE organization_id=_org AND branch_id=ANY(br) AND status='CANCELLED' AND cancelled_at IS NULL),
    'req_total', (SELECT count(*) FROM cancellation_requests WHERE organization_id=_org AND branch_id=ANY(br) AND (requested_at AT TIME ZONE tz)::date BETWEEN _from AND _to),
    'req_open', (SELECT count(*) FROM cancellation_requests WHERE organization_id=_org AND branch_id=ANY(br) AND status='OPEN' AND (requested_at AT TIME ZONE tz)::date BETWEEN _from AND _to),
    'req_completed', (SELECT count(*) FROM cancellation_requests r JOIN memberships m ON m.id=r.membership_id WHERE r.organization_id=_org AND r.branch_id=ANY(br) AND r.status<>'OPEN' AND m.status='CANCELLED' AND (r.requested_at AT TIME ZONE tz)::date BETWEEN _from AND _to),
    'req_handled', (SELECT count(*) FROM cancellation_requests r LEFT JOIN memberships m ON m.id=r.membership_id WHERE r.organization_id=_org AND r.branch_id=ANY(br) AND r.status<>'OPEN' AND m.status IS DISTINCT FROM 'CANCELLED' AND (r.requested_at AT TIME ZONE tz)::date BETWEEN _from AND _to)
  ) INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public._bm_active(uuid, uuid[], date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._bm_kpis(uuid, uuid[], date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.branch_management_report(_org uuid, _from date, _to date, _branches uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p jsonb := public.report_perm(_org, 'branch_mgmt'); br uuid[] := public.report_branches(_org, _branches);
  tz text := 'Asia/Jerusalem'; len int; pf date; pt date; det jsonb; by_branch jsonb;
BEGIN
  IF NOT coalesce((p->>'view')::boolean,false) THEN RAISE EXCEPTION 'אין הרשאה לדוח זה' USING ERRCODE='42501'; END IF;
  IF _to < _from THEN RAISE EXCEPTION 'טווח תאריכים לא תקין'; END IF;
  len := _to - _from + 1; pt := _from - 1; pf := _from - len;
  IF cardinality(br) > 1 THEN
    SELECT jsonb_agg(jsonb_build_object('branch_id', b.id, 'branch', b.name) || public._bm_kpis(_org, ARRAY[b.id], _from, _to) ORDER BY b.name)
      INTO by_branch FROM branches b WHERE b.id = ANY(br);
  END IF;
  det := jsonb_build_object(
    'sales', (SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT c.id customer_id, c.full_name, (m.created_at AT TIME ZONE tz)::date purchased, m.start_date, m.display_name plan, m.price, m.status, b.name branch
      FROM memberships m JOIN customers c ON c.id=m.customer_id LEFT JOIN branches b ON b.id=m.branch_id
      WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND (m.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to ORDER BY m.created_at DESC LIMIT 2000) t),
    'cancellations', (SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT c.id customer_id, c.full_name, m.display_name plan, (m.cancelled_at AT TIME ZONE tz)::date cancelled_on, m.end_date, m.cancel_reason reason, b.name branch
      FROM memberships m JOIN customers c ON c.id=m.customer_id LEFT JOIN branches b ON b.id=m.branch_id
      WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND m.status='CANCELLED' AND (m.cancelled_at AT TIME ZONE tz)::date BETWEEN _from AND _to ORDER BY m.cancelled_at DESC LIMIT 2000) t),
    'requests', (SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT c.id customer_id, c.full_name, (r.requested_at AT TIME ZONE tz)::date requested, r.reason,
      CASE WHEN r.status='OPEN' THEN 'פתוחה' WHEN m.status='CANCELLED' THEN 'הושלמה' ELSE 'טופלה' END status, (r.handled_at AT TIME ZONE tz)::date handled, b.name branch
      FROM cancellation_requests r JOIN customers c ON c.id=r.customer_id LEFT JOIN memberships m ON m.id=r.membership_id LEFT JOIN branches b ON b.id=r.branch_id
      WHERE r.organization_id=_org AND r.branch_id=ANY(br) AND (r.requested_at AT TIME ZONE tz)::date BETWEEN _from AND _to ORDER BY r.requested_at DESC LIMIT 2000) t),
    'movement', (SELECT coalesce(jsonb_agg(t ORDER BY t.on_date DESC),'[]') FROM (
      SELECT DISTINCT ON (m.customer_id) c.id customer_id, c.full_name, m.start_date on_date, m.display_name plan, b.name branch,
        CASE WHEN EXISTS (SELECT 1 FROM memberships p WHERE p.customer_id=m.customer_id AND p.id<>m.id AND p.status<>'PENDING' AND p.start_date < m.start_date AND p.branch_id=ANY(br)) THEN 'חידוש'
             WHEN EXISTS (SELECT 1 FROM memberships p WHERE p.customer_id=m.customer_id AND p.id<>m.id AND p.status<>'PENDING' AND (p.start_date < m.start_date OR (p.start_date=m.start_date AND p.created_at < m.created_at))) THEN 'מעבר מסניף אחר'
             ELSE 'הצטרפות' END kind
      FROM memberships m JOIN customers c ON c.id=m.customer_id LEFT JOIN branches b ON b.id=m.branch_id
      WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND m.status<>'PENDING' AND m.start_date BETWEEN _from AND _to
      UNION ALL
      SELECT c.id, c.full_name, _to, NULL, NULL, CASE WHEN o.customer_id IS NULL THEN 'עזיבה' ELSE 'מעבר לסניף אחר' END
      FROM public._bm_active(_org, br, _from - 1) s JOIN customers c ON c.id=s.customer_id
      LEFT JOIN public._bm_active(_org, br, _to) e ON e.customer_id=s.customer_id
      LEFT JOIN public._bm_active(_org, NULL, _to) o ON o.customer_id=s.customer_id
      WHERE e.customer_id IS NULL
      UNION ALL
      SELECT c.id, c.full_name, f.start_date, m.display_name, b.name, 'הקפאה'
      FROM customer_freezes f JOIN memberships m ON m.id=f.membership_id JOIN customers c ON c.id=f.customer_id LEFT JOIN branches b ON b.id=m.branch_id
      WHERE m.branch_id=ANY(br) AND f.start_date BETWEEN _from AND _to) t),
    'payments', (SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT c.id customer_id, c.full_name, (p2.paid_at AT TIME ZONE tz)::date paid_on, coalesce(m.display_name,'רכישה') item, p2.amount, b.name branch
      FROM payments p2 JOIN customers c ON c.id=p2.customer_id LEFT JOIN memberships m ON m.id=p2.membership_id LEFT JOIN branches b ON b.id=p2.branch_id
      WHERE p2.organization_id=_org AND p2.branch_id=ANY(br) AND p2.status='PAID' AND (p2.paid_at AT TIME ZONE tz)::date BETWEEN _from AND _to ORDER BY p2.paid_at DESC LIMIT 2000) t),
    'debts', (SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT c.id customer_id, c.full_name, (coalesce(p2.due_at,p2.created_at) AT TIME ZONE tz)::date due_on, p2.amount, p2.status, p2.failure_reason, b.name branch
      FROM payments p2 JOIN customers c ON c.id=p2.customer_id LEFT JOIN branches b ON b.id=p2.branch_id
      WHERE p2.organization_id=_org AND p2.branch_id=ANY(br) AND p2.status IN ('FAILED','PENDING') AND (coalesce(p2.due_at,p2.created_at) AT TIME ZONE tz)::date <= _to ORDER BY 3 LIMIT 2000) t)
  );
  RETURN jsonb_build_object('branches', to_jsonb(br), 'from', _from, 'to', _to, 'prev_from', pf, 'prev_to', pt,
    'current', public._bm_kpis(_org, br, _from, _to), 'previous', public._bm_kpis(_org, br, pf, pt),
    'by_branch', by_branch, 'details', det, 'export', coalesce((p->>'export')::boolean,false));
END $$;

GRANT EXECUTE ON FUNCTION public.branch_management_report(uuid, date, date, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_report_permissions(_org uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_object_agg(k, public.report_perm(_org, k)) FROM unnest(ARRAY[
    'branch_mgmt','cancellations','purchases','active','new_members','cancel_requests','debtors','receipts','sales_by_item',
    'lead_followup','leads_no_task','duplicate_leads','lead_conversion','staff_performance','tasks_done',
    'invalid_cards','checkins','class_attendance','treatments','_builder','_share']) k
$$;
