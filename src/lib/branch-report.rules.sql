-- Read-only definition regression checks; never grant callers access to internal helpers.
WITH definitions AS (
  SELECT pg_get_functiondef('public._bm_kpis(uuid,uuid[],date,date)'::regprocedure) k,
    pg_get_functiondef('public.branch_management_report(uuid,date,date,uuid[])'::regprocedure) report
), checks AS (
  SELECT
    position('IF NOT coalesce((SELECT cancellation_requests_entry_enabled' IN k)>0 AND position('''req_total'', NULL, ''req_open'', NULL, ''req_handled'', NULL, ''req_completed'', NULL' IN k)>0 unavailable_requests_are_null,
    position('''cancelled'', NULL, ''leavers'', NULL, ''transfers_out'', NULL, ''net'', NULL' IN k)>0 undated_cancellations_hide_unreliable_counts,
    position('''net'', joins - leavers' IN k)>0 net_excludes_estimated_transfers,
    position('''undated_cancellations''' IN report)>0 AND position('m.organization_id=_org AND m.branch_id=ANY(br) AND m.status=''CANCELLED'' AND m.cancelled_at IS NULL' IN report)>0 undated_list_is_scoped
  FROM definitions
)
SELECT *, 1 / CASE WHEN unavailable_requests_are_null AND undated_cancellations_hide_unreliable_counts AND net_excludes_estimated_transfers AND undated_list_is_scoped THEN 1 ELSE 0 END passed FROM checks;