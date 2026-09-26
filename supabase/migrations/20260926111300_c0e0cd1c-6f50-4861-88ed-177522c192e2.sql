-- lock helper functions away from anonymous callers
revoke execute on function public.member_role(uuid), public.current_member_id(uuid), public.is_org_member(uuid), public.is_org_manager(uuid),
  public.is_org_admin(uuid), public.has_branch_access(uuid,uuid), public.shares_org_with(uuid) from public, anon;
grant execute on function public.member_role(uuid), public.current_member_id(uuid), public.is_org_member(uuid), public.is_org_manager(uuid),
  public.is_org_admin(uuid), public.has_branch_access(uuid,uuid), public.shares_org_with(uuid) to authenticated;

create or replace function public._skip_automation() returns boolean language sql stable set search_path=public as $$
  select coalesce(current_setting('app.skip_automation', true), '') = 'on' $$;

-- ========== audit ==========
create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path=public as $$
declare _row jsonb;
begin
  if public._skip_automation() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then _row := to_jsonb(old); else _row := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then return new; end if;
  insert into public.audit_logs(organization_id, branch_id, user_id, action, entity_type, entity_id, before_data, after_data)
  values ((_row->>'organization_id')::uuid, coalesce(_row->>'branch_id', _row->>'home_branch_id')::uuid, auth.uid(), tg_op, tg_table_name,
    (_row->>'id')::uuid, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['leads','customers','customer_compliance_items','tasks','payments','memberships','customer_documents',
    'inventory_transactions','inventory_products','organization_members','member_branch_access','branches','rule_definitions'] loop
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ========== lead validation & timeline ==========
create or replace function public.leads_validate() returns trigger language plpgsql set search_path=public as $$
begin
  if public._skip_automation() then return new; end if;
  if new.status = 'LOST' and (tg_op = 'INSERT' or old.status is distinct from 'LOST') and new.loss_reason is null then
    raise exception 'LOSS_REASON_REQUIRED' using hint = 'Lost leads require a structured loss reason';
  end if;
  return new;
end $$;
create trigger trg_leads_validate before insert or update on public.leads for each row execute function public.leads_validate();

create or replace function public.leads_timeline() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public._skip_automation() then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by)
    values (new.organization_id, new.branch_id, 'lead', new.id, 'LEAD_CREATED', 'ליד נוצר', auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
    values (new.organization_id, new.branch_id, 'lead', new.id, case when new.status='LOST' then 'LOST_REASON' when new.status='WON' then 'CONVERTED' else 'STATUS_CHANGED' end,
      coalesce(new.loss_note, null), auth.uid(),
      jsonb_build_object('from', old.status, 'to', new.status, 'loss_reason', new.loss_reason));
  elsif new.assigned_member_id is distinct from old.assigned_member_id then
    insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
    values (new.organization_id, new.branch_id, 'lead', new.id, 'ASSIGNED', null, auth.uid(), jsonb_build_object('to', new.assigned_member_id));
  end if;
  return new;
end $$;
create trigger trg_leads_timeline after insert or update on public.leads for each row execute function public.leads_timeline();

create or replace function public.tasks_timeline() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public._skip_automation() or new.entity_type is null then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
    values (new.organization_id, new.branch_id, new.entity_type, new.entity_id, 'TASK_CREATED', new.title, auth.uid(), jsonb_build_object('task_id', new.id, 'due_at', new.due_at));
  elsif new.status = 'COMPLETED' and old.status <> 'COMPLETED' then
    insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
    values (new.organization_id, new.branch_id, new.entity_type, new.entity_id, 'TASK_COMPLETED', new.title, auth.uid(), jsonb_build_object('task_id', new.id));
  end if;
  return new;
end $$;
create trigger trg_tasks_timeline after insert or update on public.tasks for each row execute function public.tasks_timeline();

create or replace function public.tasks_completed_at() returns trigger language plpgsql set search_path=public as $$
begin
  if new.status = 'COMPLETED' and (tg_op='INSERT' or old.status <> 'COMPLETED') then new.completed_at := coalesce(new.completed_at, now()); end if;
  if new.status <> 'COMPLETED' then new.completed_at := null; end if;
  return new;
end $$;
create trigger trg_tasks_completed before insert or update on public.tasks for each row execute function public.tasks_completed_at();

create or replace function public.activities_touch_lead() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.entity_type = 'lead' then
    update public.leads set last_activity_at = new.created_at where id = new.entity_id and (last_activity_at is null or last_activity_at < new.created_at);
  end if;
  return new;
end $$;
create trigger trg_activities_touch after insert on public.activities for each row execute function public.activities_touch_lead();

-- ========== compliance automation ==========
create or replace function public.customers_init_compliance() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public._skip_automation() then return new; end if;
  insert into public.customer_compliance_items(organization_id, customer_id, requirement_id, status)
  select new.organization_id, new.id, r.id, case when r.required then 'MISSING' else 'NOT_REQUIRED' end
  from public.compliance_requirements r
  where r.active and r.entity_type='customer' and (r.organization_id is null or r.organization_id = new.organization_id)
  on conflict do nothing;
  return new;
end $$;
create trigger trg_customers_compliance after insert on public.customers for each row execute function public.customers_init_compliance();

create or replace function public.documents_to_compliance() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.customer_compliance_items i set status='VALID', completed_at=now(), metadata = i.metadata || jsonb_build_object('document_id', new.id)
  from public.compliance_requirements r
  where i.requirement_id = r.id and r.key = new.document_type and i.customer_id = new.customer_id and i.status in ('MISSING','PENDING','EXPIRED');
  return new;
end $$;
create trigger trg_documents_compliance after insert on public.customer_documents for each row execute function public.documents_to_compliance();

-- ========== rule engine ==========
create or replace function public.rule_setting(_org uuid, _key text, out enabled boolean, out configuration jsonb)
language sql stable security definer set search_path=public as $$
  select coalesce(o.enabled, s.enabled, true), coalesce(s.configuration,'{}'::jsonb) || coalesce(o.configuration,'{}'::jsonb)
  from public.rule_definitions s left join public.rule_definitions o on o.key = s.key and o.organization_id = _org
  where s.organization_id is null and s.key = _key $$;

create or replace function public._sync_rule(_org uuid, _rule text, _entity text, _sev text, _action text, _rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.insights(organization_id, branch_id, rule_key, entity_type, entity_id, severity, title, explanation, recommended_action, status, detected_at, metadata)
  select _org, nullif(r->>'branch_id','')::uuid, _rule, _entity, (r->>'entity_id')::uuid, coalesce(r->>'severity', _sev), r->>'title', r->>'explanation', _action, 'OPEN', now(), coalesce(r->'metadata','{}'::jsonb)
  from jsonb_array_elements(coalesce(_rows,'[]'::jsonb)) r
  on conflict (organization_id, rule_key, entity_type, entity_id) where status in ('OPEN','ACKNOWLEDGED','DISMISSED')
  do update set title = excluded.title, explanation = excluded.explanation, metadata = excluded.metadata,
    severity = excluded.severity, branch_id = excluded.branch_id
  where insights.title is distinct from excluded.title or insights.explanation is distinct from excluded.explanation
    or insights.metadata is distinct from excluded.metadata or insights.severity is distinct from excluded.severity;

  update public.insights i set status = 'RESOLVED', resolved_at = now()
  where i.organization_id = _org and i.rule_key = _rule and i.status in ('OPEN','ACKNOWLEDGED','DISMISSED')
    and not exists (select 1 from jsonb_array_elements(coalesce(_rows,'[]'::jsonb)) r where (r->>'entity_id')::uuid = i.entity_id);
end $$;

create or replace function public.evaluate_rules(_org uuid) returns void language plpgsql security definer set search_path=public as $$
declare _rows jsonb; _s record; _days int;
begin
  if auth.uid() is not null and not public.is_org_member(_org) then raise exception 'FORBIDDEN'; end if;

  -- INVALID_FOLLOW_UP
  _rows := null; select * into _s from public.rule_setting(_org,'INVALID_FOLLOW_UP');
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', l.id, 'branch_id', l.branch_id, 'title', 'ליד במעקב ללא משימת המשך',
      'explanation', l.full_name || case when x.overdue > 0 then ' — משימת ההמשך באיחור' else ' — אין משימה עתידית' end,
      'metadata', jsonb_build_object('reason', case when x.overdue > 0 then 'OVERDUE_TASK' else 'NO_TASK' end, 'name', l.full_name)))
    into _rows
    from public.leads l
    cross join lateral (select count(*) filter (where t.due_at <= now()) overdue, count(*) filter (where t.due_at > now()) future
      from public.tasks t where t.entity_type='lead' and t.entity_id=l.id and t.deleted_at is null and t.status in ('OPEN','IN_PROGRESS')) x
    where l.organization_id=_org and l.deleted_at is null and l.status='FOLLOW_UP' and x.future = 0;
  end if;
  perform public._sync_rule(_org,'INVALID_FOLLOW_UP','lead','HIGH','CREATE_TASK',_rows);

  -- OVERDUE_TASK
  _rows := null; select * into _s from public.rule_setting(_org,'OVERDUE_TASK');
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', t.id, 'branch_id', t.branch_id, 'title', 'משימה באיחור',
      'explanation', t.title, 'severity', case when t.due_at < now() - interval '3 days' then 'HIGH' else 'WARNING' end,
      'metadata', jsonb_build_object('due_at', t.due_at, 'entity_type', t.entity_type, 'entity_id', t.entity_id)))
    into _rows from public.tasks t
    where t.organization_id=_org and t.deleted_at is null and t.status in ('OPEN','IN_PROGRESS') and t.due_at < now();
  end if;
  perform public._sync_rule(_org,'OVERDUE_TASK','task','WARNING','COMPLETE_TASK',_rows);

  -- MISSING_LOST_REASON
  _rows := null; select * into _s from public.rule_setting(_org,'MISSING_LOST_REASON');
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', l.id, 'branch_id', l.branch_id, 'title', 'ליד שאבד ללא סיבת אובדן',
      'explanation', l.full_name || ' סומן כלא רלוונטי ללא תיעוד סיבה', 'metadata', jsonb_build_object('name', l.full_name)))
    into _rows from public.leads l
    where l.organization_id=_org and l.deleted_at is null and l.status='LOST' and l.loss_reason is null;
  end if;
  perform public._sync_rule(_org,'MISSING_LOST_REASON','lead','WARNING','ADD_LOSS_REASON',_rows);

  -- INACTIVE_LEAD
  _rows := null; select * into _s from public.rule_setting(_org,'INACTIVE_LEAD');
  _days := coalesce((_s.configuration->>'days')::int, 5);
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', l.id, 'branch_id', l.branch_id, 'title', 'ליד לא מטופל',
      'explanation', l.full_name || ' — ללא פעילות ' || extract(day from now() - coalesce(l.last_activity_at, l.created_at))::int || ' ימים',
      'metadata', jsonb_build_object('days', extract(day from now() - coalesce(l.last_activity_at, l.created_at))::int, 'threshold', _days)))
    into _rows from public.leads l
    where l.organization_id=_org and l.deleted_at is null and l.status in ('NEW','CONTACT_ATTEMPT','FOLLOW_UP','TRIAL')
      and coalesce(l.last_activity_at, l.created_at) < now() - make_interval(days => _days);
  end if;
  perform public._sync_rule(_org,'INACTIVE_LEAD','lead','WARNING','CONTACT_LEAD',_rows);

  -- MISSING_COMPLIANCE
  _rows := null; select * into _s from public.rule_setting(_org,'MISSING_COMPLIANCE');
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', c.id, 'branch_id', c.home_branch_id, 'title', 'מסמכים חסרים',
      'explanation', c.full_name || ' — ' || x.names, 'metadata', jsonb_build_object('missing', x.keys)))
    into _rows from public.customers c
    cross join lateral (select string_agg(r.name, ', ' order by r.name) names, jsonb_agg(r.key) keys
      from public.customer_compliance_items i join public.compliance_requirements r on r.id=i.requirement_id
      where i.customer_id=c.id and r.required and r.active and i.status in ('MISSING','EXPIRED')) x
    where c.organization_id=_org and c.deleted_at is null and c.status in ('ACTIVE','PENDING') and x.names is not null;
  end if;
  perform public._sync_rule(_org,'MISSING_COMPLIANCE','customer','HIGH','COLLECT_DOCUMENTS',_rows);

  -- FAILED_PAYMENT
  _rows := null; select * into _s from public.rule_setting(_org,'FAILED_PAYMENT');
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', p.id, 'branch_id', p.branch_id, 'title', 'חיוב שנכשל',
      'explanation', c.full_name || ' — ' || p.amount || ' ₪' || coalesce(' (' || p.failure_reason || ')', ''),
      'metadata', jsonb_build_object('customer_id', c.id, 'amount', p.amount)))
    into _rows from public.payments p join public.customers c on c.id=p.customer_id
    where p.organization_id=_org and p.status='FAILED' and c.deleted_at is null;
  end if;
  perform public._sync_rule(_org,'FAILED_PAYMENT','payment','WARNING','CHECK_PAYMENT',_rows);

  -- INCOMPLETE_ONBOARDING
  _rows := null; select * into _s from public.rule_setting(_org,'INCOMPLETE_ONBOARDING');
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', c.id, 'branch_id', c.home_branch_id, 'title', 'פתיחת כרטיס לא הושלמה',
      'explanation', c.full_name || ' — לא נבחר מנוי'))
    into _rows from public.customers c
    where c.organization_id=_org and c.deleted_at is null and c.status in ('ACTIVE','PENDING')
      and not exists (select 1 from public.memberships m where m.customer_id=c.id and m.status in ('PENDING','ACTIVE','FROZEN'));
  end if;
  perform public._sync_rule(_org,'INCOMPLETE_ONBOARDING','customer','ATTENTION','SELECT_MEMBERSHIP',_rows);

  -- OUT_OF_STOCK / LOW_STOCK
  _rows := null; select * into _s from public.rule_setting(_org,'OUT_OF_STOCK');
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', sl.id, 'branch_id', sl.branch_id, 'title', 'אזל מהמלאי',
      'explanation', p.name || ' — ' || b.name, 'metadata', jsonb_build_object('product_id', p.id, 'stock', sl.current_stock, 'minimum', sl.minimum_stock)))
    into _rows from public.inventory_stock_levels sl join public.inventory_products p on p.id=sl.product_id join public.branches b on b.id=sl.branch_id
    where sl.organization_id=_org and p.status='ACTIVE' and p.deleted_at is null and sl.current_stock <= 0 and sl.minimum_stock > 0;
  end if;
  perform public._sync_rule(_org,'OUT_OF_STOCK','inventory_stock_level','CRITICAL','REORDER',_rows);

  _rows := null; select * into _s from public.rule_setting(_org,'LOW_STOCK');
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', sl.id, 'branch_id', sl.branch_id, 'title', 'מלאי נמוך',
      'explanation', p.name || ' — ' || sl.current_stock::int || ' יח׳ (מינימום ' || sl.minimum_stock::int || ')',
      'metadata', jsonb_build_object('product_id', p.id, 'stock', sl.current_stock, 'minimum', sl.minimum_stock)))
    into _rows from public.inventory_stock_levels sl join public.inventory_products p on p.id=sl.product_id
    where sl.organization_id=_org and p.status='ACTIVE' and p.deleted_at is null and sl.current_stock > 0 and sl.current_stock <= sl.minimum_stock;
  end if;
  perform public._sync_rule(_org,'LOW_STOCK','inventory_stock_level','WARNING','REORDER',_rows);

  -- NEAR_EXPIRY
  _rows := null; select * into _s from public.rule_setting(_org,'NEAR_EXPIRY');
  _days := coalesce((_s.configuration->>'days')::int, 14);
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', lt.id, 'branch_id', lt.branch_id,
      'title', case when lt.expiry_date < current_date then 'פג תוקף' else 'תוקף קרוב' end,
      'severity', case when lt.expiry_date < current_date then 'HIGH' else 'WARNING' end,
      'explanation', p.name || ' — ' || lt.quantity::int || ' יח׳, תוקף ' || to_char(lt.expiry_date,'DD.MM.YY'),
      'metadata', jsonb_build_object('product_id', p.id, 'expiry_date', lt.expiry_date, 'quantity', lt.quantity)))
    into _rows from public.inventory_lots lt join public.inventory_products p on p.id=lt.product_id
    where lt.organization_id=_org and lt.quantity > 0 and lt.expiry_date is not null and lt.expiry_date <= current_date + _days;
  end if;
  perform public._sync_rule(_org,'NEAR_EXPIRY','inventory_lot','WARNING','HANDLE_EXPIRY',_rows);

  -- COUNT_DISCREPANCY (latest physical count per branch+product in last 30 days)
  _rows := null; select * into _s from public.rule_setting(_org,'COUNT_DISCREPANCY');
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', t.id, 'branch_id', t.branch_id, 'title', 'פער מלאי',
      'explanation', p.name || ' — מערכת ' || t.stock_before::int || ', נספר ' || t.stock_after::int || ', פער ' || t.quantity_delta::int,
      'metadata', jsonb_build_object('product_id', p.id, 'system', t.stock_before, 'counted', t.stock_after, 'difference', t.quantity_delta)))
    into _rows from (
      select distinct on (branch_id, product_id) * from public.inventory_transactions
      where organization_id=_org and transaction_type='PHYSICAL_COUNT' and created_at > now() - interval '30 days'
      order by branch_id, product_id, created_at desc) t
    join public.inventory_products p on p.id=t.product_id
    where t.quantity_delta <> 0;
  end if;
  perform public._sync_rule(_org,'COUNT_DISCREPANCY','inventory_transaction','WARNING','REVIEW_COUNT',_rows);

  update public.organizations set rules_evaluated_at = now() where id = _org;
