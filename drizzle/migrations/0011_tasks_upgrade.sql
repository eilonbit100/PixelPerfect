ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_type text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS popup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_state text;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_reminder_state_chk CHECK (reminder_state IS NULL OR reminder_state IN ('PENDING','SHOWN','SNOOZED','DONE'));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_outcome_chk CHECK (outcome IS NULL OR outcome IN ('CONTACTED','NO_ANSWER','FOLLOW_UP','MEETING','SALE','NOT_RELEVANT'));
CREATE INDEX IF NOT EXISTS tasks_reminder_idx ON public.tasks (assigned_member_id, reminder_at) WHERE popup AND reminder_state IN ('PENDING','SNOOZED');
CREATE UNIQUE INDEX IF NOT EXISTS tasks_rule_open_uniq ON public.tasks (organization_id, rule_key, entity_type, entity_id)
  WHERE rule_key IS NOT NULL AND entity_id IS NOT NULL AND deleted_at IS NULL AND status IN ('OPEN','IN_PROGRESS');

CREATE TABLE public.task_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  key text NOT NULL,
  label text NOT NULL,
  category text NOT NULL CHECK (category IN ('SALES','SERVICE','OPS','GENERAL')),
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
GRANT SELECT, INSERT, UPDATE ON public.task_types TO authenticated;
GRANT ALL ON public.task_types TO service_role;
ALTER TABLE public.task_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_types_select ON public.task_types FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY task_types_insert ON public.task_types FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY task_types_update ON public.task_types FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

INSERT INTO public.task_types (organization_id, key, label, category, sort)
SELECT o.id, v.key, v.label, v.cat, v.sort FROM public.organizations o CROSS JOIN (VALUES
 ('LEAD_CONTACT','יצירת קשר עם ליד','SALES',1),('PROSPECT_FOLLOWUP','מעקב אחר מתעניין','SALES',2),('FOLLOWUP_CALL','שיחת המשך','SALES',3),
 ('MEETING','תיאום פגישה','SALES',4),('QUOTE_FOLLOWUP','מעקב אחר הצעת מחיר','SALES',5),
 ('CUSTOMER_REQUEST','טיפול בבקשת לקוח','SERVICE',10),('MISSING_DOC','השלמת מסמך חסר','SERVICE',11),('FAILED_PAYMENT','טיפול בתשלום שנכשל','SERVICE',12),('CALLBACK','חזרה ללקוח','SERVICE',13),
 ('TICKET','טיפול בקריאה','OPS',20),('STOCK_COUNT','ספירת מלאי','OPS',21),('STOCK_ISSUE','טיפול בחריגת מלאי','OPS',22),('INTERNAL','משימה פנימית לעובד','OPS',23),
 ('GENERAL','משימה כללית','GENERAL',30)) AS v(key,label,cat,sort)
ON CONFLICT DO NOTHING;
UPDATE public.tasks SET task_type = 'FAILED_PAYMENT' WHERE task_type IS NULL AND rule_key = 'FAILED_PAYMENT';
UPDATE public.tasks SET task_type = 'LEAD_CONTACT' WHERE task_type IS NULL AND entity_type = 'lead';

-- history on the task itself
CREATE OR REPLACE FUNCTION public.tasks_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _log jsonb := '[]'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
    values (new.organization_id, new.branch_id, 'task', new.id, 'TASK_CREATED', new.title, auth.uid(), jsonb_build_object('assigned', new.assigned_member_id, 'due_at', new.due_at));
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
    values (new.organization_id, new.branch_id, 'task', new.id, 'TASK_STATUS', new.status, auth.uid(), jsonb_build_object('from', old.status, 'to', new.status, 'outcome', new.outcome));
  end if;
  if new.assigned_member_id is distinct from old.assigned_member_id then
    insert into activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
    values (new.organization_id, new.branch_id, 'task', new.id, 'TASK_ASSIGNED', null, auth.uid(), jsonb_build_object('from', old.assigned_member_id, 'to', new.assigned_member_id));
  end if;
  if new.due_at is distinct from old.due_at then
    insert into activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
    values (new.organization_id, new.branch_id, 'task', new.id, 'TASK_DUE', null, auth.uid(), jsonb_build_object('from', old.due_at, 'to', new.due_at));
  end if;
  if new.outcome is distinct from old.outcome and new.outcome is not null then
    insert into activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
    values (new.organization_id, new.branch_id, 'task', new.id, 'TASK_OUTCOME', new.outcome, auth.uid(), '{}'::jsonb);
  end if;
  return new;
end $$;
CREATE TRIGGER tasks_history AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_history();

-- completed tasks stop reminding; popup tasks get a pending reminder
CREATE OR REPLACE FUNCTION public.tasks_reminder_state() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if new.status in ('COMPLETED','CANCELLED') then
    if new.reminder_state in ('PENDING','SNOOZED') then new.reminder_state := 'DONE'; end if;
  elsif new.popup and new.reminder_at is not null and (tg_op = 'INSERT' or new.reminder_at is distinct from old.reminder_at or old.status in ('COMPLETED','CANCELLED')) and new.reminder_state is distinct from 'SNOOZED' then
    new.reminder_state := 'PENDING';
  elsif not new.popup then
    new.reminder_state := null;
  end if;
  return new;
end $$;
CREATE TRIGGER tasks_reminder_state BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_reminder_state();

-- atomic claim: each due reminder is returned to exactly one window
CREATE OR REPLACE FUNCTION public.claim_task_reminders(_org uuid) RETURNS SETOF public.tasks LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  update tasks t set reminder_state = 'SHOWN'
  where t.id in (
    select id from tasks where organization_id = _org and assigned_member_id = public.current_member_id(_org)
      and popup and reminder_state in ('PENDING','SNOOZED') and reminder_at <= now()
      and status in ('OPEN','IN_PROGRESS') and deleted_at is null
    for update skip locked)
  returning t.*;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_task_reminders(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_task_reminders(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.task_comment(_task uuid, _body text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _t tasks;
begin
  select * into _t from tasks where id = _task;
  if _t.id is null or not public.has_branch_access(_t.organization_id, _t.branch_id) then raise exception 'אין הרשאה'; end if;
  if coalesce(trim(_body),'') = '' then raise exception 'יש להזין הערה'; end if;
  insert into activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
  values (_t.organization_id, _t.branch_id, 'task', _t.id, 'TASK_NOTE', trim(_body), auth.uid(), '{}'::jsonb);
end $$;
REVOKE EXECUTE ON FUNCTION public.task_comment(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.task_comment(uuid, text) TO authenticated;