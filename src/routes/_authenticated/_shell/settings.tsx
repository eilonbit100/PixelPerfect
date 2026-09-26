import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/states";

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

const TABS = [
  { to: "/settings/organization", label: "ארגון" },
  { to: "/settings/branches", label: "סניפים" },
  { to: "/settings/users", label: "משתמשים" },
  { to: "/settings/rules", label: "כללים עסקיים" },
] as const;

function SettingsLayout() {
  return (
    <div>
      <PageHeader title="הגדרות" />
      <nav className="mb-5 flex gap-1 border-b">
        {TABS.map((t) => (
          <Link key={t.to} to={t.to} className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: "-mb-px border-b-2 border-primary px-3 py-2 text-sm font-medium text-foreground" }}>{t.label}</Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
