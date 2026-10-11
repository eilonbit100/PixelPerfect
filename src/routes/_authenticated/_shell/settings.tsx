import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/app/states";
import { useOrg } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/_shell/settings")({
  head: () => ({
    meta: [
      { title: "הגדרות — Pulse" },
      { name: "description", content: "הגדרות ארגון, סניפים, משתמשים וכללים עסקיים." },
      { property: "og:title", content: "הגדרות — Pulse" },
      { property: "og:description", content: "הגדרות ארגון, סניפים, משתמשים וכללים עסקיים." },
    ],
  }),
  component: SettingsLayout,
});

/** hq = מטה בלבד; manager = גם מנהל סניף (צפייה). עובד אינו רואה הגדרות כלל. */
const TABS = [
  { to: "/settings/users", label: "עובדים והרשאות", manager: true },
  { to: "/settings/organization", label: "ארגון", manager: false },
  { to: "/settings/branches", label: "סניפים", manager: false },
  { to: "/settings/catalog", label: "קטלוג מוצרים", manager: false },
  { to: "/settings/rules", label: "כללים עסקיים", manager: false },
  { to: "/settings/cancellation", label: "מדיניות מנויים וביטולים", manager: true },
  { to: "/settings/report-permissions", label: "הרשאות דוחות", manager: false },
] as const;

function SettingsLayout() {
  const { isAdmin, isManager } = useOrg();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const tabs = TABS.filter((t) => isAdmin || (isManager && t.manager));
  const allowed = tabs.some((t) => path === t.to || path.startsWith(t.to + "/"));
  return (
    <div>
      <PageHeader title="הגדרות" />
      {tabs.length > 0 && (
        <nav className="mb-5 flex flex-wrap gap-1 border-b">
          {tabs.map((t) => (
            <Link key={t.to} to={t.to} className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              activeProps={{ className: "-mb-px border-b-2 border-primary px-3 py-2 text-sm font-medium text-foreground" }}>{t.label}</Link>
          ))}
        </nav>
      )}
      {allowed ? <Outlet /> : <EmptyState title="אין לך הרשאה למסך זה" description="המסך זמין למשתמשי מטה בלבד." />}
    </div>
  );
}