end $$;
revoke execute on function public.evaluate_rules(uuid), public._sync_rule(uuid,text,text,text,text,jsonb), public.rule_setting(uuid,text) from public, anon;
grant execute on function public.evaluate_rules(uuid) to authenticated;

-- event-based evaluation
create or replace function public.trg_evaluate() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public._skip_automation() then return null; end if;
  perform public.evaluate_rules(coalesce(new.organization_id, old.organization_id));
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['leads','tasks','customers','customer_compliance_items','payments','memberships','inventory_stock_levels','inventory_lots','inventory_transactions','rule_definitions'] loop
    execute format('create trigger trg_%1$s_eval after insert or update or delete on public.%1$I for each row execute function public.trg_evaluate()', t);
  end loop;
end $$;

-- time-based evaluation on demand (throttled)
create or replace function public.refresh_insights(_org uuid) returns timestamptz language plpgsql security definer set search_path=public as $$
declare _last timestamptz;
begin
  if not public.is_org_member(_org) then raise exception 'FORBIDDEN'; end if;
  select rules_evaluated_at into _last from public.organizations where id=_org;
  if _last is null or _last < now() - interval '2 minutes' then perform public.evaluate_rules(_org); end if;
  return now();
end $$;
revoke execute on function public.refresh_insights(uuid) from public, anon;
grant execute on function public.refresh_insights(uuid) to authenticated;

