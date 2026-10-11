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
- Reports: every report runs through `run_report` / `run_custom_report` (`report_perm` + `report_branches`); exports re-run server-side and log to `report_runs` — preview, file and permissions match.
- Branch management report metrics come only from `branch_management_report` (perm `branch_mgmt`; helpers not client-executable; unreliable metrics null) — preview, export and permissions agree.
- Branch report: request counts are null while the org workflow flag is off; preview and exports share definitions — absent data never reads as zero.
- People pipeline: leads table holds לידים and מתעניינים via `leads.stage` (LEAD→PROSPECT, auto on follow-up status); conversion via `convert_lead_to_customer` reuses an existing customer by normalized phone and moves tasks/activities — so one person never gets two cards.
- Membership cancellation only via `open_cancellation_request` (stores computed effective_date + policy snapshot) / `update_cancellation_request` / `cancel_membership` (manager approval sets scheduled_cancel_date; earlier than notice needs override reason) RPCs; `apply_scheduled_cancellations` (pg_cron nightly) flips to CANCELLED with cancelled_at — so memberships stay active until effective and reports share one source.
- Notice policy lives in `cancellation_policies` (plan > branch > org, HQ-editable) resolved by `cancellation_policy_for`/`notice_date` — policy changes never alter existing requests.
- Card health (`src/lib/card-health.ts`) is a read-only view over compliance items, payments, memberships and customer fields — no separate issue store, so fixing the source closes it everywhere.
- Tickets (קריאות) extend `approval_requests` (ticket_no, ticket_type, status, priority…) with `ticket_events` history and `ticket_files` in private bucket `ticket-files` (path org/ticket/file); all writes only via `create_ticket`/`ticket_update`/`ticket_decide`/`ticket_close`/`ticket_comment`/`ticket_add_file` RPCs, visibility via `can_view_ticket` — so old approvals keep their history and permissions are enforced server-side.
- Inventory: kind SHELF/EQUIPMENT; stock tables client read-only; changes only via `apply_inventory_transaction` (idempotency key), `transfer_stock`, and count RPCs (balance changes on approval) — single ledger, no duplicate moves.
- Catalog/price/supplier edits HQ-only via RLS; movement docs in private bucket `inventory-docs` (org/branch/file) — server-side price control and branch isolation.
- Tasks: per-org `task_types`; popups claimed atomically by `claim_task_reminders`; history = activities(entity 'task'); open rule tasks unique per entity — no duplicates.
- Task types carry allowed_roles/requires_link; trigger `tasks_validate` blocks role-mismatched assignment and approval tasks without a ticket/cancellation link — tasks only remind, approval stays in tickets. Demo tasks use source DEMO for easy cleanup.
- Dashboards read only `dashboard_people`/`dashboard_inventory` RPCs; revenue is null for non-HQ server-side.
