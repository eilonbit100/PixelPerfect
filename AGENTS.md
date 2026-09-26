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
