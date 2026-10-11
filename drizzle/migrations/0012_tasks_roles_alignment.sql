ALTER TABLE public.task_types ADD COLUMN IF NOT EXISTS allowed_roles text[] NOT NULL DEFAULT ARRAY['EMPLOYEE','BRANCH_MANAGER','HQ'];
ALTER TABLE public.task_types ADD COLUMN IF NOT EXISTS requires_link boolean NOT NULL DEFAULT false;
ALTER TABLE public.task_types DROP CONSTRAINT task_types_category_check;
ALTER TABLE public.task_types ADD CONSTRAINT task_types_category_check CHECK (category = ANY (ARRAY['SALES','SERVICE','OPS','MANAGE','GENERAL']));
ALTER TABLE public.tasks DROP CONSTRAINT tasks_outcome_chk;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_outcome_chk CHECK (outcome IS NULL OR outcome = ANY (ARRAY['CONTACTED','NO_ANSWER','INTERESTED','FOLLOW_UP','MEETING','SALE','NOT_RELEVANT']));
ALTER TABLE public.tasks DROP CONSTRAINT tasks_source_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_source_check CHECK (source = ANY (ARRAY['MANUAL','RULE','SYSTEM','DEMO']));

UPDATE public.task_types SET allowed_roles = ARRAY['EMPLOYEE','BRANCH_MANAGER'] WHERE category IN ('SALES','SERVICE');
UPDATE public.task_types SET allowed_roles = ARRAY['BRANCH_MANAGER','HQ'] WHERE key IN ('STOCK_ISSUE','STOCK_COUNT','TICKET');

INSERT INTO public.task_types (organization_id, key, label, category, sort, allowed_roles, requires_link)
SELECT o.id, v.key, v.label, v.category, v.sort, v.roles, v.req
FROM public.organizations o CROSS JOIN (VALUES
  ('TRIAL_CLASS','תיאום שיעור ניסיון','SALES',15,ARRAY['EMPLOYEE','BRANCH_MANAGER'],false),
  ('RENEWAL','קשר לקראת חידוש מנוי','SALES',16,ARRAY['EMPLOYEE','BRANCH_MANAGER'],false),
  ('HEALTH_DECL','השלמת הצהרת בריאות','SERVICE',25,ARRAY['EMPLOYEE','BRANCH_MANAGER'],false),
  ('CANCEL_REQUEST','טיפול בבקשת ביטול (העברה למנהל)','SERVICE',26,ARRAY['EMPLOYEE','BRANCH_MANAGER'],false),
  ('ENTRY_ISSUE','פנייה על בעיית כניסה','SERVICE',27,ARRAY['EMPLOYEE','BRANCH_MANAGER'],false),
  ('CLASS_UPDATE','עדכון לקוח על שינוי בשיעור','SERVICE',28,ARRAY['EMPLOYEE','BRANCH_MANAGER'],false),
  ('SHELF_CHECK','בדיקת מדפים ומקרר','OPS',35,ARRAY['EMPLOYEE','BRANCH_MANAGER'],false),
  ('APPROVAL_REVIEW','בדיקת בקשה לאישור','MANAGE',40,ARRAY['BRANCH_MANAGER','HQ'],true),
  ('PURCHASE_REVIEW','בדיקת בקשת רכש','MANAGE',41,ARRAY['BRANCH_MANAGER','HQ'],true),
  ('LEAD_REVIEW','בדיקת לידים שלא טופלו','MANAGE',42,ARRAY['BRANCH_MANAGER','HQ'],false),
  ('STAFF_REVIEW','בקרה על ביצוע משימות','MANAGE',43,ARRAY['BRANCH_MANAGER','HQ'],false),
  ('CLASS_MANAGE','טיפול בשיבוץ או ביטול שיעור','MANAGE',44,ARRAY['BRANCH_MANAGER'],false),
  ('NETWORK_REVIEW','בדיקה רוחבית בסניפים','MANAGE',45,ARRAY['HQ'],false)
) AS v(key,label,category,sort,roles,req)
ON CONFLICT (organization_id, key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tasks_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _role text; _tt record; _ok boolean;
begin
  if tg_op = 'UPDATE' and new.assigned_member_id is not distinct from old.assigned_member_id
     and new.task_type is not distinct from old.task_type and new.entity_id is not distinct from old.entity_id then
    return new;
  end if;
  select * into _tt from task_types where organization_id = new.organization_id and key = new.task_type;
  if new.assigned_member_id is not null and found then
    select role into _role from organization_members where id = new.assigned_member_id and organization_id = new.organization_id;
    if _role is not null and not (_role = any(_tt.allowed_roles)) then
      raise exception 'סוג המשימה "%" אינו מתאים לתפקיד של העובד האחראי', _tt.label using errcode = 'P0001';
    end if;
  end if;
  if _tt.requires_link and coalesce(new.entity_type,'') not in ('ticket','cancellation_request') then
    raise exception 'משימת אישור חייבת להיות מקושרת לקריאה או לבקשת ביטול' using errcode = 'P0001';
  end if;
  if new.entity_id is not null then
    _ok := case new.entity_type
      when 'ticket' then exists (select 1 from approval_requests where id = new.entity_id and organization_id = new.organization_id)
      when 'cancellation_request' then exists (select 1 from cancellation_requests where id = new.entity_id and organization_id = new.organization_id)
      when 'customer' then exists (select 1 from customers where id = new.entity_id and organization_id = new.organization_id)
      when 'lead' then exists (select 1 from leads where id = new.entity_id and organization_id = new.organization_id)
      else true end;
    if not _ok then raise exception 'הרשומה המקושרת למשימה לא נמצאה' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;

DROP TRIGGER IF EXISTS tasks_validate ON public.tasks;
CREATE TRIGGER tasks_validate BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_validate();