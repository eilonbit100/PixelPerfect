# Visual polish: a professional operations system, not an "AI-generated" site

This is a look-and-feel upgrade only. Screens, data, permissions and buttons all stay as they are. The existing direction is kept: Hebrew right-to-left, bright content area, dark night-blue sidebar, lime accent, Rubik font.

## What currently makes it look "AI-generated"
- Very rounded cards with soft drop shadows ("floating cards").
- Similar text sizes everywhere, so the screen has no clear hierarchy.
- Sparkle icons on the smart-search box and the AI assistant.
- Cheerful greetings as page headings instead of a clear screen title.
- Every page header is built a little differently.

## Changes

### 1. Shapes and depth (applies everywhere at once)
- Smaller corner rounding: 0.7rem down to about 0.375rem. Cards look like panels, not bubbles.
- Drop shadows replaced by a thin hairline border. Only pop-ups and menus keep a shadow.
- One consistent spacing scale between panels: 12px or 16px only.

### 2. Typography
- Clear levels: screen title 20px semibold; section title 13px medium; small grey labels 11px; numbers in an even-width style that lines up in columns.
- Tighter letter spacing on titles and lighter grey for secondary text.
- Panel titles get a fixed height with the title on one side and the action on the other, the same on every screen.

### 3. One page header for every screen
- Thin breadcrumb (category, then screen name) above the title.
- Screen title on one side, main actions (primary button plus extras) on the other.
- On the dashboard the greeting moves to a small line, and the title becomes "לוח בקרה" with today's date and the branch.

### 4. Tables and lists
- Grey column headers in small text, light row dividers, a soft highlight when the mouse is over a row, and numbers aligned to one side.
- Status labels become flat tags with a colored dot. The severity rule stays: icon + label + color.

### 5. Sidebar and top bar
- Sidebar: tighter rows, selected item shown with a thin lime line beside it plus a slightly lighter background, and category names in small grey capitals.
- Top bar: thin, with branch selector, search, notifications and user. No decoration.

### 6. Removing AI signals
- Sparkle icons replaced with neutral icons: search or terminal.
- "שאל את המערכת" (ask the system) becomes a plain command-style search box.
- Wording made dry and professional where it is currently over-friendly.

### 7. Empty and loading states
- One short line plus a single action. No large icons or illustrations.

## Order of work
1. Change the shared design settings (shapes, depth, text levels). This updates the whole system at once.
2. Shared parts: page header, panel, table, tags, sidebar.
3. Apply them screen by screen: dashboard, leads and prospects, customers, tasks, tickets, inventory, schedule, reports, settings.
4. Check at the user's screen width (1181px) as employee, branch manager and HQ: nothing cut off, no sideways scrolling.

## Technical details
- `src/styles.css`: `--radius` to about 0.375rem; `--shadow-panel` changed to border only (shadow kept for popover/dialog); type-scale utilities (`.h-page`, `.h-section`, `.eyebrow`); `tabular-nums` on `.num`; `.data-table` header and hover tokens; status-tag dot utility; sidebar active-indicator tokens.
- New shared `PageHeader` (breadcrumb, title, actions) and an updated `Panel` header used across routes; replace existing ad-hoc headers.
- `AppShell.tsx`: sidebar item and active styles, compact top bar.
- Replace `Sparkles` usages (dashboard Copilot, reports AI search).
- No changes to the database, queries or permissions.