-- notifications for serious new insights
create or replace function public.insights_notify() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.severity in ('HIGH','CRITICAL') then
    insert into public.notifications(organization_id, user_id, title, body, insight_id, link)
    select new.organization_id, m.user_id, new.title, new.explanation, new.id, new.entity_type || ':' || new.entity_id
    from public.organization_members m
    where m.organization_id=new.organization_id and m.status='ACTIVE' and m.user_id is not null and m.role in ('OWNER','ADMIN','MANAGER')
      and (new.branch_id is null or m.role in ('OWNER','ADMIN') or exists (select 1 from public.member_branch_access a where a.organization_member_id=m.id and a.branch_id=new.branch_id));
  end if;
  return new;
end $$;
create trigger trg_insights_notify after insert on public.insights for each row execute function public.insights_notify();

-- ========== inventory operation ==========
create or replace function public.apply_inventory_transaction(
  _branch uuid, _product uuid, _type text, _quantity numeric,
  _notes text default null, _reference text default null,
  _override boolean default false, _override_reason text default null,
  _expiry_date date default null, _lot_number text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _p record; _sl record; _delta numeric; _after numeric; _tx uuid; _remaining numeric; _lot record; _take numeric;
begin
  select * into _p from public.inventory_products where id=_product and deleted_at is null;
  if _p is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if not public.has_branch_access(_p.organization_id, _branch) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.branches where id=_branch and organization_id=_p.organization_id) then raise exception 'FORBIDDEN'; end if;
  if _p.status <> 'ACTIVE' then
    raise exception 'PRODUCT_INACTIVE' using detail = coalesce(_p.replacement_product_id::text, '');
  end if;
  if _type not in ('RECEIPT','SALE','RETURN_TO_SUPPLIER','MANUAL_ADJUSTMENT','PHYSICAL_COUNT','TRANSFER_IN','TRANSFER_OUT') then raise exception 'INVALID_TYPE'; end if;
  if _quantity is null or (_type <> 'MANUAL_ADJUSTMENT' and _type <> 'PHYSICAL_COUNT' and _quantity <= 0) or (_type = 'PHYSICAL_COUNT' and _quantity < 0) then
    raise exception 'INVALID_QUANTITY'; end if;
  if _type = 'MANUAL_ADJUSTMENT' and not public.is_org_manager(_p.organization_id) then raise exception 'FORBIDDEN'; end if;

  insert into public.inventory_stock_levels(organization_id, branch_id, product_id) values (_p.organization_id, _branch, _product)
  on conflict (branch_id, product_id) do nothing;
  select * into _sl from public.inventory_stock_levels where branch_id=_branch and product_id=_product for update;

  _delta := case _type when 'PHYSICAL_COUNT' then _quantity - _sl.current_stock
    when 'MANUAL_ADJUSTMENT' then _quantity
    when 'RECEIPT' then _quantity when 'TRANSFER_IN' then _quantity
    else -abs(_quantity) end;
  _after := _sl.current_stock + _delta;

  if _after < 0 then
    if not coalesce(_override, false) then raise exception 'NEGATIVE_STOCK' using detail = _sl.current_stock::text; end if;
    if not public.is_org_manager(_p.organization_id) then raise exception 'OVERRIDE_NOT_ALLOWED'; end if;
    if coalesce(trim(_override_reason), '') = '' then raise exception 'OVERRIDE_REASON_REQUIRED'; end if;
  end if;

  update public.inventory_stock_levels set current_stock=_after where id=_sl.id;
  insert into public.inventory_transactions(organization_id, branch_id, product_id, transaction_type, quantity_delta, stock_before, stock_after,
    reference, notes, performed_by, override_used, override_reason, metadata)
  values (_p.organization_id, _branch, _product, _type, _delta, _sl.current_stock, _after, _reference, _notes, auth.uid(),
    _after < 0, case when _after < 0 then _override_reason end, jsonb_build_object('expiry_date', _expiry_date, 'lot_number', _lot_number))
  returning id into _tx;

  if _delta > 0 and _type in ('RECEIPT','TRANSFER_IN') then
    insert into public.inventory_lots(organization_id, branch_id, product_id, lot_number, quantity, received_at, expiry_date, supplier_id)
    values (_p.organization_id, _branch, _product, _lot_number, _delta, now(), _expiry_date, _p.default_supplier_id);
  elsif _delta < 0 then
    _remaining := -_delta;
    for _lot in select * from public.inventory_lots where branch_id=_branch and product_id=_product and quantity > 0 order by expiry_date nulls last, created_at loop
      exit when _remaining <= 0;
      _take := least(_lot.quantity, _remaining);
      update public.inventory_lots set quantity = quantity - _take where id=_lot.id;
      _remaining := _remaining - _take;
    end loop;
  end if;

  return jsonb_build_object('transaction_id', _tx, 'stock_before', _sl.current_stock, 'stock_after', _after, 'delta', _delta);
