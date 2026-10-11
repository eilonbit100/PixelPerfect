import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { CalendarDays, Plus, Search as SearchIcon, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { fmtDate } from "@/lib/format";
import { TICKET_PRIORITY, TICKET_STATUS, TICKET_TYPE, isOverdue } from "@/lib/tickets";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { StatusBadge } from "@/components/app/badges";
import { TicketDialog } from "@/components/app/TicketDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Search = { q?: string; type?: string; status?: string; owner?: string; priority?: string; from?: string; to?: string; branch?: string; range?: string };
const str = (v: unknown) => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined);

export const Route = createFileRoute("/_authenticated/_shell/tickets/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: str(s.q), type: str(s.type), status: str(s.status), owner: str(s.owner), priority: str(s.priority), from: str(s.from), to: str(s.to), branch: str(s.branch), range: str(s.range),
  }),
  head: () => ({ meta: [
    { title: "קריאות — Pulse" }, { name: "description", content: "תקלות, בקשות רכש, הצעות מחיר ובקשות אישור במקום אחד." },
    { property: "og:title", content: "קריאות — Pulse" }, { property: "og:description", content: "תקלות, בקשות רכש, הצעות מחיר ובקשות אישור." },
  ] }),
  component: TicketsPage,
});

const ALL = "__all";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function rangeDates(r: string): { from?: string; to?: string } {
  const t = new Date(); const add = (n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return iso(d); };
  if (r === "today") return { from: iso(t), to: iso(t) };
  if (r === "past7") return { from: add(-6), to: iso(t) };
  if (r === "past30") return { from: add(-29), to: iso(t) };
  if (r === "month") return { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
  return {};
}

function TicketsPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: "/tickets/" });
  const { org, branchId, branches, branchName, members, memberName } = useOrg();
  const set = (patch: Partial<Search>) => navigate({ search: (p: Search) => ({ ...p, ...patch }), replace: true });

  const q = useQuery({
    queryKey: ["tickets", org.id, branchId],
    queryFn: async () => {
      let r = supabase.from("approval_requests").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(2000);
      if (branchId) r = r.eq("branch_id", branchId);
      const { data, error } = await r;
      if (error) throw error;
      return data;
    },
  });
  const all = q.data ?? [];

  const range = s.range ?? (s.from || s.to ? "custom" : "past30");
  const picked = range === "custom" ? { from: s.from, to: s.to } : rangeDates(range);
  const from = picked.from ?? iso(new Date(Date.now() - 29 * 864e5));
  const to = picked.to ?? iso(new Date());

  const rows = useMemo(() => {
    const text = (s.q ?? "").trim().toLowerCase().replace(/^#/, "");
    return all.filter((t) => {
      if (text && !(String(t.ticket_no).includes(text) || t.title.toLowerCase().includes(text) || (t.details ?? "").toLowerCase().includes(text))) return false;
      if (s.type && t.ticket_type !== s.type) return false;
      if (s.status === "OVERDUE" ? !isOverdue(t) : s.status && t.status !== s.status) return false;
      if (s.branch && t.branch_id !== s.branch) return false;
      if (s.owner && t.assigned_member_id !== s.owner) return false;
      if (s.priority && t.priority !== s.priority) return false;
      const day = t.created_at.slice(0, 10);
      if (day < from || day > to) return false;
      return true;
    });
  }, [all, s, from, to]);

  const openCount = all.filter((t) => !["CLOSED", "REJECTED"].includes(t.status)).length;
  const pending = all.filter((t) => t.status === "PENDING_APPROVAL").length;
  const overdue = all.filter((t) => isOverdue(t)).length;
  const closed = all.filter((t) => t.status === "CLOSED" && t.closed_at && t.closed_at.slice(0, 10) >= from && t.closed_at.slice(0, 10) <= to).length;

  const Kpi = ({ label, value, onClick, tone }: { label: string; value: number; onClick: () => void; tone?: string }) => (
    <button onClick={onClick} className="flex items-center justify-between gap-2 rounded-md border bg-surface px-2.5 py-1 text-start transition-colors hover:bg-muted">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={"num text-sm font-semibold " + (tone ?? "")}>{q.isLoading ? "…" : value}</span>
    </button>
  );

  const sel = (val: string | undefined, onChange: (v: string | undefined) => void, label: string, items: [string, string][]) => (
    <Select value={val ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className="h-7 w-auto max-w-40 min-w-0 gap-1 rounded-md px-1.5 text-[11px]" aria-label={label}>
        <span className="flex min-w-0 items-center gap-1 truncate text-muted-foreground" style={{ display: "flex" }}>
          <span className="shrink-0">{label}:</span>
          <SelectValue className="text-foreground" />
        </span>
      </SelectTrigger>
      <SelectContent><SelectItem value={ALL}>הכל</SelectItem>{items.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <div>
      <PageHeader title="קריאות" subtitle="תקלות, בקשות רכש, הצעות מחיר ובקשות אישור"
        actions={<TicketDialog trigger={<Button><Plus className="size-4" /> קריאה חדשה</Button>} />} />
      <div className="mb-3 grid grid-cols-2 gap-1 sm:grid-cols-4">
        <Kpi label="קריאות פתוחות" value={openCount} onClick={() => set({ status: undefined })} />
        <Kpi label="ממתינות לאישור" value={pending} onClick={() => set({ status: "PENDING_APPROVAL" })} tone="text-warning" />
        <Kpi label="באיחור" value={overdue} onClick={() => set({ status: "OVERDUE" })} tone={overdue ? "text-critical" : ""} />
        <Kpi label="נסגרו בתקופה" value={closed} onClick={() => set({ status: "CLOSED" })} />
      </div>
      <div className="panel mb-3 flex flex-wrap items-center gap-1 p-1.5">
        {sel(s.type, (v) => set({ type: v }), "סוג", Object.entries(TICKET_TYPE))}
        {sel(s.status, (v) => set({ status: v }), "סטטוס", [...Object.entries(TICKET_STATUS).map(([k, v]) => [k, v.label] as [string, string]), ["OVERDUE", "באיחור"]])}
        {!branchId && sel(s.branch, (v) => set({ branch: v }), "סניף", branches.map((b) => [b.id, b.name]))}
        {sel(s.owner, (v) => set({ owner: v }), "אחראי", members.map((m) => [m.id, m.display_name ?? m.username ?? ""]))}
        <div className="relative min-w-32 flex-1 basis-32">
          <SearchIcon className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-7 border-border/70 ps-7 text-xs" placeholder="מספר, נושא או תיאור" value={s.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} aria-label="חיפוש קריאות" />
          {s.q && <button type="button" onClick={() => set({ q: undefined })} aria-label="ניקוי חיפוש" className="absolute end-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>}
        </div>
        {sel(s.priority, (v) => set({ priority: v }), "עדיפות", Object.entries(TICKET_PRIORITY))}
        <Select value={range} onValueChange={(v) => set(v === "any" ? { range: undefined, from: undefined, to: undefined } : v === "custom" ? { range: "custom" } : { range: v, ...rangeDates(v) })}>
          <SelectTrigger className="h-7 w-auto max-w-44 min-w-0 gap-1 rounded-md px-1.5 text-[11px]" aria-label="מועד פתיחה">
            <span className="flex min-w-0 items-center gap-1 truncate text-muted-foreground" style={{ display: "flex" }}>
              <CalendarDays className="size-3.5 shrink-0" />
              <span className="shrink-0">נוצר:</span>
              <SelectValue className="text-foreground" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">כל התאריכים</SelectItem>
            <SelectItem value="today">היום</SelectItem>
            <SelectItem value="past7">7 ימים אחורה</SelectItem>
            <SelectItem value="past30">30 ימים אחורה</SelectItem>
            <SelectItem value="month">החודש</SelectItem>
            <SelectItem value="custom">טווח תאריכים…</SelectItem>
          </SelectContent>
        </Select>
        {range === "custom" && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Input type="date" dir="ltr" className="num h-7 w-28 border-border/70 text-[11px]" value={s.from ?? ""} onChange={(e) => set({ range: "custom", from: e.target.value || undefined })} aria-label="מתאריך" />
            <span>עד</span>
            <Input type="date" dir="ltr" className="num h-7 w-28 border-border/70 text-[11px]" value={s.to ?? ""} onChange={(e) => set({ range: "custom", to: e.target.value || undefined })} aria-label="עד תאריך" />
          </div>
        )}
        {(s.q || s.type || s.status || s.owner || s.priority || s.branch || s.from || s.to || s.range) && (
          <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-[11px]" onClick={() => navigate({ search: {}, replace: true })}><X className="size-3.5" /> נקה</Button>
        )}
      </div>
      <div className="panel overflow-x-auto">
        {q.isLoading ? <TableSkeleton cols={8} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !rows.length ? (
          <EmptyState title={all.length ? "אין קריאות שתואמות לסינון" : "אין עדיין קריאות"} text="קריאות שייפתחו יופיעו כאן." />
        ) : (
          <table className="data-table tickets-table">
            <thead><tr><th>מס׳</th><th>סוג</th><th className="col-title">נושא</th>{!branchId && <th>סניף</th>}<th>אחראי</th><th className="col-md">נפתחה</th><th>מועד יעד</th><th>עדיפות</th><th>סטטוס</th></tr></thead>
            <tbody>{rows.map((t) => {
              const late = isOverdue(t);
              return (
                <tr key={t.id} className="cursor-pointer" onClick={() => navigate({ to: "/tickets/$id", params: { id: t.id } })}>
                  <td className="num">#{t.ticket_no}</td>
                  <td>{TICKET_TYPE[t.ticket_type]}</td>
                  <td className="col-title font-medium"><span className="block max-w-96 truncate">{t.title}</span></td>
                  {!branchId && <td>{branchName(t.branch_id)}</td>}
                  <td>{t.assigned_member_id ? memberName(t.assigned_member_id) : <span className="text-muted-foreground">לא שויך</span>}</td>
                  <td className="num col-md text-muted-foreground">{fmtDate(t.created_at)}</td>
                  <td className={"num " + (late ? "font-medium text-critical" : "text-muted-foreground")}>{t.due_at ? fmtDate(t.due_at) : "—"}</td>
                  <td>{TICKET_PRIORITY[t.priority]}</td>
                  <td className="space-x-1"><StatusBadge tone={TICKET_STATUS[t.status]?.tone}>{TICKET_STATUS[t.status]?.label}</StatusBadge>{late && <StatusBadge tone="critical" className="ms-1">באיחור</StatusBadge>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
