<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Business rules live in Postgres (`evaluate_rules`, triggers); React only displays insights — keeps detection server-side and consistent.
- Insights are deduped by a partial unique index and auto-resolved by `_sync_rule`; never create insights from the client.
- Stock changes only via `apply_inventory_transaction` RPC — balance and ledger stay consistent; stock tables are read-only to clients.
- Tenancy = organization_members (role) + member_branch_access; RLS uses `has_branch_access`/`is_org_manager` helpers, never profile fields.
- Signed-in app lives under `src/routes/_authenticated/_shell/*`; `_shell.tsx` provides OrgProvider + AppShell (RTL sidebar).
- List filters are URL search params (`?rule=KEY`) so every Action Center CTA opens the exact records.
- Demo login: username only; `demoLogin` server fn links an organization_members seat (by `username`) to an internal account and returns a one-time sign-in token — keeps auth.uid()/RLS intact so real auth can replace it later.
- tsconfig relaxes noUncheckedIndexedAccess/exactOptionalPropertyTypes/noPropertyAccessFromIndexSignature/noImplicitReturns — generated DB types and jsonb metadata made them noise.
- Roles: EMPLOYEE / BRANCH_MANAGER / HQ (permission) are separate from job_title (description only); approvals use approval_requests with DRAFT→PENDING_APPROVAL→APPROVED/REJECTED.
- Entry decisions come only from `check_in_customer` RPC (uses `entry_block_reasons`) and are logged in `check_ins`; clients never decide or insert check-ins.
- Freezes are inserted into `customer_freezes`; a trigger extends membership end_date and toggles FROZEN via `apply_freezes`.
- Class schedule = recurring `class_templates` (weekday+time); bookings keyed by (template, session_date) via `book_class`/`cancel_booking` RPCs for atomic capacity/waitlist.
- Daily plan: tasks.plan_date/plan_rank + daily_plans approval row; `suggest_daily_plan` (priority/overdue order, assigns by job_title + load) and `approve_daily_plan` RPCs, manager edits via normal task updates — keeps prioritization logic server-side.
- Reports: every report runs through `run_report` / `run_custom_report` (SECURITY DEFINER, permission via `report_perm`, branches clipped by `report_branches`); exports re-run server-side in `reports.functions.ts` and log to `report_runs` — so preview, file and permissions always match.
- Branch management report: all metrics come from `branch_management_report` (SECURITY DEFINER, perm key `branch_mgmt`); internal helpers `_bm_kpis`/`_bm_active` are not executable by clients, and metrics with unreliable source data are returned as null — so preview, export and permissions always agree.
- Branch report request availability uses the organization workflow-enabled flag, with null counts while disabled; scoped undated cancellations come from the same RPC and shared presentation definitions serve preview and exports — so absent collection is not confused with a real zero.