end $$;
revoke execute on function public.apply_inventory_transaction(uuid,uuid,text,numeric,text,text,boolean,text,date,text) from public, anon;
grant execute on function public.apply_inventory_transaction(uuid,uuid,text,numeric,text,text,boolean,text,date,text) to authenticated;

-- ========== lead conversion ==========
create or replace function public.convert_lead_to_customer(_lead uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare _l record; _c uuid;
begin
  select * into _l from public.leads where id=_lead and deleted_at is null for update;
  if _l is null then raise exception 'NOT_FOUND'; end if;
  if not public.has_branch_access(_l.organization_id, _l.branch_id) then raise exception 'FORBIDDEN'; end if;
  if _l.converted_customer_id is not null then return _l.converted_customer_id; end if;
  insert into public.customers(organization_id, home_branch_id, full_name, phone, email, status, created_by)
  values (_l.organization_id, _l.branch_id, _l.full_name, _l.phone, _l.email, 'PENDING', auth.uid()) returning id into _c;
  update public.leads set status='WON', converted_customer_id=_c where id=_lead;
  update public.tasks set status='COMPLETED' where entity_type='lead' and entity_id=_lead and status in ('OPEN','IN_PROGRESS');
  insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, metadata)
  values (_l.organization_id, _l.branch_id, 'customer', _c, 'CUSTOMER_CREATED', 'נוצר מליד', auth.uid(), jsonb_build_object('lead_id', _lead));
  return _c;
