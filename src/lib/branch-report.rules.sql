-- Run with a privileged read-only connection; checks actual Postgres KPI rules.
WITH metrics AS (
  SELECT o.cancellation_requests_entry_enabled enabled,
    public._bm_kpis(o.id, ARRAY(SELECT b.id FROM public.branches b WHERE b.organization_id=o.id), '2026-01-01'::date, '2026-12-31'::date) k
  FROM public.organizations o
), checks AS (
  SELECT
    bool_and(enabled OR (k->'req_total'='null'::jsonb AND k->'req_open'='null'::jsonb AND k->'req_handled'='null'::jsonb AND k->'req_completed'='null'::jsonb)) unavailable_requests_are_null,
    bool_and((k->>'cancelled_no_date')::int=0 OR (k->'cancelled'='null'::jsonb AND k->'leavers'='null'::jsonb AND k->'net'='null'::jsonb)) undated_cancellations_hide_unreliable_counts,
    bool_and(k->'net'='null'::jsonb OR (k->>'net')::int=(k->>'joins')::int-(k->>'leavers')::int) net_excludes_estimated_transfers
  FROM metrics
)
SELECT *, 1 / CASE WHEN unavailable_requests_are_null AND undated_cancellations_hide_unreliable_counts AND net_excludes_estimated_transfers THEN 1 ELSE 0 END passed FROM checks;