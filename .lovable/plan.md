# שדרוג "דוחות" — מרכז דוחות מקצועי

The dashboard and the rest of the system stay as they are. Everything is based on the existing data, roles (עובד / מנהל סניף / מטה) and branch permissions.

## What the user will see

**Reports page, three tabs:**
1. **ספריית דוחות**: a prominent search box (by name or number), category chips (מנויים ולקוחות, כספים, מכירות ולידים, עובדים ומשימות, תקינות כרטיסים, כניסות, שיעורים), a "יצירת דוח חדש" button, and a list (number, name, short description). Each user sees only the reports they are allowed to see.
2. **הפקות אחרונות**: report, who produced it, date and time, date range, branches, format. Each row has re-download (while the file is kept) and "הפק שוב" with the same filters.
3. **דוחות שמורים**: personal or shared templates, with open, edit, duplicate, delete and share by role. A template is kept separate from a file that has already been produced.

**Report screen:** description, quick ranges (היום / השבוע / החודש / החודש הקודם / השנה / מותאם), a branch filter (limited by permission), filters specific to the report, a sortable preview table, export to Excel / CSV / PDF, and "שמור כתבנית". Empty, loading and error states are clear.

**Report builder (step by step):** data source, then columns, then filters, then preview, then save or export. Sources and fields come from a fixed, approved list only.

**Smart AI search:** a free-text box ("מי ביטל החודש?"). The AI only picks a report from the library and fills in its filters. It never writes queries itself, and the result goes through the same permission check. Searching by the last 4 credit-card digits works only on the digits already saved under payment method. Full card numbers are never stored.

**הגדרות ← הרשאות דוחות** (מטה only): a role × report table (view / export / financial data / create / save / share), plus personal exceptions per employee. A branch manager cannot widen his own permissions.

## The 18 reports and their data status

| # | Report | Status |
|---|---|---|
| 113 | ביטולים | Connected (cancelled memberships). The cancellation reason gets a new field. |
| 120 | לקוחות לפי מועד רכישה | Connected (payments). Salesperson is shown when it exists on the lead. |
| 134 | לקוחות פעילים (as of a chosen date) | Connected |
| — | מנויים חדשים בתקופה | Connected |
| — | בקשות ביטול מנוי | New table for cancellation requests. Starts empty, no invented data. |
| 401 | חייבים | Connected (failed or unpaid payments) |
| 402 | סיכום קבלות | Partial: paid payments. Receipt number shows "אין מערכת קבלות" until one is connected. |
| 409 | מכירות ותקבולים לפי סעיף | Connected, with sales shown separately from collections |
| 701 | איש מכירות ומעקב מתעניין | Connected (leads + activities + tasks) |
| — | לידים ללא משימת מעקב | Connected |
| — | לידים כפולים (by normalized phone, no merging) | Connected |
| — | המרות לידים (unique leads, no double counting) | Connected |
| — | ביצועי עובדים (interactions separate from unique people) | Connected |
| — | משימות שבוצעו | Connected |
| — | כרטיסי לקוח לא תקינים | Connected (compliance, health, payments, missing details) |
| — | כניסות וחריגות כניסה | Connected. ID method is saved from now on. |
| — | השתתפות בשיעורים | Connected (bookings, attendance, cancellations) |
| — | אימונים אישיים וטיפולים | "נתונים אינם זמינים": the system has no treatments yet |

Inventory alerts are not included in reports. They stay under מלאי.

## Default permissions
- **עובד**: 120, 134, 701, לידים ללא משימה, כפולים, כניסות, שיעורים. המרות and משימות show only his own data. No financial data.
- **מנהל סניף**: all reports, for his branch only.
- **מטה**: all branches, branch comparison, and managing the permissions.

## Technical section
- **New tables (with GRANT + RLS):** `report_permissions` (role defaults + member overrides), `saved_reports` (owner, key/source, params jsonb, shared_roles), `report_runs` (history: who, params, branches, format, row count, file path), `cancellation_requests`. New columns: `memberships.cancel_reason`, `memberships.cancelled_at`, `check_ins.method`.
- **Server-side engine:** `run_report(_key, _params jsonb)` is SECURITY DEFINER. It checks the report permission and the financial permission, and limits branches to the intersection with `has_branch_access`. A branch_id from the browser cannot widen access. Personal-only access filters by `current_member_id`. There is a whitelist of sources and columns for the builder (`run_custom_report`). The row limit is 5000.
- **Export:** a createServerFn runs `run_report` again as the user and generates xlsx (SheetJS) / CSV (UTF-8 BOM) / PDF (pdf-lib with an embedded Hebrew font). The file goes to a private bucket `report-exports`, gets logged in `report_runs`, and is returned via a short-lived signed URL. The preview and the export use the same function, so the data matches.
- **AI:** a server fn calls the Lovable AI Gateway with tool-calling that returns only `{report_key, params}` from the catalog the user is allowed to see. It then runs through `run_report`.
- **Frontend:** `reports.tsx` becomes a layout with tabs; new `reports.$key.tsx` (report screen) and `reports.builder.tsx`; a catalog in `src/lib/reports.ts`; a "הרשאות דוחות" tab in settings. The existing check-in and health-declaration sections in reports move into the new reports (כניסות, כרטיסים לא תקינים).
- **Testing:** Playwright as עובד1, מנהל1 and מטה1, plus a direct attempt to call another branch, which must be blocked. A summary for the user at the end, as the brief requires.
