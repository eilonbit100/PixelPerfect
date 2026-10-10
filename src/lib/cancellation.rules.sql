-- Regression checks for the cancellation notice rule. Every column must be true.
SELECT
  public.notice_date('2026-10-10', '{"unit":"MONTHS","value":1}') = '2026-11-10' AS request_10_10_effective_10_11,
  public.notice_date('2026-10-15', '{"unit":"MONTHS","value":1}') = '2026-11-15' AS request_15_10_effective_15_11,
  public.notice_date('2026-01-31', '{"unit":"MONTHS","value":1}') = '2026-02-28' AS missing_day_uses_last_day_of_month,
  public.notice_date('2026-10-10', '{"unit":"DAYS","value":14}') = '2026-10-24' AS fourteen_days,
  public.notice_date('2026-10-10', '{"unit":"IMMEDIATE"}') = '2026-10-10' AS immediate;
