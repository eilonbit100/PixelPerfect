CREATE OR REPLACE FUNCTION public._bm_kpis(_org uuid, br uuid[], _from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE tz text := 'Asia/Jerusalem'; r jsonb; a_start int; a_end int; joins int; renewals int; tin int; leavers int; tout int;
BEGIN
  SELECT count(*) INTO a_start FROM public._bm_active(_org, br, _from - 1);
  SELECT count(*) INTO a_end FROM public._bm_active(_org, br, _to);
  SELECT count(DISTINCT m.customer_id) INTO joins FROM memberships m WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND m.status<>'PENDING'
    AND m.start_date BETWEEN _from AND _to AND NOT EXISTS (SELECT 1 FROM memberships p WHERE p.customer_id=m.customer_id AND p.id<>m.id AND p.status<>'PENDING' AND (p.start_date < m.start_date OR (p.start_date=m.start_date AND p.created_at < m.created_at)));
  SELECT count(DISTINCT m.customer_id) INTO renewals FROM memberships m WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND m.status<>'PENDING'
    AND m.start_date BETWEEN _from AND _to AND EXISTS (SELECT 1 FROM memberships p WHERE p.customer_id=m.customer_id AND p.id<>m.id AND p.branch_id=ANY(br) AND p.status<>'PENDING' AND p.start_date < m.start_date);
  SELECT count(DISTINCT m.customer_id) INTO tin FROM memberships m WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND m.status<>'PENDING'
    AND m.start_date BETWEEN _from AND _to
    AND EXISTS (SELECT 1 FROM memberships p WHERE p.customer_id=m.customer_id AND p.status<>'PENDING' AND p.start_date < m.start_date AND NOT (p.branch_id=ANY(br)))
    AND NOT EXISTS (SELECT 1 FROM memberships p WHERE p.customer_id=m.customer_id AND p.id<>m.id AND p.status<>'PENDING' AND p.start_date < m.start_date AND p.branch_id=ANY(br));
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
  -- Undated cancellations make churn-based metrics unreliable: don't show them
  IF (r->>'cancelled_no_date')::int > 0 THEN
    r := r || jsonb_build_object('cancelled', NULL, 'leavers', NULL, 'transfers_out', NULL, 'net', NULL);
  END IF;
  RETURN r;
END $function$;
REVOKE ALL ON FUNCTION public._bm_kpis(uuid, uuid[], date, date) FROM PUBLIC, anon, authenticated;