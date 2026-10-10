ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS cancellation_requests_entry_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.organizations.cancellation_requests_entry_enabled IS 'Enable only when a real cancellation-request entry workflow is available; branch management report hides request counts while false.';

DO $migration$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef('public._bm_kpis(uuid,uuid[],date,date)'::regprocedure) INTO def;
  IF position('RETURN r;' IN def)=0 THEN RAISE EXCEPTION 'Unexpected _bm_kpis definition'; END IF;
  def := replace(def, 'RETURN r;', $patch$
  IF NOT coalesce((SELECT cancellation_requests_entry_enabled FROM public.organizations WHERE id=_org), false) THEN
    r := r || jsonb_build_object('req_total', NULL, 'req_open', NULL, 'req_handled', NULL, 'req_completed', NULL);
  END IF;
  RETURN r;
$patch$);
  EXECUTE def;

  SELECT pg_get_functiondef('public.branch_management_report(uuid,date,date,uuid[])'::regprocedure) INTO def;
  IF position('''sales'', (SELECT' IN def)=0 OR position('''export'', coalesce' IN def)=0 THEN RAISE EXCEPTION 'Unexpected branch_management_report definition'; END IF;
  def := replace(def, '''sales'', (SELECT', $patch$
    'undated_cancellations', (SELECT coalesce(jsonb_agg(t ORDER BY t.full_name, t.membership_id), '[]'::jsonb) FROM (
      SELECT m.id membership_id, c.id customer_id, c.full_name, m.display_name plan, m.start_date, m.end_date, m.cancel_reason reason, b.name branch
      FROM public.memberships m JOIN public.customers c ON c.id=m.customer_id LEFT JOIN public.branches b ON b.id=m.branch_id
      WHERE m.organization_id=_org AND m.branch_id=ANY(br) AND m.status='CANCELLED' AND m.cancelled_at IS NULL
    ) t),
    'sales', (SELECT$patch$);
  def := replace(def, '''מעבר מסניף אחר''', '''מעבר משוער מסניף אחר''');
  def := replace(def, '''מעבר לסניף אחר''', '''מעבר משוער לסניף אחר''');
  def := replace(def, '''export'', coalesce', '''requests_available'', coalesce((SELECT cancellation_requests_entry_enabled FROM public.organizations WHERE id=_org),false), ''export'', coalesce');
  EXECUTE def;
END
$migration$;
REVOKE ALL ON FUNCTION public._bm_kpis(uuid, uuid[], date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branch_management_report(uuid, date, date, uuid[]) TO authenticated;