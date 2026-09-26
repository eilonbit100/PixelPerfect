revoke execute on function public.audit_row(), public.leads_validate(), public.leads_timeline(), public.tasks_timeline(), public.tasks_completed_at(),
  public.activities_touch_lead(), public.customers_init_compliance(), public.documents_to_compliance(), public.trg_evaluate(), public.insights_notify(),
  public._skip_automation() from public, anon, authenticated;

set local app.skip_automation = 'on';

-- system rules
insert into public.rule_definitions(organization_id, key, name, entity_type, default_severity, configuration) values
 (null,'INVALID_FOLLOW_UP','ליד במעקב ללא משימת המשך','lead','HIGH','{}'),
 (null,'OVERDUE_TASK','משימה באיחור','task','WARNING','{}'),
 (null,'MISSING_LOST_REASON','ליד שאבד ללא סיבה','lead','WARNING','{}'),
 (null,'INACTIVE_LEAD','ליד לא מטופל','lead','WARNING','{"days":5}'),
 (null,'MISSING_COMPLIANCE','מסמכים חסרים ללקוח','customer','HIGH','{}'),
 (null,'FAILED_PAYMENT','חיוב שנכשל','payment','WARNING','{}'),
 (null,'INCOMPLETE_ONBOARDING','פתיחת כרטיס לא הושלמה','customer','ATTENTION','{}'),
 (null,'LOW_STOCK','מלאי נמוך','inventory_stock_level','WARNING','{}'),
 (null,'OUT_OF_STOCK','אזל מהמלאי','inventory_stock_level','CRITICAL','{}'),
 (null,'NEAR_EXPIRY','תוקף קרוב','inventory_lot','WARNING','{"days":14}'),
 (null,'COUNT_DISCREPANCY','פער בספירת מלאי','inventory_transaction','WARNING','{}'),
 (null,'INVENTORY_OVERRIDE','הרשאת חריגת מלאי','inventory_transaction','INFO','{"allowed_roles":["OWNER","ADMIN","MANAGER"]}');

insert into public.compliance_requirements(organization_id, key, name, required) values
 (null,'HEALTH_DECLARATION','הצהרת בריאות',true),
 (null,'SIGNED_TERMS','תקנון חתום',true),
 (null,'PAYMENT_METHOD','אמצעי תשלום',true),
 (null,'ID_DOCUMENT','צילום ת״ז',false);

insert into public.organizations(id, name, legal_name, phone, email) values
 ('00000000-0000-0000-0000-00000000a001','FitLife רשת מועדוני כושר','פיטלייף בע״מ','03-555-0100','office@fitlife.co.il');

insert into public.branches(id, organization_id, name, address, phone) values
 ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000a001','תל אביב – מרכז','אבן גבירול 88, תל אביב','03-555-0101'),
 ('00000000-0000-0000-0000-00000000b002','00000000-0000-0000-0000-00000000a001','רמת גן','ז׳בוטינסקי 35, רמת גן','03-555-0102'),
 ('00000000-0000-0000-0000-00000000b003','00000000-0000-0000-0000-00000000a001','הרצליה','סוקולוב 12, הרצליה','09-555-0103');

insert into public.organization_members(id, organization_id, display_name, invited_email, role, status) values
 ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000a001','דנה לוי','dana@fitlife.co.il','OWNER','INVITED'),
 ('00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000a001','אורי שפירא','uri@fitlife.co.il','MANAGER','INVITED'),
 ('00000000-0000-0000-0000-00000000c003','00000000-0000-0000-0000-00000000a001','יוסי כהן','yossi@fitlife.co.il','EMPLOYEE','INVITED'),
 ('00000000-0000-0000-0000-00000000c004','00000000-0000-0000-0000-00000000a001','מיכל אברהם','michal@fitlife.co.il','EMPLOYEE','INVITED');
insert into public.member_branch_access(organization_member_id, branch_id) values
 ('00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000b001'),
 ('00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000b002'),
 ('00000000-0000-0000-0000-00000000c003','00000000-0000-0000-0000-00000000b001'),
 ('00000000-0000-0000-0000-00000000c004','00000000-0000-0000-0000-00000000b002'),
 ('00000000-0000-0000-0000-00000000c004','00000000-0000-0000-0000-00000000b003');