end $$;
revoke execute on function public.convert_lead_to_customer(uuid) from public, anon;
grant execute on function public.convert_lead_to_customer(uuid) to authenticated;

-- ========== search & dashboard (run as the caller, RLS applies) ==========
create or replace function public.search_entities(_q text, _limit int default 12)
returns table(entity_type text, id uuid, title text, status text, phone text)
language sql stable security invoker set search_path=public as $$
  with q as (select trim(_q) t, regexp_replace(regexp_replace(coalesce(_q,''),'\D','','g'),'^(972|0)','') p)
  (select 'customer', c.id, c.full_name, c.status, c.phone from public.customers c, q
    where c.deleted_at is null and length(q.t) >= 2 and (c.full_name ilike '%'||q.t||'%' or (length(q.p) >= 3 and c.normalized_phone like '%'||q.p||'%')
      or c.national_id = q.t or c.email ilike q.t||'%') limit _limit)
  union all
  (select 'lead', l.id, l.full_name, l.status, l.phone from public.leads l, q
    where l.deleted_at is null and length(q.t) >= 2 and (l.full_name ilike '%'||q.t||'%' or (length(q.p) >= 3 and l.normalized_phone like '%'||q.p||'%')
      or l.email ilike q.t||'%') limit _limit)
$$;

