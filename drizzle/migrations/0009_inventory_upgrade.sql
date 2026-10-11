ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'SHELF',
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS variant text,
  ADD COLUMN IF NOT EXISTS cost numeric(12,2),
  ADD COLUMN IF NOT EXISTS track_expiry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS import_code text,
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.inventory_products.price IS 'Sale price (separate from cost)';
UPDATE public.inventory_products SET kind='EQUIPMENT' WHERE category='ציוד';
UPDATE public.inventory_products p SET track_expiry=true WHERE EXISTS (SELECT 1 FROM public.inventory_lots l WHERE l.product_id=p.id AND l.expiry_date IS NOT NULL);
ALTER TABLE public.inventory_products ADD CONSTRAINT inventory_products_kind_check CHECK (kind IN ('SHELF','EQUIPMENT'));
CREATE UNIQUE INDEX IF NOT EXISTS inventory_products_import_code_uq ON public.inventory_products(organization_id, import_code) WHERE import_code IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.inventory_stock_levels ADD COLUMN IF NOT EXISTS target_stock numeric(12,2);

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS lead_time_days integer,
  ADD COLUMN IF NOT EXISTS expired_return_policy text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.inventory_lots ADD COLUMN IF NOT EXISTS return_deadline date;
UPDATE public.inventory_lots l SET return_deadline = (l.received_at AT TIME ZONE 'Asia/Jerusalem')::date + s.default_return_window_days
  FROM public.suppliers s WHERE s.id=l.supplier_id AND s.default_return_window_days IS NOT NULL AND l.received_at IS NOT NULL;

ALTER TABLE public.inventory_transactions DROP CONSTRAINT inventory_transactions_transaction_type_check;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_transaction_type_check CHECK (transaction_type IN
  ('RECEIPT','SALE','RETURN_TO_SUPPLIER','MANUAL_ADJUSTMENT','PHYSICAL_COUNT','TRANSFER_IN','TRANSFER_OUT','CUSTOMER_RETURN','WRITE_OFF'));
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS document_path text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_transactions_idem_uq ON public.inventory_transactions(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','APPROVED','CANCELLED')),
  note text,
  opened_by uuid REFERENCES public.organization_members(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES public.organization_members(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.stock_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  count_id uuid NOT NULL REFERENCES public.stock_counts(id),
  product_id uuid NOT NULL REFERENCES public.inventory_products(id),
  system_qty numeric(12,2) NOT NULL,
  counted_qty numeric(12,2),
  reason text,
  counted_by uuid REFERENCES public.organization_members(id),
  counted_at timestamptz,
  applied_delta numeric(12,2),
  UNIQUE (count_id, product_id)
);
GRANT SELECT ON public.stock_counts, public.stock_count_lines TO authenticated;
GRANT ALL ON public.stock_counts, public.stock_count_lines TO service_role;
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_counts_select ON public.stock_counts FOR SELECT TO authenticated USING (public.has_branch_access(organization_id, branch_id));
CREATE POLICY stock_count_lines_select ON public.stock_count_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stock_counts c WHERE c.id=count_id AND public.has_branch_access(c.organization_id, c.branch_id)));

CREATE POLICY inventory_docs_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='inventory-docs' AND public.has_branch_access((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2]::uuid));
CREATE POLICY inventory_docs_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='inventory-docs' AND public.has_branch_access((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2]::uuid));

