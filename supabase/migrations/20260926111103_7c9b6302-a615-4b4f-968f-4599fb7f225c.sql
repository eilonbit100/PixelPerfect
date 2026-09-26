create extension if not exists pg_trgm with schema extensions;

-- ========== utilities ==========
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.normalize_phone(_p text) returns text language sql immutable set search_path=public as $$
  select case
    when _p is null then null
    when regexp_replace(_p,'\D','','g') like '0%' then '972' || substr(regexp_replace(_p,'\D','','g'),2)
    else regexp_replace(_p,'\D','','g') end $$;

create or replace function public.set_normalized_phone() returns trigger language plpgsql set search_path=public as $$
begin new.normalized_phone = public.normalize_phone(new.phone); return new; end $$;

-- ========== identity & tenancy ==========
create table public.profiles (
  id uuid primary key,
  full_name text,
  phone text,
  avatar_url text,
  locale text not null default 'he-IL',
  timezone text not null default 'Asia/Jerusalem',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text, phone text, email text,
  timezone text not null default 'Asia/Jerusalem',
  currency text not null default 'ILS',
  active boolean not null default true,
  rules_evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid,
  display_name text,
  invited_email text,
  role text not null check (role in ('OWNER','ADMIN','MANAGER','EMPLOYEE')),
  status text not null default 'INVITED' check (status in ('INVITED','ACTIVE','SUSPENDED','REMOVED')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index on public.organization_members(user_id);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null, address text, phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.branches(organization_id);

create table public.member_branch_access (
  id uuid primary key default gen_random_uuid(),
  organization_member_id uuid not null references public.organization_members(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_member_id, branch_id)
);

-- ========== authorization helpers ==========
create or replace function public.member_role(_org uuid) returns text language sql stable security definer set search_path=public as $$
  select role from public.organization_members where organization_id=_org and user_id=auth.uid() and status='ACTIVE' limit 1 $$;
create or replace function public.current_member_id(_org uuid) returns uuid language sql stable security definer set search_path=public as $$
  select id from public.organization_members where organization_id=_org and user_id=auth.uid() and status='ACTIVE' limit 1 $$;
create or replace function public.is_org_member(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.member_role(_org) is not null $$;
create or replace function public.is_org_manager(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.member_role(_org) in ('OWNER','ADMIN','MANAGER'), false) $$;
create or replace function public.is_org_admin(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.member_role(_org) in ('OWNER','ADMIN'), false) $$;
create or replace function public.has_branch_access(_org uuid, _branch uuid) returns boolean language sql stable security definer set search_path=public as $$
  select case when _branch is null then public.is_org_member(_org)
  else exists (
    select 1 from public.organization_members m
    where m.organization_id=_org and m.user_id=auth.uid() and m.status='ACTIVE'
      and (m.role in ('OWNER','ADMIN') or exists (
        select 1 from public.member_branch_access a where a.organization_member_id=m.id and a.branch_id=_branch)))
  end $$;
create or replace function public.shares_org_with(_user uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.organization_members a join public.organization_members b on a.organization_id=b.organization_id
    where a.user_id=auth.uid() and a.status='ACTIVE' and b.user_id=_user) $$;

-- ========== audit & activities ==========
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid, user_id uuid,
  action text not null, entity_type text not null, entity_id uuid,
  before_data jsonb, after_data jsonb, metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_logs(organization_id, created_at desc);
create index on public.audit_logs(entity_type, entity_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid references public.branches(id),
  entity_type text not null, entity_id uuid not null,
  activity_type text not null,
  description text,
  performed_by uuid default auth.uid(),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.activities(entity_type, entity_id, created_at desc);
create index on public.activities(organization_id);

-- ========== customers & memberships ==========
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  home_branch_id uuid references public.branches(id),
  full_name text not null, phone text, normalized_phone text, email text, national_id text,
  status text not null default 'ACTIVE' check (status in ('PENDING','ACTIVE','INACTIVE','ARCHIVED')),
  joined_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.customers(organization_id); create index on public.customers(home_branch_id);
create index on public.customers(status); create index on public.customers(normalized_phone);
create index on public.customers(national_id);
create index customers_name_trgm on public.customers using gin (full_name extensions.gin_trgm_ops);

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null, price numeric(10,2) not null default 0,
  billing_period text not null default 'MONTHLY' check (billing_period in ('MONTHLY','YEARLY','ONE_TIME','PUNCH_CARD')),
  active boolean not null default true, metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.membership_plans(organization_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid references public.branches(id),
  customer_id uuid not null references public.customers(id),
  membership_plan_id uuid references public.membership_plans(id),
  display_name text not null, price numeric(10,2) not null default 0,
  start_date date not null default current_date, end_date date,
  status text not null default 'ACTIVE' check (status in ('PENDING','ACTIVE','FROZEN','CANCELLED','EXPIRED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.memberships(customer_id); create index on public.memberships(organization_id, status);

create table public.compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  key text not null, name text not null,
  entity_type text not null default 'customer',
  required boolean not null default true, active boolean not null default true,
  configuration jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, key)
);

create table public.customer_compliance_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  customer_id uuid not null references public.customers(id),
  requirement_id uuid not null references public.compliance_requirements(id),
  status text not null default 'MISSING' check (status in ('MISSING','PENDING','VALID','EXPIRED','NOT_REQUIRED')),
  completed_at timestamptz, expires_at timestamptz,
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (customer_id, requirement_id)
);
create index on public.customer_compliance_items(organization_id, status);

create table public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  customer_id uuid not null references public.customers(id),
  document_type text not null,
  file_name text,
  storage_path text not null,
  status text not null default 'UPLOADED' check (status in ('UPLOADED','SIGNED','REJECTED','ARCHIVED')),
  signed_at timestamptz,
  uploaded_by uuid default auth.uid(),
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.customer_documents(customer_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid references public.branches(id),
  customer_id uuid not null references public.customers(id),
  membership_id uuid references public.memberships(id),
  amount numeric(10,2) not null, currency text not null default 'ILS',
  status text not null default 'PENDING' check (status in ('PENDING','PAID','FAILED','CANCELLED','REFUNDED')),
  due_at timestamptz, paid_at timestamptz, failure_reason text, external_reference text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.payments(customer_id); create index on public.payments(organization_id, status);

-- ========== leads & tasks ==========
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  full_name text not null, phone text, normalized_phone text, email text,
  source text not null default 'OTHER',
  status text not null default 'NEW' check (status in ('NEW','CONTACT_ATTEMPT','FOLLOW_UP','TRIAL','WON','LOST')),
  assigned_member_id uuid references public.organization_members(id),
  loss_reason text check (loss_reason in ('PRICE','NOT_INTERESTED','COMPETITOR','LOCATION','NO_CONTACT','CHANGED_MIND','OTHER')),
  loss_note text,
  last_activity_at timestamptz,
  converted_customer_id uuid references public.customers(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.leads(organization_id); create index on public.leads(branch_id);
create index on public.leads(status); create index on public.leads(assigned_member_id);
create index on public.leads(normalized_phone); create index on public.leads(created_at);
create index leads_name_trgm on public.leads using gin (full_name extensions.gin_trgm_ops);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid references public.branches(id),
  title text not null, description text,
  assigned_member_id uuid references public.organization_members(id),
  due_at timestamptz not null,
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  entity_type text, entity_id uuid,
  source text not null default 'MANUAL' check (source in ('MANUAL','RULE','SYSTEM')),
  rule_key text,
  created_by uuid default auth.uid(),
  completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.tasks(organization_id); create index on public.tasks(branch_id);
create index on public.tasks(entity_type, entity_id); create index on public.tasks(status, due_at);
create index on public.tasks(assigned_member_id);

-- ========== rules, insights, notifications ==========
create table public.rule_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  key text not null, name text not null, entity_type text not null,
  enabled boolean not null default true,
  default_severity text not null default 'WARNING' check (default_severity in ('INFO','ATTENTION','WARNING','HIGH','CRITICAL')),
  configuration jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, key)
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid references public.branches(id),
  rule_key text not null, entity_type text not null, entity_id uuid not null,
  severity text not null check (severity in ('INFO','ATTENTION','WARNING','HIGH','CRITICAL')),
  title text not null, explanation text, recommended_action text,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED')),
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz, resolved_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index insights_active_unique on public.insights(organization_id, rule_key, entity_type, entity_id)
  where status in ('OPEN','ACKNOWLEDGED','DISMISSED');
create index on public.insights(organization_id, status); create index on public.insights(rule_key);
create index on public.insights(detected_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null,
  title text not null, body text, link text,
  insight_id uuid references public.insights(id),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, read_at);

-- ========== inventory ==========
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null, phone text, email text,
  active boolean not null default true,
  default_return_window_days int,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.suppliers(organization_id);

create table public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null, sku text, barcode text, category text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  default_supplier_id uuid references public.suppliers(id),
  returnable boolean not null default false,
  replacement_product_id uuid references public.inventory_products(id),
  price numeric(10,2),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, sku)
);
create index on public.inventory_products(barcode);

create table public.inventory_stock_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  product_id uuid not null references public.inventory_products(id),
  current_stock numeric(12,2) not null default 0,
  minimum_stock numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (branch_id, product_id)
);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  product_id uuid not null references public.inventory_products(id),
  transaction_type text not null check (transaction_type in ('RECEIPT','SALE','RETURN_TO_SUPPLIER','MANUAL_ADJUSTMENT','PHYSICAL_COUNT','TRANSFER_IN','TRANSFER_OUT')),
  quantity_delta numeric(12,2) not null,
  stock_before numeric(12,2) not null, stock_after numeric(12,2) not null,
  reference text, notes text,
  performed_by uuid default auth.uid(),
  override_used boolean not null default false, override_reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.inventory_transactions(product_id, created_at desc);
create index on public.inventory_transactions(branch_id);

create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid not null references public.branches(id),
  product_id uuid not null references public.inventory_products(id),
  lot_number text, quantity numeric(12,2) not null default 0,
  received_at timestamptz, expiry_date date,
  supplier_id uuid references public.suppliers(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.inventory_lots(product_id); create index on public.inventory_lots(expiry_date);

-- ========== updated_at & phone triggers ==========
do $$ declare t text; begin
  foreach t in array array['profiles','organizations','organization_members','branches','customers','membership_plans','memberships',
    'compliance_requirements','customer_compliance_items','customer_documents','payments','leads','tasks','rule_definitions','insights',
    'suppliers','inventory_products','inventory_stock_levels','inventory_lots'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
create trigger trg_leads_phone before insert or update of phone on public.leads for each row execute function public.set_normalized_phone();
create trigger trg_customers_phone before insert or update of phone on public.customers for each row execute function public.set_normalized_phone();

-- ========== grants ==========
grant select, insert, update on public.profiles to authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update on public.organization_members to authenticated;
grant select, insert, update on public.branches to authenticated;
grant select, insert, delete on public.member_branch_access to authenticated;
grant select on public.audit_logs to authenticated;
grant select, insert on public.activities to authenticated;
grant select, insert, update on public.customers, public.membership_plans, public.memberships, public.customer_compliance_items,
  public.customer_documents, public.payments, public.leads, public.tasks, public.suppliers, public.inventory_products to authenticated;
grant select on public.compliance_requirements to authenticated;
grant select, insert, update on public.rule_definitions to authenticated;
grant select, update on public.insights to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.inventory_stock_levels, public.inventory_transactions, public.inventory_lots to authenticated;
grant update (minimum_stock) on public.inventory_stock_levels to authenticated;
grant all on all tables in schema public to service_role;

-- ========== RLS ==========
do $$ declare t text; begin
  foreach t in array array['profiles','organizations','organization_members','branches','member_branch_access','audit_logs','activities',
    'customers','membership_plans','memberships','compliance_requirements','customer_compliance_items','customer_documents','payments',
    'leads','tasks','rule_definitions','insights','notifications','suppliers','inventory_products','inventory_stock_levels',
    'inventory_transactions','inventory_lots'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.shares_org_with(id));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy org_select on public.organizations for select to authenticated using (public.is_org_member(id));
create policy org_update on public.organizations for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy members_select on public.organization_members for select to authenticated using (public.is_org_member(organization_id));
create policy members_insert on public.organization_members for insert to authenticated with check (public.is_org_admin(organization_id) and role <> 'OWNER');
create policy members_update on public.organization_members for update to authenticated using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create policy branches_select on public.branches for select to authenticated using (public.is_org_member(organization_id));
create policy branches_insert on public.branches for insert to authenticated with check (public.is_org_admin(organization_id));
create policy branches_update on public.branches for update to authenticated using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create policy mba_select on public.member_branch_access for select to authenticated using (
  exists (select 1 from public.organization_members m where m.id = organization_member_id and public.is_org_member(m.organization_id)));
create policy mba_insert on public.member_branch_access for insert to authenticated with check (
  exists (select 1 from public.organization_members m join public.branches b on b.id = branch_id and b.organization_id = m.organization_id
          where m.id = organization_member_id and public.is_org_admin(m.organization_id)));
create policy mba_delete on public.member_branch_access for delete to authenticated using (
  exists (select 1 from public.organization_members m where m.id = organization_member_id and public.is_org_admin(m.organization_id)));

create policy audit_select on public.audit_logs for select to authenticated using (public.is_org_manager(organization_id));

create policy activities_select on public.activities for select to authenticated using (public.has_branch_access(organization_id, branch_id));
create policy activities_insert on public.activities for insert to authenticated with check (public.has_branch_access(organization_id, branch_id) and performed_by = auth.uid());

-- generic branch-scoped tables
do $$ declare r record; begin
  for r in select * from (values ('customers','home_branch_id'),('memberships','branch_id'),('payments','branch_id'),
      ('inventory_stock_levels','branch_id'),('inventory_transactions','branch_id'),('inventory_lots','branch_id'),('insights','branch_id')) v(t,c) loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.has_branch_access(organization_id, %2$I))', r.t, r.c);
  end loop;
  for r in select * from (values ('customers','home_branch_id'),('memberships','branch_id'),('payments','branch_id')) v(t,c) loop
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.has_branch_access(organization_id, %2$I))', r.t, r.c);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.has_branch_access(organization_id, %2$I)) with check (public.has_branch_access(organization_id, %2$I))', r.t, r.c);
  end loop;
end $$;
create policy insights_update on public.insights for update to authenticated using (public.has_branch_access(organization_id, branch_id)) with check (public.has_branch_access(organization_id, branch_id));
create policy stock_min_update on public.inventory_stock_levels for update to authenticated using (public.is_org_manager(organization_id) and public.has_branch_access(organization_id, branch_id)) with check (public.is_org_manager(organization_id));

-- org-scoped tables
do $$ declare t text; begin
  foreach t in array array['customer_compliance_items','customer_documents'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_org_member(organization_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))', t);
  end loop;
  foreach t in array array['membership_plans','suppliers','inventory_products'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_org_manager(organization_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id))', t);
  end loop;
end $$;

create policy compliance_req_select on public.compliance_requirements for select to authenticated using (organization_id is null or public.is_org_member(organization_id));
create policy rules_select on public.rule_definitions for select to authenticated using (organization_id is null or public.is_org_member(organization_id));
create policy rules_insert on public.rule_definitions for insert to authenticated with check (organization_id is not null and public.is_org_admin(organization_id));
create policy rules_update on public.rule_definitions for update to authenticated using (organization_id is not null and public.is_org_admin(organization_id)) with check (organization_id is not null and public.is_org_admin(organization_id));

create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- leads: employees edit only their own / unassigned leads
create policy leads_select on public.leads for select to authenticated using (public.has_branch_access(organization_id, branch_id));
create policy leads_insert on public.leads for insert to authenticated with check (public.has_branch_access(organization_id, branch_id));
create policy leads_update on public.leads for update to authenticated using (
  public.has_branch_access(organization_id, branch_id) and (public.is_org_manager(organization_id)
    or assigned_member_id is null or assigned_member_id = public.current_member_id(organization_id)))
  with check (public.has_branch_access(organization_id, branch_id) and (deleted_at is null or public.is_org_manager(organization_id)));

create policy tasks_select on public.tasks for select to authenticated using (public.has_branch_access(organization_id, branch_id));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.has_branch_access(organization_id, branch_id));
create policy tasks_update on public.tasks for update to authenticated using (
  public.has_branch_access(organization_id, branch_id) and (public.is_org_manager(organization_id)
    or assigned_member_id is null or assigned_member_id = public.current_member_id(organization_id) or created_by = auth.uid()))
  with check (public.has_branch_access(organization_id, branch_id));