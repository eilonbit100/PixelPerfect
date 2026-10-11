CREATE OR REPLACE FUNCTION public.leads_claim_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.stage = 'PROSPECT' AND OLD.stage = 'LEAD' AND NEW.assigned_member_id IS NULL THEN
    NEW.assigned_member_id := public.current_member_id(NEW.organization_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS leads_claim_owner ON public.leads;
CREATE TRIGGER leads_claim_owner BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.leads_claim_owner();

CREATE OR REPLACE FUNCTION public.dashboard_my_stats(_org uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := public.current_member_id(_org); tz text := 'Asia/Jerusalem'; d date := (now() AT TIME ZONE tz)::date;
  wk date := d - extract(dow FROM d)::int; mo date := date_trunc('month', d)::date;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'אין הרשאה' USING ERRCODE='42501'; END IF;
  RETURN (SELECT jsonb_build_object(
    'closed_today', count(*) FILTER (WHERE x >= d), 'closed_week', count(*) FILTER (WHERE x >= wk), 'closed_month', count(*) FILTER (WHERE x >= mo),
    'calls_today', (SELECT count(*) FROM activities a WHERE a.organization_id=_org AND a.entity_type='lead' AND a.activity_type='CALL'
       AND a.performed_by=auth.uid() AND (a.created_at AT TIME ZONE tz)::date = d))
    FROM (SELECT (l.updated_at AT TIME ZONE tz)::date x FROM leads l WHERE l.organization_id=_org AND l.status='WON' AND l.assigned_member_id=me
      AND l.deleted_at IS NULL AND (l.updated_at AT TIME ZONE tz)::date >= least(wk, mo)) s);
END $$;
GRANT EXECUTE ON FUNCTION public.dashboard_my_stats(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_people(_org uuid, _branch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := public.current_member_id(_org); br uuid[];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'אין הרשאה' USING ERRCODE='42501'; END IF;
  SELECT array_agg(b.id) INTO br FROM branches b WHERE b.organization_id=_org AND b.deleted_at IS NULL
    AND (_branch IS NULL OR b.id=_branch) AND public.has_branch_access(_org, b.id);
  RETURN jsonb_build_object(
    'leads', coalesce((SELECT jsonb_agg(t) FROM (
      SELECT l.id, l.full_name, l.phone, l.stage, l.status, l.assigned_member_id, l.created_at, l.branch_id,
        c.last_call_at, c.last_result, coalesce(c.attempts,0) attempts, nt.next_due
      FROM leads l
      LEFT JOIN LATERAL (SELECT max(a.created_at) FILTER (WHERE a.activity_type IN ('CALL','CONTACT_ATTEMPT','NOTE','MEETING','TASK_COMPLETED')) last_call_at,
          (array_agg(coalesce(a.metadata->>'outcome', a.description) ORDER BY a.created_at DESC) FILTER (WHERE a.activity_type IN ('CALL','CONTACT_ATTEMPT','TASK_COMPLETED')))[1] last_result,
          count(*) FILTER (WHERE a.activity_type IN ('CALL','CONTACT_ATTEMPT')) attempts
        FROM activities a WHERE a.entity_type='lead' AND a.entity_id=l.id) c ON true
      LEFT JOIN LATERAL (SELECT min(t.due_at) next_due FROM tasks t WHERE t.entity_type='lead' AND t.entity_id=l.id
        AND t.status IN ('OPEN','IN_PROGRESS') AND t.deleted_at IS NULL) nt ON true
      WHERE l.organization_id=_org AND l.deleted_at IS NULL AND l.branch_id = ANY(br) AND l.status NOT IN ('WON','LOST')
      ORDER BY l.created_at DESC LIMIT 300) t), '[]'),
    'blocked', coalesce((SELECT jsonb_agg(t) FROM (
      SELECT c.id, c.full_name, c.phone, r.reasons FROM customers c
      CROSS JOIN LATERAL (SELECT public.entry_block_reasons(c.id) reasons) r
      WHERE c.organization_id=_org AND c.deleted_at IS NULL AND c.status IN ('ACTIVE','FROZEN') AND c.home_branch_id = ANY(br)
        AND coalesce(array_length(r.reasons,1),0) > 0
      ORDER BY c.full_name LIMIT 100) t), '[]'),
    'card_fixes', coalesce((SELECT jsonb_agg(t) FROM (
      SELECT c.id, c.full_name, array_agg(DISTINCT q.key) items FROM customers c
      JOIN customer_compliance_items i ON i.customer_id=c.id AND i.status IN ('MISSING','EXPIRED')
      JOIN compliance_requirements q ON q.id=i.requirement_id AND q.key IN ('HEALTH_DECLARATION','SIGNED_TERMS','PAYMENT_METHOD')
      WHERE c.organization_id=_org AND c.deleted_at IS NULL AND c.status='ACTIVE' AND c.home_branch_id = ANY(br)
      GROUP BY c.id, c.full_name ORDER BY c.full_name LIMIT 100) t), '[]'));
END $$;