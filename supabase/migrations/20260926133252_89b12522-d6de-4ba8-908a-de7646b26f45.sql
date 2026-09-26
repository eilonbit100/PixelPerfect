ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS plan_date date, ADD COLUMN IF NOT EXISTS plan_rank integer;
CREATE INDEX IF NOT EXISTS tasks_plan_idx ON public.tasks(branch_id, plan_date);

CREATE TABLE public.daily_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  plan_date date NOT NULL,
  approved_by uuid REFERENCES public.organization_members(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, plan_date)
);
GRANT SELECT ON public.daily_plans TO authenticated;
GRANT ALL ON public.daily_plans TO service_role;
ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_plans_select ON public.daily_plans FOR SELECT TO authenticated
  USING (public.has_branch_access(organization_id, branch_id));

CREATE OR REPLACE FUNCTION public.suggest_daily_plan(_branch uuid, _date date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; t record; m uuid; n int := 0; r int := 0;
BEGIN
  SELECT organization_id INTO _org FROM branches WHERE id = _branch;
  IF _org IS NULL OR NOT is_org_manager(_org) OR NOT has_branch_access(_org, _branch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- rank already-planned + new candidates
  FOR t IN
    SELECT * FROM tasks
    WHERE branch_id = _branch AND deleted_at IS NULL AND status IN ('OPEN','IN_PROGRESS')
      AND (plan_date = _date OR (plan_date IS NULL AND due_at < (_date + 1)::timestamptz))
    ORDER BY (due_at < now()) DESC, CASE priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END, due_at
  LOOP
    r := r + 1;
    m := t.assigned_member_id;
    IF m IS NULL THEN
      SELECT om.id INTO m FROM organization_members om
      JOIN member_branch_access a ON a.organization_member_id = om.id AND a.branch_id = _branch
      WHERE om.organization_id = _org AND om.role = 'EMPLOYEE' AND om.status IN ('ACTIVE','INVITED')
      ORDER BY
        CASE WHEN t.entity_type = 'lead' AND om.job_title ILIKE '%מכיר%' THEN 0
             WHEN t.entity_type = 'customer' AND om.job_title ILIKE '%קבל%' THEN 0 ELSE 1 END,
        (SELECT count(*) FROM tasks x WHERE x.assigned_member_id = om.id AND x.plan_date = _date AND x.status IN ('OPEN','IN_PROGRESS'))
      LIMIT 1;
    END IF;
    UPDATE tasks SET plan_date = _date, plan_rank = r, assigned_member_id = m WHERE id = t.id;
    n := n + 1;
  END LOOP;
  INSERT INTO daily_plans(organization_id, branch_id, plan_date) VALUES (_org, _branch, _date)
    ON CONFLICT (branch_id, plan_date) DO NOTHING;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.approve_daily_plan(_branch uuid, _date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM branches WHERE id = _branch;
  IF _org IS NULL OR NOT is_org_manager(_org) OR NOT has_branch_access(_org, _branch) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO daily_plans(organization_id, branch_id, plan_date, approved_by, approved_at)
  VALUES (_org, _branch, _date, current_member_id(_org), now())
  ON CONFLICT (branch_id, plan_date) DO UPDATE SET approved_by = EXCLUDED.approved_by, approved_at = now();
END $$;

REVOKE EXECUTE ON FUNCTION public.suggest_daily_plan(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_daily_plan(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_daily_plan(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_daily_plan(uuid, date) TO authenticated;