create or replace function public.get_dashboard_kpis(_org uuid, _branch uuid default null) returns jsonb
language sql stable security invoker set search_path=public as $$
  select jsonb_build_object(
    'active_customers', (select count(*) from public.customers where organization_id=_org and deleted_at is null and status='ACTIVE' and (_branch is null or home_branch_id=_branch)),
    'new_customers', (select count(*) from public.customers where organization_id=_org and deleted_at is null and joined_at >= now()-interval '30 days' and (_branch is null or home_branch_id=_branch)),
    'new_customers_prev', (select count(*) from public.customers where organization_id=_org and deleted_at is null and joined_at >= now()-interval '60 days' and joined_at < now()-interval '30 days' and (_branch is null or home_branch_id=_branch)),
    'new_leads', (select count(*) from public.leads where organization_id=_org and deleted_at is null and created_at >= now()-interval '30 days' and (_branch is null or branch_id=_branch)),
    'new_leads_prev', (select count(*) from public.leads where organization_id=_org and deleted_at is null and created_at >= now()-interval '60 days' and created_at < now()-interval '30 days' and (_branch is null or branch_id=_branch)),
    'won_leads', (select count(*) from public.leads where organization_id=_org and deleted_at is null and status='WON' and updated_at >= now()-interval '30 days' and (_branch is null or branch_id=_branch)),
    'closed_leads', (select count(*) from public.leads where organization_id=_org and deleted_at is null and status in ('WON','LOST') and updated_at >= now()-interval '30 days' and (_branch is null or branch_id=_branch)),
    'revenue', (select coalesce(sum(amount),0) from public.payments where organization_id=_org and status='PAID' and paid_at >= date_trunc('month', now()) and (_branch is null or branch_id=_branch)),
    'revenue_prev', (select coalesce(sum(amount),0) from public.payments where organization_id=_org and status='PAID' and paid_at >= date_trunc('month', now()) - interval '1 month' and paid_at < now() - interval '1 month' and (_branch is null or branch_id=_branch)),
    'cancellations', (select count(*) from public.memberships where organization_id=_org and status='CANCELLED' and updated_at >= now()-interval '30 days' and (_branch is null or branch_id=_branch))
  ) $$;