DROP FUNCTION public.apply_inventory_transaction(uuid,uuid,text,numeric,text,text,boolean,text,date,text);
CREATE FUNCTION public.apply_inventory_transaction(_branch uuid, _product uuid, _type text, _quantity numeric,
  _notes text DEFAULT NULL, _reference text DEFAULT NULL, _override boolean DEFAULT false, _override_reason text DEFAULT NULL,
  _expiry_date date DEFAULT NULL, _lot_number text DEFAULT NULL, _reason text DEFAULT NULL, _document_path text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL, _lot_id uuid DEFAULT NULL, _supplier uuid DEFAULT NULL, _meta jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare _p record; _sl record; _delta numeric; _after numeric; _tx uuid; _remaining numeric; _lot record; _take numeric; _prev record;
  _mgr boolean; _sup uuid; _win int;
begin
  select * into _p from public.inventory_products where id=_product and deleted_at is null;
  if _p is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if not public.has_branch_access(_p.organization_id, _branch) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.branches where id=_branch and organization_id=_p.organization_id) then raise exception 'FORBIDDEN'; end if;
  _mgr := public.is_org_manager(_p.organization_id);

  if _idempotency_key is not null then
    select * into _prev from public.inventory_transactions where organization_id=_p.organization_id and idempotency_key=_idempotency_key;
    if found then
      return jsonb_build_object('transaction_id', _prev.id, 'stock_before', _prev.stock_before, 'stock_after', _prev.stock_after, 'delta', _prev.quantity_delta, 'duplicate', true);
    end if;
  end if;

  if _p.status <> 'ACTIVE' and _type not in ('PHYSICAL_COUNT','WRITE_OFF','RETURN_TO_SUPPLIER') then
    raise exception 'PRODUCT_INACTIVE' using detail = coalesce(_p.replacement_product_id::text, '');
  end if;
  if _type not in ('RECEIPT','SALE','RETURN_TO_SUPPLIER','MANUAL_ADJUSTMENT','PHYSICAL_COUNT','TRANSFER_IN','TRANSFER_OUT','CUSTOMER_RETURN','WRITE_OFF') then raise exception 'INVALID_TYPE'; end if;
  if _quantity is null or (_type <> 'MANUAL_ADJUSTMENT' and _type <> 'PHYSICAL_COUNT' and _quantity <= 0) or (_type = 'PHYSICAL_COUNT' and _quantity < 0) then
    raise exception 'INVALID_QUANTITY'; end if;
  if _type in ('MANUAL_ADJUSTMENT','WRITE_OFF','RETURN_TO_SUPPLIER','TRANSFER_IN','TRANSFER_OUT') and not _mgr then raise exception 'FORBIDDEN'; end if;
  if _type in ('WRITE_OFF','MANUAL_ADJUSTMENT','CUSTOMER_RETURN') and coalesce(trim(_reason),'')='' then raise exception 'REASON_REQUIRED'; end if;

  insert into public.inventory_stock_levels(organization_id, branch_id, product_id) values (_p.organization_id, _branch, _product)
  on conflict (branch_id, product_id) do nothing;
  select * into _sl from public.inventory_stock_levels where branch_id=_branch and product_id=_product for update;

  _delta := case _type when 'PHYSICAL_COUNT' then _quantity - _sl.current_stock
    when 'MANUAL_ADJUSTMENT' then _quantity
    when 'RECEIPT' then _quantity when 'TRANSFER_IN' then _quantity when 'CUSTOMER_RETURN' then _quantity
    else -abs(_quantity) end;
  _after := _sl.current_stock + _delta;

  if _after < 0 then
    if not coalesce(_override, false) then raise exception 'NEGATIVE_STOCK' using detail = _sl.current_stock::text; end if;
    if not _mgr then raise exception 'OVERRIDE_NOT_ALLOWED'; end if;
    if coalesce(trim(_override_reason), '') = '' then raise exception 'OVERRIDE_REASON_REQUIRED'; end if;
  end if;

  if _type = 'RETURN_TO_SUPPLIER' and _lot_id is not null then
    select * into _lot from public.inventory_lots where id=_lot_id and branch_id=_branch and product_id=_product for update;
    if _lot is null then raise exception 'LOT_NOT_FOUND'; end if;
    if _lot.quantity < abs(_quantity) then raise exception 'LOT_QUANTITY_EXCEEDED' using detail=_lot.quantity::text; end if;
    if _lot.return_deadline is not null and _lot.return_deadline < current_date then raise exception 'RETURN_WINDOW_CLOSED'; end if;
  end if;

  update public.inventory_stock_levels set current_stock=_after where id=_sl.id;
  insert into public.inventory_transactions(organization_id, branch_id, product_id, transaction_type, quantity_delta, stock_before, stock_after,
    reference, notes, performed_by, override_used, override_reason, metadata, reason, document_path, idempotency_key)
  values (_p.organization_id, _branch, _product, _type, _delta, _sl.current_stock, _after, _reference, _notes, auth.uid(),
    _after < 0, case when _after < 0 then _override_reason end,
    coalesce(_meta,'{}'::jsonb) || jsonb_build_object('expiry_date', _expiry_date, 'lot_number', _lot_number, 'lot_id', _lot_id, 'supplier_id', _supplier),
    nullif(trim(_reason),''), _document_path, _idempotency_key)
  returning id into _tx;

  if _delta > 0 and _type in ('RECEIPT','TRANSFER_IN','CUSTOMER_RETURN') then
    _sup := coalesce(_supplier, _p.default_supplier_id);
    select default_return_window_days into _win from public.suppliers where id=_sup;
    insert into public.inventory_lots(organization_id, branch_id, product_id, lot_number, quantity, received_at, expiry_date, supplier_id, return_deadline)
    values (_p.organization_id, _branch, _product, _lot_number, _delta, now(), _expiry_date, _sup,
      case when _type='RECEIPT' and _win is not null then current_date + _win end);
  elsif _delta < 0 then
    _remaining := -_delta;
    if _type = 'RETURN_TO_SUPPLIER' and _lot_id is not null then
      update public.inventory_lots set quantity = quantity - _remaining where id=_lot_id;
      _remaining := 0;
    end if;
    for _lot in select * from public.inventory_lots where branch_id=_branch and product_id=_product and quantity > 0 order by expiry_date nulls last, created_at loop
      exit when _remaining <= 0;
      _take := least(_lot.quantity, _remaining);
      update public.inventory_lots set quantity = quantity - _take where id=_lot.id;
      _remaining := _remaining - _take;
    end loop;
  end if;

  return jsonb_build_object('transaction_id', _tx, 'stock_before', _sl.current_stock, 'stock_after', _after, 'delta', _delta);
