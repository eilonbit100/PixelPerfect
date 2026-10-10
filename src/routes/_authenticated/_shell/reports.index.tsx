import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Copy, Download, Plus, RotateCcw, Search, Sparkles, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { ROLE, fmtDateTime } from "@/lib/format";
import { CATEGORIES, REPORTS, reportByKey, useReportPerms, type Category } from "@/lib/reports";
import { aiReportSearch } from "@/lib/reports.functions";
import { EmptyState, ErrorState, FilterChips, PageHeader, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Tab = "library" | "runs" | "saved";

export const Route = createFileRoute("/_authenticated/_shell/reports/")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({ tab: s.tab === "runs" || s.tab === "saved" ? s.tab : undefined }),
  component: ReportsHome,
});

function ReportsHome() {
  const { tab = "library" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const perms = useReportPerms();
  const canBuild = !!perms.data?._builder?.view;
  return (
    <div className="space-y-4">
      <PageHeader title="דוחות" subtitle="מוצגים רק הדוחות והסניפים שמותר לך לראות"
        actions={canBuild && <Button asChild><Link to="/reports/builder"><Plus className="size-4" /> יצירת דוח חדש</Link></Button>} />
      <AiSearch />
      <nav className="flex gap-1 border-b">
        {([["library", "ספריית דוחות"], ["runs", "הפקות אחרונות"], ["saved", "דוחות שמורים"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => navigate({ search: { tab: v === "library" ? undefined : v } })}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === v ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </nav>
      {tab === "library" ? <Library /> : tab === "runs" ? <Runs /> : <Saved />}
    </div>
  );
}

function AiSearch() {
  const { org } = useOrg();
  const run = useServerFn(aiReportSearch);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const r = await run({ data: { orgId: org.id, q } });
      if (!r.ok) return toast.error(r.error);
      toast.success(r.explanation || "נמצא דוח מתאים");
      navigate({ to: "/reports/$key", params: { key: r.key }, search: { range: r.range as never, from: r.from, to: r.to } });
    } catch { toast.error("החיפוש החכם נכשל"); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={go} className="panel flex items-center gap-2 p-2">
      <Sparkles className="ms-2 size-4 shrink-0 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="שאל בשפה חופשית: ״מי ביטל מנוי החודש?״, ״אילו לידים לא קיבלו משימה השבוע?״"
        className="h-9 border-0 shadow-none focus-visible:ring-0" />
      <Button type="submit" size="sm" disabled={busy}>{busy ? "מחפש…" : "חפש"}</Button>
    </form>
  );
}

function Library() {
  const perms = useReportPerms();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | Category>("all");
  const visible = useMemo(() => REPORTS.filter((r) => perms.data?.[r.key]?.view), [perms.data]);
  const items = [...visible.map((r) => ({ to: r.key, number: r.number, name: r.name, desc: r.desc, category: r.category, unavailable: !!r.unavailable })),
    { to: "health", number: undefined, name: "הצהרות בריאות", desc: "חסרות, פגות, ממתינות ומנויים חסומים — עם הטופס החתום", category: "cards" as Category, unavailable: false }];
  const s = q.trim();
  const list = items.filter((r) => (cat === "all" || r.category === cat) && (!s || r.name.includes(s) || r.number?.includes(s) || r.desc.includes(s)));
  if (perms.isLoading) return <div className="panel"><TableSkeleton rows={6} cols={2} /></div>;
  if (perms.error) return <ErrorState onRetry={() => perms.refetch()} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute end-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או מספר דוח" className="pe-8" />
        </div>
        <FilterChips value={cat} onChange={setCat} options={[{ value: "all", label: "הכל", count: items.length },
          ...CATEGORIES.map((c) => ({ value: c.value, label: c.label, count: items.filter((r) => r.category === c.value).length })).filter((c) => c.count)]} />
      </div>
      <div className="panel divide-y">
        {!list.length ? <EmptyState title="לא נמצאו דוחות" text="נסה מילה אחרת או קטגוריה אחרת." /> : list.map((r) => (
          <Link key={r.to} to={r.to === "health" ? "/reports/health" : "/reports/$key"} params={r.to === "health" ? undefined : { key: r.to } as never}
            className="flex items-center gap-4 px-4 py-3 hover:bg-muted/60">
            <span className="num w-10 shrink-0 text-xs text-muted-foreground">{r.number ?? "—"}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{r.name}{r.unavailable && <span className="ms-2 text-xs font-normal text-muted-foreground">· נתונים אינם זמינים</span>}</div>
              <div className="truncate text-xs text-muted-foreground">{r.desc}</div>
            </div>
            <span className="hidden text-xs text-muted-foreground sm:block">{CATEGORIES.find((c) => c.value === r.category)?.label}</span>
            <ChevronLeft className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}

const FMT: Record<string, string> = { xlsx: "Excel", csv: "CSV", pdf: "PDF" };

function Runs() {
  const { org, memberName, branchName } = useOrg();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["report-runs", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_runs").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  async function download(path: string) {
    const { data, error } = await supabase.storage.from("report-exports").createSignedUrl(path, 120, { download: true });
    if (error) return toast.error("הקובץ אינו זמין להורדה");
    window.location.href = data.signedUrl;
  }
  function rerun(r: NonNullable<typeof q.data>[number]) {
    const p = r.params as { from?: string; to?: string; branches?: string[]; source?: string; columns?: string[]; status?: string };
    if (r.report_key.startsWith("custom:")) navigate({ to: "/reports/builder", search: { source: p.source, cols: p.columns?.join(","), status: p.status, from: p.from, to: p.to, b: p.branches?.join(",") || undefined } });
    else navigate({ to: "/reports/$key", params: { key: r.report_key }, search: { range: "custom", from: p.from, to: p.to, b: p.branches?.join(",") || undefined } });
  }
  if (q.isLoading) return <div className="panel"><TableSkeleton /></div>;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <div className="panel"><EmptyState title="עוד לא הופקו דוחות" text="כל הפקה ל-Excel, CSV או PDF תירשם כאן." /></div>;
  return (
    <div className="panel overflow-x-auto">
      <table className="data-table">
        <thead><tr><th>דוח</th><th>הופק על ידי</th><th>מתי</th><th>טווח</th><th>סניפים</th><th>פורמט</th><th>שורות</th><th /></tr></thead>
        <tbody>{q.data.map((r) => {
          const p = r.params as { from?: string; to?: string };
          return (
            <tr key={r.id}>
              <td className="font-medium">{r.report_name}</td>
              <td>{r.member_id ? memberName(r.member_id) : "—"}</td>
              <td className="num">{fmtDateTime(r.created_at)}</td>
              <td className="num text-xs">{p.from?.split("-").reverse().join("/")} – {p.to?.split("-").reverse().join("/")}</td>
              <td className="text-xs">{r.branch_ids.map(branchName).join(", ")}</td>
              <td>{FMT[r.format]}</td>
              <td className="num">{r.row_count}</td>
              <td className="whitespace-nowrap text-end">
                {r.file_path && <Button size="sm" variant="ghost" onClick={() => download(r.file_path!)}><Download className="size-4" /> הורדה</Button>}
                <Button size="sm" variant="ghost" onClick={() => rerun(r)}><RotateCcw className="size-4" /> הפק שוב</Button>
              </td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function Saved() {
  const { org, me, memberName } = useOrg();
  const perms = useReportPerms();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["saved-reports", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("saved_reports").select("*").eq("organization_id", org.id).order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["saved-reports"] });
  type Row = NonNullable<typeof q.data>[number];
  function open(r: Row) {
    const c = r.config as { range?: string; from?: string; to?: string; branches?: string[]; source?: string; columns?: string[]; status?: string };
    if (r.report_key) navigate({ to: "/reports/$key", params: { key: r.report_key }, search: { range: (c.range ?? "month") as never, from: c.range === "custom" ? c.from : undefined, to: c.range === "custom" ? c.to : undefined, b: c.branches?.join(",") || undefined } });
    else navigate({ to: "/reports/builder", search: { source: c.source, cols: c.columns?.join(","), status: c.status, b: c.branches?.join(",") || undefined, saved: r.id } });
  }
  async function dup(r: Row) {
    const { error } = await supabase.from("saved_reports").insert({ organization_id: org.id, owner_member_id: me.id, name: `${r.name} (עותק)`, description: r.description, report_key: r.report_key, config: r.config, shared_roles: [] });
    if (error) return toast.error("השכפול נכשל");
    toast.success("התבנית שוכפלה"); refresh();
  }
  async function del(r: Row) {
    if (!confirm(`למחוק את התבנית "${r.name}"? קבצים שכבר הופקו לא יימחקו.`)) return;
    const { error } = await supabase.from("saved_reports").delete().eq("id", r.id);
    if (error) return toast.error("המחיקה נכשלה");
    refresh();
  }
  async function share(r: Row, roles: string[]) {
    const { error } = await supabase.from("saved_reports").update({ shared_roles: roles, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return toast.error("השיתוף נכשל");
    refresh();
  }
  if (q.isLoading) return <div className="panel"><TableSkeleton /></div>;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <div className="panel"><EmptyState title="אין דוחות שמורים" text="בתוך כל דוח לחץ ״שמור כתבנית״ כדי לשמור את ההגדרות לפעם הבאה." /></div>;
  return (
    <div className="panel divide-y">
      {q.data.map((r) => {
        const mine = r.owner_member_id === me.id;
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <button type="button" onClick={() => open(r)} className="min-w-0 flex-1 text-start">
              <div className="text-sm font-medium hover:underline">{r.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {r.report_key ? reportByKey(r.report_key)?.name : "דוח מותאם"}{r.description ? ` · ${r.description}` : ""}{!mine ? ` · של ${memberName(r.owner_member_id)}` : ""}
                {r.shared_roles.length ? ` · משותף עם ${r.shared_roles.map((x) => ROLE[x]).join(", ")}` : ""}
              </div>
            </button>
            {mine && perms.data?._share?.view && (
              <Popover>
                <PopoverTrigger asChild><Button size="sm" variant="ghost"><Users className="size-4" /> שיתוף</Button></PopoverTrigger>
                <PopoverContent dir="rtl" className="w-48 space-y-2">
                  {Object.entries(ROLE).map(([k, l]) => (
                    <label key={k} className="flex items-center gap-2 text-sm"><Checkbox checked={r.shared_roles.includes(k)}
                      onCheckedChange={(c) => share(r, c ? [...r.shared_roles, k] : r.shared_roles.filter((x) => x !== k))} />{l}</label>
                  ))}
                </PopoverContent>
              </Popover>
            )}
            <Button size="sm" variant="ghost" onClick={() => dup(r)}><Copy className="size-4" /> שכפול</Button>
            {mine && <Button size="sm" variant="ghost" onClick={() => del(r)}><Trash2 className="size-4" /></Button>}
          </div>
        );
      })}
    </div>
  );
}
