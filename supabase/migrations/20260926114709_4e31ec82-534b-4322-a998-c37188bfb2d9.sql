
-- Roles: EMPLOYEE / BRANCH_MANAGER / HQ
create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare _row jsonb; _org uuid;
begin
  if public._skip_automation() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then _row := to_jsonb(old); else _row := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then return new; end if;
  _org := coalesce((_row->>'organization_id')::uuid,
    (select organization_id from public.organization_members where id = (_row->>'organization_member_id')::uuid));
  if _org is null then return coalesce(new, old); end if;
  insert into public.audit_logs(organization_id, branch_id, user_id, action, entity_type, entity_id, before_data, after_data)
  values (_org, coalesce(_row->>'branch_id', _row->>'home_branch_id')::uuid, auth.uid(), tg_op, tg_table_name,
    (_row->>'id')::uuid, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

alter table public.organization_members drop constraint organization_members_role_check;
update public.organization_members set role = case role when 'OWNER' then 'HQ' when 'ADMIN' then 'HQ' when 'MANAGER' then 'BRANCH_MANAGER' else 'EMPLOYEE' end;
alter table public.organization_members add constraint organization_members_role_check check (role in ('EMPLOYEE','BRANCH_MANAGER','HQ'));
alter table public.organization_members alter column role set default 'EMPLOYEE';

alter table public.organization_members add column username text, add column job_title text;
create unique index organization_members_username_key on public.organization_members (lower(username)) where username is not null;
alter table public.profiles add column username text, add column job_title text, add column active boolean not null default true;

create or replace function public.is_org_admin(_org uuid) returns boolean language sql stable security definer set search_path to 'public'
as $$ select coalesce(public.member_role(_org) = 'HQ', false) $$;
create or replace function public.is_org_manager(_org uuid) returns boolean language sql stable security definer set search_path to 'public'
as $$ select coalesce(public.member_role(_org) in ('HQ','BRANCH_MANAGER'), false) $$;
create or replace function public.has_branch_access(_org uuid, _branch uuid) returns boolean language sql stable security definer set search_path to 'public'
as $$
  select case when _branch is null then public.is_org_member(_org)
  else exists (
    select 1 from public.organization_members m
    where m.organization_id=_org and m.user_id=auth.uid() and m.status='ACTIVE'
      and (m.role = 'HQ' or exists (select 1 from public.member_branch_access a where a.organization_member_id=m.id and a.branch_id=_branch)))
  end $$;

create or replace function public.insights_notify() returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.severity in ('HIGH','CRITICAL') then
    insert into public.notifications(organization_id, user_id, title, body, insight_id, link)
    select new.organization_id, m.user_id, new.title, new.explanation, new.id, new.entity_type || ':' || new.entity_id
    from public.organization_members m
    where m.organization_id=new.organization_id and m.status='ACTIVE' and m.user_id is not null and m.role in ('HQ','BRANCH_MANAGER')
      and (new.branch_id is null or m.role = 'HQ' or exists (select 1 from public.member_branch_access a where a.organization_member_id=m.id and a.branch_id=new.branch_id));
  end if;
  return new;
end $$;

drop policy if exists members_insert on public.organization_members;
create policy members_insert on public.organization_members for insert to authenticated with check (public.is_org_admin(organization_id));

-- No more self-registration: bootstrap only ensures a profile row
create or replace function public.bootstrap_current_user(_full_name text default null) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  insert into public.profiles(id, full_name) values (_uid, _full_name) on conflict (id) do nothing;
  return jsonb_build_object('status', case when exists (select 1 from public.organization_members where user_id=_uid and status='ACTIVE') then 'existing' else 'no_member' end);
end $$;

-- Demo users (seats are linked to a login on first sign-in)
update public.organization_members set username='מטה1', role='HQ', job_title='מנכ"ל', status='INVITED' where id='00000000-0000-0000-0000-00000000c001';
update public.organization_members set username='מנהל1', role='BRANCH_MANAGER', job_title='מנהל סניף' where id='00000000-0000-0000-0000-00000000c002';
update public.organization_members set username='עובד1', role='EMPLOYEE', job_title='איש מכירות' where id='00000000-0000-0000-0000-00000000c003';
update public.organization_members set username='עובד2', role='EMPLOYEE', job_title='קבלה' where id='00000000-0000-0000-0000-00000000c004';
delete from public.member_branch_access where organization_member_id in ('00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000c004')
  and branch_id <> case organization_member_id when '00000000-0000-0000-0000-00000000c002'::uuid then '00000000-0000-0000-0000-00000000b001'::uuid else '00000000-0000-0000-0000-00000000b002'::uuid end;
insert into public.member_branch_access(organization_member_id, branch_id)
select '00000000-0000-0000-0000-00000000c004', '00000000-0000-0000-0000-00000000b002'
where not exists (select 1 from public.member_branch_access where organization_member_id='00000000-0000-0000-0000-00000000c004' and branch_id='00000000-0000-0000-0000-00000000b002');

insert into public.organization_members(id, organization_id, display_name, username, role, job_title, status) values
 ('00000000-0000-0000-0000-00000000c005','00000000-0000-0000-0000-00000000a001','רונית גולן','מנהל2','BRANCH_MANAGER','מנהלת סניף','INVITED'),
 ('00000000-0000-0000-0000-00000000c006','00000000-0000-0000-0000-00000000a001','עמית ברק','עובד3','EMPLOYEE','קופאי','INVITED'),
 ('00000000-0000-0000-0000-00000000c007','00000000-0000-0000-0000-00000000a001','נועה פרץ','מנהל3','BRANCH_MANAGER','מנהלת סניף','INVITED'),
 ('00000000-0000-0000-0000-00000000c008','00000000-0000-0000-0000-00000000a001','שירה מזרחי','מטה2','HQ','סמנכ"לית תפעול','INVITED');
insert into public.member_branch_access(organization_member_id, branch_id) values
 ('00000000-0000-0000-0000-00000000c005','00000000-0000-0000-0000-00000000b002'),
 ('00000000-0000-0000-0000-00000000c006','00000000-0000-0000-0000-00000000b001'),
 ('00000000-0000-0000-0000-00000000c007','00000000-0000-0000-0000-00000000b003');

-- Reusable approval pattern
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid references public.branches(id),
  request_type text not null default 'PRICE_QUOTE',
  title text not null,
  details text,
  amount numeric,
  entity_type text,
  entity_id uuid,
  requested_by uuid references public.organization_members(id),
  submitted_at timestamptz,
  approval_status text not null default 'DRAFT' check (approval_status in ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED')),
  approved_by uuid references public.organization_members(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.approval_requests to authenticated;
grant all on public.approval_requests to service_role;
alter table public.approval_requests enable row level security;
create policy approvals_select on public.approval_requests for select to authenticated
  using (public.is_org_admin(organization_id) or (public.is_org_manager(organization_id) and public.has_branch_access(organization_id, branch_id)));
create policy approvals_insert on public.approval_requests for insert to authenticated
  with check (public.is_org_manager(organization_id) and public.has_branch_access(organization_id, branch_id) and requested_by = public.current_member_id(organization_id));
create policy approvals_update on public.approval_requests for update to authenticated
  using (public.is_org_admin(organization_id) or (requested_by = public.current_member_id(organization_id) and approval_status in ('DRAFT','PENDING_APPROVAL')))
  with check (public.is_org_admin(organization_id) or approval_status in ('DRAFT','PENDING_APPROVAL'));
create trigger approval_requests_updated before update on public.approval_requests for each row execute function public.set_updated_at();

insert into public.approval_requests(organization_id, branch_id, title, details, amount, requested_by, submitted_at, approval_status) values
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','הצעת מחיר לחברת הייטק — 25 מנויים','הנחה של 20% על מנוי שנתי לעובדי החברה',45000,'00000000-0000-0000-0000-00000000c002', now()-interval '2 days','PENDING_APPROVAL'),
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b002','מנוי זוגי במחיר מיוחד','לקוחות ותיקים שמאיימים לעזוב',3600,'00000000-0000-0000-0000-00000000c005', now()-interval '5 hours','PENDING_APPROVAL');