end $function$;

CREATE FUNCTION public.transfer_stock(_from uuid, _to uuid, _product uuid, _quantity numeric, _note text DEFAULT NULL, _idempotency_key text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare _org uuid; o jsonb; i jsonb; k text := coalesce(_idempotency_key, gen_random_uuid()::text);
begin
  select organization_id into _org from public.inventory_products where id=_product;
  if _from = _to then raise exception 'SAME_BRANCH'; end if;
  if not public.is_org_manager(_org) or not public.has_branch_access(_org,_from) or not public.has_branch_access(_org,_to) then raise exception 'FORBIDDEN'; end if;
  o := public.apply_inventory_transaction(_from, _product, 'TRANSFER_OUT', _quantity, _note, NULL, false, NULL, NULL, NULL, NULL, NULL, k || ':out', NULL, NULL, jsonb_build_object('to_branch', _to));
  i := public.apply_inventory_transaction(_to, _product, 'TRANSFER_IN', _quantity, _note, NULL, false, NULL, NULL, NULL, NULL, NULL, k || ':in', NULL, NULL, jsonb_build_object('from_branch', _from));
  return jsonb_build_object('out', o, 'in', i);
end $function$;

CREATE FUNCTION public.open_stock_count(_branch uuid, _products uuid[] DEFAULT NULL, _note text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare _org uuid; _id uuid;
begin
  select organization_id into _org from public.branches where id=_branch;
  if _org is null or not public.has_branch_access(_org,_branch) then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.stock_counts where branch_id=_branch and status='OPEN') then raise exception 'COUNT_ALREADY_OPEN'; end if;
  insert into public.stock_counts(organization_id, branch_id, note, opened_by) values (_org, _branch, nullif(trim(_note),''), public.current_member_id(_org)) returning id into _id;
  insert into public.stock_count_lines(organization_id, count_id, product_id, system_qty)
  select _org, _id, p.id, coalesce(sl.current_stock,0)
  from public.inventory_products p left join public.inventory_stock_levels sl on sl.product_id=p.id and sl.branch_id=_branch
  where p.organization_id=_org and p.deleted_at is null and p.status='ACTIVE' and p.kind='SHELF'
    and (_products is null or p.id = any(_products));
  if not exists (select 1 from public.stock_count_lines where count_id=_id) then raise exception 'NO_PRODUCTS'; end if;
  return _id;
end $function$;

CREATE FUNCTION public.set_count_line(_line uuid, _counted numeric, _reason text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c record;
begin
  select sc.* into c from public.stock_count_lines l join public.stock_counts sc on sc.id=l.count_id where l.id=_line;
  if c.id is null or not public.has_branch_access(c.organization_id, c.branch_id) then raise exception 'FORBIDDEN'; end if;
  if c.status <> 'OPEN' then raise exception 'COUNT_CLOSED'; end if;
  if _counted is not null and _counted < 0 then raise exception 'INVALID_QUANTITY'; end if;
  update public.stock_count_lines set counted_qty=_counted, reason=nullif(trim(_reason),''), counted_by=public.current_member_id(c.organization_id),
    counted_at=case when _counted is null then null else now() end where id=_line;
end $function$;

CREATE FUNCTION public.approve_stock_count(_count uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c record; l record; _cur numeric; _target numeric; _applied int := 0; _gaps int := 0; _uncounted int := 0;
begin
  select * into c from public.stock_counts where id=_count for update;
  if c.id is null or not public.has_branch_access(c.organization_id, c.branch_id) or not public.is_org_manager(c.organization_id) then raise exception 'FORBIDDEN'; end if;
  if c.status <> 'OPEN' then raise exception 'COUNT_CLOSED'; end if;
  if exists (select 1 from public.stock_count_lines where count_id=_count and counted_qty is not null and counted_qty <> system_qty and coalesce(reason,'')='') then
    raise exception 'GAP_REASON_REQUIRED'; end if;
  for l in select * from public.stock_count_lines where count_id=_count loop
    if l.counted_qty is null then _uncounted := _uncounted + 1; continue; end if;
    select coalesce(current_stock,0) into _cur from public.inventory_stock_levels where branch_id=c.branch_id and product_id=l.product_id;
    _target := l.counted_qty + (coalesce(_cur,0) - l.system_qty);
    if l.counted_qty <> l.system_qty then
      _gaps := _gaps + 1;
      perform public.apply_inventory_transaction(c.branch_id, l.product_id, 'PHYSICAL_COUNT', greatest(_target,0), NULL, 'ספירה', false, NULL, NULL, NULL,
        l.reason, NULL, 'count:' || l.id, NULL, NULL, jsonb_build_object('count_id', c.id, 'system', l.system_qty, 'counted', l.counted_qty));
    end if;
    update public.stock_count_lines set applied_delta = l.counted_qty - l.system_qty where id=l.id;
    _applied := _applied + 1;
  end loop;
  update public.stock_counts set status='APPROVED', approved_by=public.current_member_id(c.organization_id), approved_at=now() where id=_count;
  return jsonb_build_object('counted', _applied, 'gaps', _gaps, 'uncounted', _uncounted);
end $function$;

CREATE FUNCTION public.cancel_stock_count(_count uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c record;
begin
  select * into c from public.stock_counts where id=_count for update;
  if c.id is null or not public.has_branch_access(c.organization_id, c.branch_id) or not public.is_org_manager(c.organization_id) then raise exception 'FORBIDDEN'; end if;
  if c.status <> 'OPEN' then raise exception 'COUNT_CLOSED'; end if;
  update public.stock_counts set status='CANCELLED' where id=_count;
end $function$;

DROP POLICY inventory_products_insert ON public.inventory_products;
DROP POLICY inventory_products_update ON public.inventory_products;
CREATE POLICY inventory_products_insert ON public.inventory_products FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY inventory_products_update ON public.inventory_products FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
DROP POLICY suppliers_insert ON public.suppliers;
DROP POLICY suppliers_update ON public.suppliers;
CREATE POLICY suppliers_insert ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY suppliers_update ON public.suppliers FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.evaluate_rules'::regproc);
  d := replace(d, $q$where organization_id=_org and transaction_type='PHYSICAL_COUNT' and created_at > now() - interval '30 days'$q$,
               $q$where organization_id=_org and transaction_type='PHYSICAL_COUNT' and created_at > now() - interval '30 days' and coalesce(metadata->>'count_id','') = ''$q$);
  d := replace(d, $q$  update public.organizations set rules_evaluated_at = now() where id = _org;$q$, $q$  _rows := null; select * into _s from public.rule_setting(_org,'RETURN_WINDOW');
  _days := coalesce((_s.configuration->>'days')::int, 7);
  if coalesce(_s.enabled, true) then
    select jsonb_agg(jsonb_build_object('entity_id', lt.id, 'branch_id', lt.branch_id, 'title', 'חלון החזרה לספק נסגר',
      'explanation', p.name || ' — ' || lt.quantity::int || ' יח׳, ניתן להחזיר עד ' || to_char(lt.return_deadline,'DD.MM.YY'),
      'metadata', jsonb_build_object('product_id', p.id, 'return_deadline', lt.return_deadline, 'quantity', lt.quantity)))
    into _rows from public.inventory_lots lt join public.inventory_products p on p.id=lt.product_id
    where lt.organization_id=_org and lt.quantity > 0 and lt.return_deadline is not null
      and lt.return_deadline between current_date and current_date + _days and p.returnable;
  end if;
  perform public._sync_rule(_org,'RETURN_WINDOW','inventory_lot','WARNING','RETURN_TO_SUPPLIER',_rows);

  update public.organizations set rules_evaluated_at = now() where id = _org;$q$);
  IF position('RETURN_WINDOW' in d) = 0 OR position('count_id' in d) = 0 THEN RAISE EXCEPTION 'evaluate_rules patch failed'; END IF;
  EXECUTE d;

  d := pg_get_functiondef('public.run_report'::regproc);
  d := replace(d, $q$  ELSIF _key = 'purchases' THEN$q$, $q$  ELSIF _key = 'inv_movements' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT x.created_at at_time, p.name product, x.transaction_type tx_type, x.quantity_delta delta,
      x.stock_before, x.stock_after, coalesce(x.reason, x.override_reason, x.notes) reason, x.reference, b.name branch,
      (SELECT om.display_name FROM organization_members om WHERE om.user_id=x.performed_by AND om.organization_id=_org LIMIT 1) employee
      FROM inventory_transactions x JOIN inventory_products p ON p.id=x.product_id JOIN branches b ON b.id=x.branch_id
      WHERE x.organization_id=_org AND x.branch_id = ANY(br) AND (x.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to
      ORDER BY x.created_at DESC LIMIT 5000) t;
  ELSIF _key = 'inv_counts' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT (c.approved_at AT TIME ZONE tz)::date approved_on, b.name branch, p.name product,
      l.system_qty, l.counted_qty, l.counted_qty - l.system_qty difference, l.reason,
      (SELECT om.display_name FROM organization_members om WHERE om.id=c.approved_by) approver
      FROM stock_counts c JOIN stock_count_lines l ON l.count_id=c.id JOIN inventory_products p ON p.id=l.product_id JOIN branches b ON b.id=c.branch_id
      WHERE c.organization_id=_org AND c.status='APPROVED' AND c.branch_id = ANY(br) AND l.counted_qty IS NOT NULL
        AND (c.approved_at AT TIME ZONE tz)::date BETWEEN _from AND _to ORDER BY c.approved_at DESC, p.name LIMIT 5000) t;
  ELSIF _key = 'inv_writeoffs' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT x.created_at at_time, p.name product, x.transaction_type tx_type, -x.quantity_delta quantity,
      round(-x.quantity_delta * coalesce(p.cost,0),2) cost_value, coalesce(x.reason, x.notes) reason, x.reference, b.name branch
      FROM inventory_transactions x JOIN inventory_products p ON p.id=x.product_id JOIN branches b ON b.id=x.branch_id
      WHERE x.organization_id=_org AND x.branch_id = ANY(br) AND x.transaction_type IN ('WRITE_OFF','RETURN_TO_SUPPLIER')
        AND (x.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to ORDER BY x.created_at DESC LIMIT 5000) t;
  ELSIF _key = 'purchases' THEN$q$);
  IF position('inv_movements' in d) = 0 THEN RAISE EXCEPTION 'run_report patch failed'; END IF;
  EXECUTE d;
END $do$;