insert into public.membership_plans(id, organization_id, name, price, billing_period) values
 ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-00000000a001','Gym חודשי',149,'MONTHLY'),
 ('00000000-0000-0000-0000-00000000d002','00000000-0000-0000-0000-00000000a001','Gym + סטודיו',229,'MONTHLY'),
 ('00000000-0000-0000-0000-00000000d003','00000000-0000-0000-0000-00000000a001','מנוי שנתי',1490,'YEARLY'),
 ('00000000-0000-0000-0000-00000000d004','00000000-0000-0000-0000-00000000a001','כרטיסייה 10 כניסות',450,'PUNCH_CARD');

do $$
declare
  _org uuid := '00000000-0000-0000-0000-00000000a001';
  _branches uuid[] := array['00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000b002','00000000-0000-0000-0000-00000000b003']::uuid[];
  _members uuid[] := array['00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000c003','00000000-0000-0000-0000-00000000c004','00000000-0000-0000-0000-00000000c002']::uuid[];
  _first text[] := array['דניאל','מאיה','רועי','נועה','איתי','שירה','עומר','יעל','אלון','תמר','גיא','ליאור','עדי','נדב','הילה','אסף','רוני','מור','עידו','שני','אביב','ליה','יונתן','ענבל','תומר','קרן','אייל','דנה','בן','רותם','אורן','שקד','ניר','גלית','עמית','אור','חן','רז','ליאת','יובל','אריאל','מיכאל','נטע','שחר','אלה','טל','עינב','דור','מעיין','זיו'];
  _last text[] := array['כהן','לוי','ישראלי','מזרחי','פרץ','ביטון','אברהם','פרידמן','שלום','אזולאי','דהן','חדד','גבאי','עמר','בן דוד','קליין','רוזן','שפירא','ויס','אוחיון'];
  _sources text[] := array['FACEBOOK','INSTAGRAM','WEBSITE','REFERRAL','WALK_IN','GOOGLE'];
  i int; _id uuid; _br uuid; _mem uuid; _status text; _created timestamptz; _last_act timestamptz; _phone text; _loss text;
  _cust uuid; _plan uuid; _price numeric; _ms uuid; _cstatus text; _joined timestamptz; r record; k int;
  _sup uuid[]; _prod uuid[]; _pname text[]; _pcat text[];
