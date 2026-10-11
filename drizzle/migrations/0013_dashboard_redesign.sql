CREATE OR REPLACE FUNCTION public._inv_stats(_org uuid, br uuid[])
RETURNS TABLE(product_id uuid, branch_id uuid, product text, branch text, supplier text, current_stock numeric, minimum_stock numeric,
  target_stock numeric, sold30 numeric, last_sale timestamptz, lead_time integer, days_left numeric, suggested numeric, need_order boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH s AS (
    SELECT sl.product_id, sl.branch_id, p.name product, b.name branch, sp.name supplier, sl.current_stock, sl.minimum_stock, sl.target_stock,
      coalesce((SELECT sum(-x.quantity_delta) FROM inventory_transactions x WHERE x.product_id=sl.product_id AND x.branch_id=sl.branch_id
        AND x.transaction_type='SALE' AND x.created_at >= now()-interval '30 days'),0) sold30,
      (SELECT max(x.created_at) FROM inventory_transactions x WHERE x.product_id=sl.product_id AND x.branch_id=sl.branch_id AND x.transaction_type='SALE') last_sale,
      coalesce(sp.lead_time_days, 7) lead_time
    FROM inventory_stock_levels sl JOIN inventory_products p ON p.id=sl.product_id AND p.deleted_at IS NULL AND p.status='ACTIVE' AND p.kind='SHELF'
    JOIN branches b ON b.id=sl.branch_id LEFT JOIN suppliers sp ON sp.id=p.default_supplier_id
    WHERE sl.organization_id=_org AND sl.branch_id = ANY(br))
  SELECT s.*, d.days_left,
    CASE WHEN d.need THEN greatest(0, ceil(coalesce(s.target_stock, s.minimum_stock*2) + (s.sold30/30.0)*s.lead_time - s.current_stock)) ELSE 0 END,
    d.need
  FROM s, LATERAL (SELECT CASE WHEN s.sold30 > 0 THEN round(s.current_stock / (s.sold30/30.0), 1) END days_left) d0,
    LATERAL (SELECT d0.days_left, (s.current_stock <= s.minimum_stock OR (d0.days_left IS NOT NULL AND d0.days_left <= s.lead_time + 7)) need) d
$$;
REVOKE EXECUTE ON FUNCTION public._inv_stats(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._inv_report_rows(_org uuid, _key text, _from date, _to date, br uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE res jsonb; tz text := 'Asia/Jerusalem';
BEGIN
  IF _key = 'top_products' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT p.name product, p.category, sum(-x.quantity_delta) qty,
      round(sum(-x.quantity_delta * coalesce(p.price,0)),2) amount, count(*) sales_count
      FROM inventory_transactions x JOIN inventory_products p ON p.id=x.product_id
      WHERE x.organization_id=_org AND x.branch_id = ANY(br) AND x.transaction_type='SALE'
        AND (x.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to
      GROUP BY p.id, p.name, p.category ORDER BY qty DESC LIMIT 500) t;
  ELSIF _key = 'reorder' THEN
    SELECT jsonb_agg(t) INTO res FROM (SELECT product, branch, supplier, current_stock, minimum_stock, sold30, days_left, lead_time, suggested
      FROM public._inv_stats(_org, br) WHERE need_order ORDER BY days_left NULLS LAST, product LIMIT 1000) t;
  ELSE
    SELECT jsonb_agg(t) INTO res FROM (SELECT product, branch, current_stock, (last_sale AT TIME ZONE tz)::date last_sale_on,
      CASE WHEN last_sale IS NULL THEN NULL ELSE (now()::date - (last_sale AT TIME ZONE tz)::date) END idle_days
      FROM public._inv_stats(_org, br) WHERE current_stock > 0 AND (last_sale IS NULL OR last_sale < now()-interval '60 days')
      ORDER BY last_sale NULLS FIRST, product LIMIT 1000) t;
  END IF;
  RETURN res;
END $$;
REVOKE EXECUTE ON FUNCTION public._inv_report_rows(uuid, text, date, date, uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_inventory(_org uuid, _branch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE br uuid[];
BEGIN
  IF NOT public.is_org_manager(_org) THEN RAISE EXCEPTION 'אין הרשאה' USING ERRCODE='42501'; END IF;
  br := public.report_branches(_org, CASE WHEN _branch IS NULL THEN NULL ELSE ARRAY[_branch] END);
  RETURN jsonb_build_object(
    'reorder', coalesce((SELECT jsonb_agg(t) FROM (SELECT product_id, product, branch, supplier, current_stock, minimum_stock, sold30, days_left, lead_time, suggested
       FROM public._inv_stats(_org, br) WHERE need_order ORDER BY days_left NULLS LAST, current_stock - minimum_stock LIMIT 50) t), '[]'),
    'slow', coalesce((SELECT jsonb_agg(t) FROM (SELECT product_id, product, branch, current_stock, last_sale
       FROM public._inv_stats(_org, br) WHERE current_stock > 0 AND (last_sale IS NULL OR last_sale < now()-interval '60 days')
       ORDER BY last_sale NULLS FIRST LIMIT 50) t), '[]'),
    'returns', coalesce((SELECT jsonb_agg(t) FROM (SELECT l.product_id, p.name product, b.name branch, sp.name supplier, l.quantity, l.expiry_date, l.return_deadline
       FROM inventory_lots l JOIN inventory_products p ON p.id=l.product_id JOIN branches b ON b.id=l.branch_id
       LEFT JOIN suppliers sp ON sp.id=coalesce(l.supplier_id, p.default_supplier_id)
       WHERE l.organization_id=_org AND l.branch_id = ANY(br) AND l.quantity > 0 AND p.returnable
         AND l.return_deadline IS NOT NULL AND l.return_deadline >= current_date
         AND l.expiry_date IS NOT NULL AND l.expiry_date <= current_date + 30
       ORDER BY l.return_deadline LIMIT 50) t), '[]'),
    'has_sales', EXISTS (SELECT 1 FROM inventory_transactions WHERE organization_id=_org AND branch_id = ANY(br) AND transaction_type='SALE' AND created_at >= now()-interval '30 days'));
END $$;
GRANT EXECUTE ON FUNCTION public.dashboard_inventory(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_people(_org uuid, _branch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := public.current_member_id(_org); mgr boolean := public.is_org_manager(_org); br uuid[];
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
        AND (mgr OR l.assigned_member_id = me)
      ORDER BY l.created_at DESC LIMIT 300) t), '[]'),
    'blocked', CASE WHEN mgr THEN coalesce((SELECT jsonb_agg(t) FROM (
      SELECT c.id, c.full_name, c.phone, r.reasons FROM customers c
      CROSS JOIN LATERAL (SELECT public.entry_block_reasons(c.id) reasons) r
      WHERE c.organization_id=_org AND c.deleted_at IS NULL AND c.status IN ('ACTIVE','FROZEN') AND c.home_branch_id = ANY(br)
        AND coalesce(array_length(r.reasons,1),0) > 0
      ORDER BY c.full_name LIMIT 100) t), '[]') ELSE '[]'::jsonb END);
END $$;
GRANT EXECUTE ON FUNCTION public.dashboard_people(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_inventory_report(_org uuid, _key text, _from date, _to date, _branches uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p jsonb := public.report_perm(_org, _key); br uuid[] := public.report_branches(_org, _branches);
BEGIN
  IF _key NOT IN ('top_products','reorder','slow_movers') THEN RAISE EXCEPTION 'דוח לא מוכר'; END IF;
  IF NOT coalesce((p->>'view')::boolean,false) THEN RAISE EXCEPTION 'אין הרשאה לדוח זה' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('rows', coalesce(public._inv_report_rows(_org, _key, _from, _to, br),'[]'::jsonb), 'branches', to_jsonb(br), 'own', false);
END $$;
GRANT EXECUTE ON FUNCTION public.run_inventory_report(uuid, text, date, date, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(_org uuid, _branch uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'active_customers', (select count(*) from public.customers where organization_id=_org and deleted_at is null and status='ACTIVE' and (_branch is null or home_branch_id=_branch)),
    'new_customers', (select count(*) from public.customers where organization_id=_org and deleted_at is null and joined_at >= now()-interval '30 days' and (_branch is null or home_branch_id=_branch)),
    'new_customers_prev', (select count(*) from public.customers where organization_id=_org and deleted_at is null and joined_at >= now()-interval '60 days' and joined_at < now()-interval '30 days' and (_branch is null or home_branch_id=_branch)),
    'new_leads', (select count(*) from public.leads where organization_id=_org and deleted_at is null and created_at >= now()-interval '30 days' and (_branch is null or branch_id=_branch)),
    'new_leads_prev', (select count(*) from public.leads where organization_id=_org and deleted_at is null and created_at >= now()-interval '60 days' and created_at < now()-interval '30 days' and (_branch is null or branch_id=_branch)),
    'won_leads', (select count(*) from public.leads where organization_id=_org and deleted_at is null and status='WON' and updated_at >= now()-interval '30 days' and (_branch is null or branch_id=_branch)),
    'closed_leads', (select count(*) from public.leads where organization_id=_org and deleted_at is null and status in ('WON','LOST') and updated_at >= now()-interval '30 days' and (_branch is null or branch_id=_branch)),
    'revenue', case when public.member_role(_org)='HQ' then (select coalesce(sum(amount),0) from public.payments where organization_id=_org and status='PAID' and paid_at >= date_trunc('month', now()) and (_branch is null or branch_id=_branch)) end,
    'revenue_prev', case when public.member_role(_org)='HQ' then (select coalesce(sum(amount),0) from public.payments where organization_id=_org and status='PAID' and paid_at >= date_trunc('month', now()) - interval '1 month' and paid_at < now() - interval '1 month' and (_branch is null or branch_id=_branch)) end,
    'cancellations', (select count(*) from public.memberships where organization_id=_org and status='CANCELLED' and updated_at >= now()-interval '30 days' and (_branch is null or branch_id=_branch))
  ) $function$;