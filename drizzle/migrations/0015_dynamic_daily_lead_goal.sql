CREATE OR REPLACE FUNCTION public.dashboard_my_stats(_org uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := public.current_member_id(_org); uid uuid := auth.uid(); tz text := 'Asia/Jerusalem'; d date := (now() AT TIME ZONE tz)::date;
  wk date := d - extract(dow FROM d)::int; mo date := date_trunc('month', d)::date;
  my_avg numeric; team_avg numeric; my_days int; avg_used numeric; basis text; pool int; due int; goal int; res jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'אין הרשאה' USING ERRCODE='42501'; END IF;
  WITH c AS (
    SELECT a.performed_by AS u, (a.created_at AT TIME ZONE tz)::date AS dd, count(DISTINCT a.entity_id) AS n
    FROM activities a WHERE a.organization_id=_org AND a.entity_type='lead' AND a.activity_type IN ('CALL','CONTACT_ATTEMPT')
      AND a.created_at >= now()-interval '30 days' AND (a.created_at AT TIME ZONE tz)::date < d AND a.performed_by IS NOT NULL
    GROUP BY 1,2)
  SELECT avg(n) FILTER (WHERE u=uid), avg(n), count(*) FILTER (WHERE u=uid) INTO my_avg, team_avg, my_days FROM c;
  IF my_days >= 3 THEN avg_used := my_avg; basis := 'personal';
  ELSIF team_avg IS NOT NULL THEN avg_used := team_avg; basis := 'team';
  ELSE avg_used := 4; basis := 'default'; END IF;
  SELECT count(*) FILTER (WHERE l.stage='LEAD'),
         count(*) FILTER (WHERE l.stage='PROSPECT' AND l.assigned_member_id=me AND EXISTS (SELECT 1 FROM tasks t WHERE t.entity_type='lead' AND t.entity_id=l.id
           AND t.status IN ('OPEN','IN_PROGRESS') AND t.deleted_at IS NULL AND (t.due_at AT TIME ZONE tz)::date <= d))
    INTO pool, due
  FROM leads l WHERE l.organization_id=_org AND l.deleted_at IS NULL AND l.status NOT IN ('WON','LOST') AND public.has_branch_access(_org, l.branch_id);
  goal := least(greatest(ceil(avg_used)::int, 2), pool + due);
  SELECT jsonb_build_object(
    'closed_today', count(*) FILTER (WHERE x >= d), 'closed_week', count(*) FILTER (WHERE x >= wk), 'closed_month', count(*) FILTER (WHERE x >= mo),
    'calls_today', (SELECT count(DISTINCT a.entity_id) FROM activities a WHERE a.organization_id=_org AND a.entity_type='lead' AND a.activity_type IN ('CALL','CONTACT_ATTEMPT')
       AND a.performed_by=uid AND (a.created_at AT TIME ZONE tz)::date = d),
    'goal', goal, 'avg', round(avg_used,1), 'basis', basis, 'pool', pool, 'due', due) INTO res
  FROM (SELECT (l.updated_at AT TIME ZONE tz)::date AS x FROM leads l WHERE l.organization_id=_org AND l.status='WON' AND l.assigned_member_id=me
      AND l.deleted_at IS NULL AND (l.updated_at AT TIME ZONE tz)::date >= least(wk, mo)) s;
  RETURN res;
END $$;