-- ========== first login ==========
create or replace function public.bootstrap_current_user(_full_name text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare _uid uuid := auth.uid(); _email text := auth.jwt()->>'email'; _name text; _m uuid;
  _org uuid := '00000000-0000-0000-0000-00000000a001';
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  _name := coalesce(nullif(trim(_full_name),''), nullif(auth.jwt()->'user_metadata'->>'full_name',''), nullif(auth.jwt()->'user_metadata'->>'name',''), split_part(_email,'@',1));
  insert into public.profiles(id, full_name) values (_uid, _name) on conflict (id) do nothing;
  if exists (select 1 from public.organization_members where user_id=_uid) then return jsonb_build_object('status','existing'); end if;
  if not exists (select 1 from public.organizations where id=_org) then return jsonb_build_object('status','no_org'); end if;
  update public.organization_members set user_id=_uid, status='ACTIVE', joined_at=now(), display_name=_name, invited_email=_email
    where id='00000000-0000-0000-0000-00000000c001' and user_id is null returning id into _m;
  if _m is not null then return jsonb_build_object('status','owner'); end if;
  insert into public.organization_members(organization_id, user_id, display_name, invited_email, role, status, joined_at)
  values (_org, _uid, _name, _email, 'EMPLOYEE', 'ACTIVE', now()) returning id into _m;
  insert into public.member_branch_access(organization_member_id, branch_id) values (_m, '00000000-0000-0000-0000-00000000b001');
  return jsonb_build_object('status','employee');
end $$;
revoke execute on function public.bootstrap_current_user(text) from public, anon;
grant execute on function public.bootstrap_current_user(text) to authenticated;

-- ========== private documents storage ==========
create policy "customer docs read" on storage.objects for select to authenticated
  using (bucket_id = 'customer-documents' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "customer docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-documents' and public.is_org_member(((storage.foldername(name))[1])::uuid));