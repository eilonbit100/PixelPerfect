import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, UserPlus, ListTodo, Package, BarChart3, Settings, Search, Bell, Menu, LogOut, Building2, ChevronDown, Activity, CheckSquare,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { CUSTOMER_STATUS, LEAD_STATUS, ROLE, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/customers", label: "לקוחות", icon: Users },
  { to: "/leads", label: "לידים", icon: UserPlus },
  { to: "/tasks", label: "משימות", icon: ListTodo },
  { to: "/inventory", label: "מלאי", icon: Package },
  { to: "/reports", label: "דוחות", icon: BarChart3 },
  { to: "/approvals", label: "אישורים", icon: CheckSquare },
  { to: "/settings", label: "הגדרות", icon: Settings },
] as const;

function BranchSelector() {
  const { branches, branchId, setBranchId, branchName } = useOrg();
  const qc = useQueryClient();
  if (branches.length <= 1) return <div className="truncate text-sm">{branches[0]?.name ?? "—"}</div>;
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-md border bg-surface px-2.5 py-1.5 text-sm hover:bg-muted">
        <span className="flex items-center gap-2 truncate"><Building2 className="size-4 text-muted-foreground" />{branchId ? branchName(branchId) : "כל הסניפים"}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => { setBranchId(null); qc.invalidateQueries(); }}>כל הסניפים</DropdownMenuItem>
        <DropdownMenuSeparator />
        {branches.map((b) => (
          <DropdownMenuItem key={b.id} onClick={() => { setBranchId(b.id); qc.invalidateQueries(); }}>{b.name}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { org, profileName, role } = useOrg();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-5 pb-6">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><Activity className="size-4" /></span>
        <span className="text-[15px] font-semibold tracking-tight">Pulse</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map((n) => {
          const active = path === n.to || path.startsWith(n.to + "/");
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/60",
              )}
            >
              <n.icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-3 border-t border-sidebar-border p-3">
        <div>
          <div className="eyebrow mb-1">ארגון</div>
          <div className="truncate text-sm font-medium">{org.name}</div>
        </div>
        <div>
          <div className="eyebrow mb-1">סניף</div>
          <BranchSelector />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{profileName.slice(0, 1)}</span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm">{profileName}</div>
            <div className="text-xs text-muted-foreground">{ROLE[role]}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function useDebounced<T>(v: T, ms = 200) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q.trim());
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const res = useQuery({
    queryKey: ["search", dq],
    enabled: dq.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_entities", { _q: dq, _limit: 8 });
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  function go(r: { entity_type: string; id: string }) {
    setOpen(false); setQ("");
    if (r.entity_type === "lead") navigate({ to: "/leads/$id", params: { id: r.id } });
    else navigate({ to: "/customers/$id", params: { id: r.id } });
  }
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" && res.data?.[0]) go(res.data[0]); if (e.key === "Escape") setOpen(false); }}
        placeholder="חיפוש לקוח, ליד, טלפון או ת״ז..."
        className="h-9 w-full rounded-md border bg-surface ps-8 pe-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        aria-label="חיפוש"
      />
      {open && dq.length >= 2 && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-lg">
          {res.isLoading ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">מחפש…</div>
          ) : !res.data?.length ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">לא נמצאו תוצאות</div>
          ) : (
            res.data.map((r) => (
              <button key={r.entity_type + r.id} onClick={() => go(r)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start hover:bg-muted">
                <div>
                  <div className="text-sm font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.entity_type === "lead" ? "ליד" : "לקוח"} • {r.entity_type === "lead" ? LEAD_STATUS[r.status] : CUSTOMER_STATUS[r.status]}
                  </div>
                </div>
                <span className="num text-xs text-muted-foreground">{r.phone}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { userId } = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", userId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  const unread = q.data?.filter((n) => !n.read_at).length ?? 0;
  async function markAll() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  function open(link: string | null) {
    if (!link) return;
    const [type, id] = link.split(":");
    if (type === "lead") navigate({ to: "/leads/$id", params: { id } });
    else if (type === "customer") navigate({ to: "/customers/$id", params: { id } });
    else if (type === "task") navigate({ to: "/tasks" });
    else navigate({ to: "/inventory" });
  }
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger className="relative flex size-9 items-center justify-center rounded-md hover:bg-muted" aria-label="התראות">
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="absolute top-1.5 end-1.5 size-2 rounded-full bg-critical ring-2 ring-background" aria-label={`${unread} לא נקראו`} />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">התראות</DropdownMenuLabel>
          {unread > 0 && <button onClick={markAll} className="text-xs text-primary hover:underline">סמן הכל כנקרא</button>}
        </div>
        <DropdownMenuSeparator />
        {!q.data?.length ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">אין התראות חדשות</div>
        ) : (
          q.data.map((n) => (
            <DropdownMenuItem key={n.id} onClick={() => open(n.link)} className="flex-col items-start gap-0.5">
              <div className="flex w-full items-center gap-2">
                {!n.read_at && <span className="size-1.5 rounded-full bg-critical" />}
                <span className="text-sm font-medium">{n.title}</span>
                <span className="ms-auto text-xs text-muted-foreground">{fmtRelative(n.created_at)}</span>
              </div>
              {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { profileName, me, role } = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted" aria-label="תפריט משתמש">
        <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{profileName.slice(0, 1)}</span>
        <span className="hidden text-sm md:inline">{profileName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{profileName}</div>
          <div className="text-xs text-muted-foreground">{me.username ?? ""} · {ROLE[role]}{me.job_title ? ` · ${me.job_title}` : ""}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: "/settings/organization" })}><Settings className="size-4" /> הגדרות</DropdownMenuItem>
        <DropdownMenuItem onClick={signOut}><LogOut className="size-4" /> החלפת משתמש</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-e border-sidebar-border bg-sidebar lg:block">
        <SidebarBody />
      </aside>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="right" className="w-64 bg-sidebar p-0" dir="rtl">
          <SheetTitle className="sr-only">ניווט</SheetTitle>
          <SidebarBody onNavigate={() => setDrawer(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:px-6">
          <button className="flex size-9 items-center justify-center rounded-md hover:bg-muted lg:hidden" onClick={() => setDrawer(true)} aria-label="פתח תפריט">
            <Menu className="size-5" />
          </button>
          <GlobalSearch />
          <div className="ms-auto flex items-center gap-1">
            <Notifications />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
