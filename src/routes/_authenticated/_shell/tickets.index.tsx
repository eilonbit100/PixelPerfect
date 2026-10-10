import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Plus, Search as SearchIcon } from "lucide-react";
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

type Search = { q?: string; type?: string; status?: string; owner?: string; priority?: string; from?: string; to?: string; branch?: string };
const str = (v: unknown) => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined);

export const Route = createFileRoute("/_authenticated/_shell/tickets/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: str(s.q), type: str(s.type), status: str(s.status), owner: str(s.owner), priority: str(s.priority), from: str(s.from), to: str(s.to), branch: str(s.branch),
  }),
  head: () => ({ meta: [
    { title: "קריאות — Pulse" }, { name: "description", content: "תקלות, בקשות רכש, הצעות מחיר ובקשות אישור במקום אחד." },
    { property: "og:title", content: "קריאות — Pulse" }, { property: "og:description", content: "תקלות, בקשות רכש, הצעות מחיר ובקשות אישור." },
  ] }),
  component: TicketsPage,
});

const ALL = "__all";

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
  const from = s.from ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const to = s.to ?? new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => {
    const text = (s.q ?? "").trim().toLowerCase().replace(/^#/, "");
    return all.filter((t) => {
      if (text && !(String(t.ticket_no).includes(text) || t.title.toLowerCase().includes(text) || (t.details ?? "").toLowerCase().includes(text))) return false;
      if (s.type && t.ticket_type !== s.type) return false;
      if (s.status === "OVERDUE" ? !isOverdue(t) : s.status && t.status !== s.status) return false;
      if (s.branch && t.branch_id !== s.branch) return false;
      if (s.owner && t.assigned_member_id !== s.owner) return false;
      if (s.priority && t.priority !== s.priority) return false;
      if (s.from && t.created_at.slice(0, 10) < s.from) return false;
      if (s.to && t.created_at.slice(0, 10) > s.to) return false;
      return true;
    });
  }, [all, s]);

  const openCount = all.filter((t) => !["CLOSED", "REJECTED"].includes(t.status)).length;
  const pending = all.filter((t) => t.status === "PENDING_APPROVAL").length;
  const overdue = all.filter((t) => isOverdue(t)).length;
  const closed = all.filter((t) => t.status === "CLOSED" && t.closed_at && t.closed_at.slice(0, 10) >= from && t.closed_at.slice(0, 10) <= to).length;

  const Kpi = ({ label, value, onClick, hint }: { label: string; value: number; onClick: () => void; hint?: string }) => (
    <button onClick={onClick} className="panel p-4 text-start hover:border-primary/50">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </button>
  );
  const F = ({ k, placeholder, options }: { k: keyof Search; placeholder: string; options: [string, string][] }) => (
    <Select value={(s[k] as string) ?? ALL} onValueChange={(v) => set({ [k]: v === ALL ? undefined : v })}>
      <SelectTrigger className="w-40" aria-label={placeholder}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value={ALL}>{placeholder}</SelectItem>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <div>
      <PageHeader title="קריאות" subtitle="תקלות, בקשות רכש, הצעות מחיר ובקשות אישור"
        actions={<TicketDialog trigger={<Button><Plus className="size-4" /> קריאה חדשה</Button>} />} />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Kpi label="קריאות פתוחות" value={openCount} onClick={() => set({ status: undefined })} />
        <Kpi label="ממתינות לאישור" value={pending} onClick={() => set({ status: "PENDING_APPROVAL" })} />
        <Kpi label="באיחור" value={overdue} onClick={() => set({ status: "OVERDUE" })} />
        <Kpi label="נסגרו בתקופה" value={closed} hint={`${fmtDate(from)} – ${fmtDate(to)}`} onClick={() => set({ status: "CLOSED" })} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder="מספר, נושא או תיאור" value={s.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} aria-label="חיפוש קריאות" />
        </div>
        <F k="type" placeholder="כל הסוגים" options={Object.entries(TICKET_TYPE)} />
        <F k="status" placeholder="כל הסטטוסים" options={[...Object.entries(TICKET_STATUS).map(([k, v]) => [k, v.label] as [string, string]), ["OVERDUE", "באיחור"]]} />
        {!branchId && <F k="branch" placeholder="כל הסניפים" options={branches.map((b) => [b.id, b.name])} />}
        <F k="owner" placeholder="כל האחראים" options={members.map((m) => [m.id, m.display_name ?? m.username ?? ""])} />
        <F k="priority" placeholder="כל העדיפויות" options={Object.entries(TICKET_PRIORITY)} />
        <Input type="date" className="w-40" value={s.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} aria-label="מתאריך" />
        <Input type="date" className="w-40" value={s.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} aria-label="עד תאריך" />
        {Object.values(s).some(Boolean) && <Button variant="ghost" size="sm" onClick={() => navigate({ search: {} })}>נקה סינון</Button>}
      </div>
      <div className="panel overflow-x-auto">
        {q.isLoading ? <TableSkeleton cols={8} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !rows.length ? (
          <EmptyState title={all.length ? "אין קריאות שתואמות לסינון" : "אין עדיין קריאות"} text="קריאות שייפתחו יופיעו כאן." />
        ) : (
          <table className="data-table">
            <thead><tr><th>מס׳</th><th>סוג</th><th>נושא</th><th>סניף</th><th>אחראי</th><th>נפתחה</th><th>מועד יעד</th><th>עדיפות</th><th>סטטוס</th></tr></thead>
            <tbody>{rows.map((t) => {
              const late = isOverdue(t);
              return (
                <tr key={t.id} className="cursor-pointer" onClick={() => navigate({ to: "/tickets/$id", params: { id: t.id } })}>
                  <td className="num">#{t.ticket_no}</td>
                  <td>{TICKET_TYPE[t.ticket_type]}</td>
                  <td className="max-w-64 truncate font-medium">{t.title}</td>
                  <td>{branchName(t.branch_id)}</td>
                  <td>{t.assigned_member_id ? memberName(t.assigned_member_id) : <span className="text-muted-foreground">לא שויך</span>}</td>
                  <td className="num text-muted-foreground">{fmtDate(t.created_at)}</td>
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