begin
  -- ===== leads =====
  for i in 1..30 loop
    _id := gen_random_uuid(); _br := _branches[1 + (i % 3)]; _mem := _members[1 + (i % 4)];
    _phone := '05' || (2 + i % 7)::text || '-' || lpad((100 + i * 17)::text, 3, '0') || '-' || lpad((1000 + i * 263 % 9000)::text, 4, '0');
    _created := now() - make_interval(days => (i % 20) + 1, hours => i);
    _loss := null;
    if i <= 6 then _status := 'FOLLOW_UP'; _last_act := now() - interval '1 day';
    elsif i <= 11 then _status := 'FOLLOW_UP'; _last_act := now() - make_interval(days => 2 + i % 3);
    elsif i <= 15 then _status := 'FOLLOW_UP'; _last_act := now() - interval '3 days';
    elsif i <= 18 then _status := 'NEW'; _created := now() - make_interval(hours => i * 2); _last_act := null;
    elsif i <= 21 then _status := 'CONTACT_ATTEMPT'; _created := now() - interval '15 days'; _last_act := now() - interval '10 days';
    elsif i <= 23 then _status := 'TRIAL'; _last_act := now() - interval '1 day';
    elsif i <= 26 then _status := 'LOST'; _last_act := now() - interval '6 days'; if i = 24 then _loss := 'PRICE'; end if;
    else _status := 'WON'; _last_act := now() - interval '4 days';
    end if;
    insert into public.leads(id, organization_id, branch_id, full_name, phone, email, source, status, assigned_member_id, loss_reason, last_activity_at, created_at, updated_at)
    values (_id, _org, _br, _first[i] || ' ' || _last[1 + (i % 20)], _phone, case when i % 3 = 0 then 'lead' || i || '@mail.co.il' end,
      _sources[1 + (i % 6)], _status, _mem, _loss, _last_act, _created, coalesce(_last_act, _created));

    insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, created_at)
    values (_org, _br, 'lead', _id, 'LEAD_CREATED', 'ליד נוצר', null, _created);
    if _last_act is not null then
      insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, created_at)
      values (_org, _br, 'lead', _id, 'CALL', (array['שיחה ראשונית – מתעניין במנוי חודשי','שוחחנו, ביקש לחזור אליו בשבוע הבא','תיאום אימון ניסיון','שלחנו הצעת מחיר בוואטסאפ'])[1 + i % 4], null, _last_act);
    end if;

    if i <= 6 or i in (22, 23) then
      insert into public.tasks(organization_id, branch_id, title, assigned_member_id, due_at, priority, status, entity_type, entity_id, source, created_at)
      values (_org, _br, 'שיחת המשך עם ' || _first[i], _mem, now() + make_interval(days => 1 + i % 3, hours => 2), 'NORMAL', 'OPEN', 'lead', _id, 'MANUAL', _last_act);
    elsif i between 12 and 15 then
      insert into public.tasks(organization_id, branch_id, title, assigned_member_id, due_at, priority, status, entity_type, entity_id, source, created_at)
      values (_org, _br, 'לחזור ל' || _first[i] || ' לגבי הצעת מחיר', _mem, now() - make_interval(days => i - 11), 'HIGH', 'OPEN', 'lead', _id, 'MANUAL', _last_act);
    end if;
    if i >= 27 then
      insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, performed_by, created_at, metadata)
      values (_org, _br, 'lead', _id, 'CONVERTED', 'הליד הפך ללקוח', null, _last_act, '{"from":"TRIAL","to":"WON"}');
    end if;
  end loop;

  -- ===== customers =====
  for i in 1..50 loop
    _cust := gen_random_uuid(); _br := _branches[1 + (i % 3)];
    _joined := now() - make_interval(days => case when i <= 12 then i * 2 else 30 + i * 9 end);
    _cstatus := case when i between 41 and 44 then 'INACTIVE' when i in (8, 9) then 'PENDING' else 'ACTIVE' end;
    insert into public.customers(id, organization_id, home_branch_id, full_name, phone, email, national_id, status, joined_at, created_at)
    values (_cust, _org, _br, _first[1 + ((i * 7) % 50)] || ' ' || _last[1 + ((i * 3) % 20)],
      '05' || (i % 8)::text || '-' || lpad((200 + i * 13)::text, 3, '0') || '-' || lpad((2000 + i * 157 % 8000)::text, 4, '0'),
      'member' || i || '@gmail.com', lpad((300000000 + i * 1234567)::text, 9, '0'), _cstatus, _joined, _joined);

    -- compliance
    for r in select id, key from public.compliance_requirements where organization_id is null loop
      insert into public.customer_compliance_items(organization_id, customer_id, requirement_id, status, completed_at)
      values (_org, _cust, r.id,
        case
          when r.key = 'ID_DOCUMENT' then case when i % 2 = 0 then 'VALID' else 'NOT_REQUIRED' end
          when r.key = 'HEALTH_DECLARATION' and i between 1 and 5 then 'MISSING'
          when r.key = 'SIGNED_TERMS' and i in (4, 6, 7) then 'MISSING'
          when r.key = 'PAYMENT_METHOD' and i in (8, 9) then 'MISSING'
          else 'VALID' end,
        case when not (r.key = 'HEALTH_DECLARATION' and i <= 5) then _joined end);
    end loop;

    -- memberships & payments (skip 8,9 = incomplete onboarding)
    if i not in (8, 9) then
      k := 1 + (i % 4); if k = 4 then k := 1; end if;
      _plan := ('00000000-0000-0000-0000-00000000d00' || k)::uuid;
      _price := case k when 1 then 149 when 2 then 229 else 1490 end;
      _ms := gen_random_uuid();
      insert into public.memberships(id, organization_id, branch_id, customer_id, membership_plan_id, display_name, price, start_date, end_date, status, created_at, updated_at)
      values (_ms, _org, _br, _cust, _plan, (array['Gym חודשי','Gym + סטודיו','מנוי שנתי'])[k], _price, _joined::date,
        case when k = 3 then (_joined + interval '1 year')::date end,
        case when i between 41 and 43 then 'CANCELLED' when i = 44 then 'EXPIRED' else 'ACTIVE' end,
        _joined, case when i between 41 and 43 then now() - make_interval(days => i - 35) else _joined end);

      if k = 3 then
        insert into public.payments(organization_id, branch_id, customer_id, membership_id, amount, status, due_at, paid_at, created_at)
        values (_org, _br, _cust, _ms, _price, 'PAID', _joined, _joined, _joined);
      else
        for k in 0..2 loop
          if date_trunc('month', now()) - make_interval(months => k) >= date_trunc('month', _joined) and not (i between 41 and 44 and k = 0) then
            insert into public.payments(organization_id, branch_id, customer_id, membership_id, amount, status, due_at, paid_at, failure_reason, created_at)
            values (_org, _br, _cust, _ms, _price,
              case when k = 0 and i between 10 and 15 then 'FAILED' else 'PAID' end,
              date_trunc('month', now()) - make_interval(months => k) + interval '2 days',
              case when k = 0 and i between 10 and 15 then null else least(now(), date_trunc('month', now()) - make_interval(months => k) + interval '2 days') end,
              case when k = 0 and i between 10 and 15 then (array['כרטיס אשראי נדחה','פג תוקף הכרטיס','חריגה ממסגרת'])[1 + i % 3] end,
              date_trunc('month', now()) - make_interval(months => k));
          end if;
        end loop;
      end if;
    end if;

    if i in (10, 11) then
      insert into public.tasks(organization_id, branch_id, title, due_at, priority, status, entity_type, entity_id, source, rule_key, created_at)
      values (_org, _br, 'גביית חיוב שנכשל', now() - interval '2 days', 'HIGH', 'OPEN', 'customer', _cust, 'RULE', 'FAILED_PAYMENT', now() - interval '5 days');
    end if;
    insert into public.activities(organization_id, branch_id, entity_type, entity_id, activity_type, description, created_at, performed_by)
    values (_org, _br, 'customer', _cust, 'CUSTOMER_CREATED', 'כרטיס לקוח נפתח', _joined, null);
  end loop;

  -- general tasks
  insert into public.tasks(organization_id, branch_id, title, assigned_member_id, due_at, priority, status, source, created_at) values
    (_org, _branches[1], 'בדיקת מכשירי כושר – אזור משקולות', _members[4], now() + interval '5 hours', 'NORMAL', 'OPEN', 'MANUAL', now() - interval '1 day'),
    (_org, _branches[2], 'הכנת דו״ח חודשי לסניף', _members[1], now() + interval '3 days', 'LOW', 'OPEN', 'MANUAL', now() - interval '2 days'),
    (_org, _branches[3], 'תיאום הדרכת צוות קבלה', _members[3], now() - interval '1 day', 'NORMAL', 'OPEN', 'MANUAL', now() - interval '6 days'),
    (_org, _branches[1], 'חידוש חוזה ניקיון', _members[1], now() - interval '4 days', 'NORMAL', 'COMPLETED', 'MANUAL', now() - interval '10 days');
  update public.tasks set completed_at = now() - interval '4 days' where status = 'COMPLETED' and completed_at is null;

  -- ===== inventory =====
  _sup := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  insert into public.suppliers(id, organization_id, name, phone, email, default_return_window_days) values
    (_sup[1], _org, 'משקאות הצפון', '04-666-1111', 'orders@north-drinks.co.il', 20),
    (_sup[2], _org, 'פרוטאין פלוס', '03-777-2222', 'sales@proteinplus.co.il', 30),
    (_sup[3], _org, 'ספורט ציוד בע״מ', '09-888-3333', 'info@sportgear.co.il', null),
    (_sup[4], _org, 'בריאות טבעית', '08-999-4444', 'office@natural.co.il', 14);

  _pname := array['מים מינרליים 500 מ״ל','משקה איזוטוני','משקה חלבון שוקו','משקה חלבון וניל','חטיף חלבון בוטנים','חטיף חלבון שוקולד','יוגורט חלבון',
    'חטיף אנרגיה (ישן)','חטיף אנרגיה','מגבת מיקרופייבר','בקבוק שייקר','כפפות אימון','רצועות התנגדות','אבקת חלבון 1 ק״ג','קריאטין 300 ג׳',
    'BCAA לימון','קפה קר','משקה אנרגיה','מנעול לוקר','גומיות שיער'];
  _pcat := array['משקאות','משקאות','משקאות','משקאות','חטיפים','חטיפים','מקרר','חטיפים','חטיפים','ציוד','ציוד','ציוד','ציוד','תוספים','תוספים','תוספים','משקאות','משקאות','ציוד','ציוד'];
  _prod := array[]::uuid[];
  for i in 1..20 loop _prod := _prod || gen_random_uuid(); end loop;
  for i in 1..20 loop
    insert into public.inventory_products(id, organization_id, name, sku, barcode, category, status, default_supplier_id, returnable, price, replacement_product_id)
    values (_prod[i], _org, _pname[i], 'SKU-' || lpad(i::text, 4, '0'), '7290' || lpad((100000 + i * 7919)::text, 9, '0'), _pcat[i],
      case when i = 8 then 'INACTIVE' else 'ACTIVE' end,
      _sup[case when _pcat[i] = 'משקאות' then 1 when _pcat[i] in ('חטיפים','תוספים','מקרר') then 2 when _pcat[i] = 'ציוד' then 3 else 4 end],
      _pcat[i] in ('משקאות','חטיפים','מקרר'), 5 + (i * 7 % 60), null);
  end loop;
  update public.inventory_products set replacement_product_id = _prod[9] where id = _prod[8];

  for i in 1..20 loop
    for k in 1..3 loop
      declare _qty numeric; _min numeric := 10; _exp date;
      begin
        _qty := 20 + (i * 11 + k * 7) % 40;
        if i = 5 and k = 1 then _qty := 4; end if;
        if i = 6 and k = 1 then _qty := 0; end if;
        if i = 18 and k = 2 then _qty := 3; end if;
        if i = 8 then _qty := 6; end if;
        _exp := case when _pcat[i] in ('משקאות','חטיפים','מקרר') then current_date + 90 + i else null end;
        if i = 3 and k = 1 then _exp := current_date + 8; end if;
        if i = 7 and k = 2 then _exp := current_date + 3; end if;
        insert into public.inventory_stock_levels(organization_id, branch_id, product_id, current_stock, minimum_stock)
        values (_org, _branches[k], _prod[i], _qty, _min);
        insert into public.inventory_transactions(organization_id, branch_id, product_id, transaction_type, quantity_delta, stock_before, stock_after, reference, created_at)
        values (_org, _branches[k], _prod[i], 'RECEIPT', _qty + 12, 0, _qty + 12, 'קבלה ראשונית', now() - interval '20 days');
        insert into public.inventory_transactions(organization_id, branch_id, product_id, transaction_type, quantity_delta, stock_before, stock_after, created_at)
        values (_org, _branches[k], _prod[i], 'SALE', -12, _qty + 12, _qty, now() - interval '3 days');
        if _qty > 0 then
          insert into public.inventory_lots(organization_id, branch_id, product_id, lot_number, quantity, received_at, expiry_date, supplier_id)
          values (_org, _branches[k], _prod[i], 'L' || i || k || '-26', _qty, now() - interval '20 days', _exp, null);
        end if;
      end;
    end loop;
  end loop;
  -- physical count discrepancy: product 10 at branch 1 (system 31, counted 26)
  update public.inventory_stock_levels set current_stock = current_stock - 5 where product_id = _prod[10] and branch_id = _branches[1];
  insert into public.inventory_transactions(organization_id, branch_id, product_id, transaction_type, quantity_delta, stock_before, stock_after, notes, created_at)
  select _org, _branches[1], _prod[10], 'PHYSICAL_COUNT', -5, current_stock + 5, current_stock, 'ספירה חודשית', now() - interval '1 day'
  from public.inventory_stock_levels where product_id = _prod[10] and branch_id = _branches[1];
  update public.inventory_lots set quantity = quantity - 5 where product_id = _prod[10] and branch_id = _branches[1];
end $$;

update public.leads set converted_customer_id = null where status = 'WON';

select public.evaluate_rules('00000000-0000-0000-0000-00000000a001');