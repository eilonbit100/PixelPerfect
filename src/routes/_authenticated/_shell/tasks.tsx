import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { TASK_PRIORITY, TASK_STATUS, fmtRelative } from "@/lib/format";
import { SourceBadge, StatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, FilterChips, PageHeader, TableSkeleton } from "@/components/app/states";
import { TaskDialog } from "@/components/app/TaskDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Search = { filter?: string; source?: string; owner?: string; task?: string };

export const Route = createFileRoute("/_authenticated/_shell/tasks")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    filter: typeof s.filter === "string" ? s.filter : undefined,
    source: typeof s.source === "string" ? s.source : undefined,
    owner: typeof s.owner === "string" ? s.owner : undefined,
    task: typeof s.task === "string" ? s.task : undefined,
  }),
  head: () => ({
    meta: [
      { title: "משימות — Pulse" },
      { name: "description", content: "כל המשימות הידניות והאוטומטיות במקום אחד." },
      { property: "og:title", content: "משימות — Pulse" },
      { property: "og:description", content: "כל המשימות הידניות והאוטומטיות במקום אחד." },
    ],
  }),
  component: TasksPage,
});

const ENTITY: Record<string, string> = { lead: "ליד", customer: "לקוח", payment: "תשלום", inventory: "מלאי" };

function TasksPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/tasks" });
  const { org, branchId, me, memberName, branchName, members } = useOrg();
  const invalidate = useInvalidateAll();
  const filter = search.filter ?? "open";

  const q = useQuery({
    queryKey: ["tasks-all", org.id, branchId],
    queryFn: async () => {
      let t = supabase.from("tasks").select("*").eq("organization_id", org.id).is("deleted_at", null).order("due_at").limit(1000);
      if (branchId) t = t.eq("branch_id", branchId);
      const { data, error } = await t;
      if (error) throw error;
      const leadIds = data.filter((x) => x.entity_type === "lead").map((x) => x.entity_id!);
      const custIds = data.filter((x) => x.entity_type === "customer").map((x) => x.entity_id!);
      const [l, c] = await Promise.all([
        leadIds.length ? supabase.from("leads").select("id,full_name").in("id", leadIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
        custIds.length ? supabase.from("customers").select("id,full_name").in("id", custIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);
      const names = new Map<string, string>();
      [...(l.data ?? []), ...(c.data ?? [])].forEach((x) => names.set(x.id, x.full_name));
      const ids = (data ?? []).map((x) => x.id);
      const tk = ids.length ? (await supabase.from("approval_requests").select("id,ticket_no,task_id").in("task_id", ids.slice(0, 300))).data ?? [] : [];
      const tickets = new Map<string, { id: string; no: number }[]>();
      tk.forEach((x) => { if (x.task_id) tickets.set(x.task_id, [...(tickets.get(x.task_id) ?? []), { id: x.id, no: x.ticket_no }]); });
      return { tasks: data, names, tickets };
    },
  });

  const rows = useMemo(() => {
    let list = q.data?.tasks ?? [];
    if (search.task) return list.filter((t) => t.id === search.task);
    const now = new Date();
    const endToday = new Date(); endToday.setHours(23, 59, 59);
    const open = (s: string) => s === "OPEN" || s === "IN_PROGRESS";
    switch (filter) {
      case "mine": list = list.filter((t) => t.assigned_member_id === me.id && open(t.status)); break;
      case "today": list = list.filter((t) => open(t.status) && new Date(t.due_at) <= endToday && new Date(t.due_at) >= new Date(now.toDateString())); break;
      case "overdue": list = list.filter((t) => open(t.status) && new Date(t.due_at) < now); break;
      case "open": list = list.filter((t) => open(t.status)); break;
      case "done": list = list.filter((t) => t.status === "COMPLETED").reverse(); break;
    }
    if (search.source === "auto") list = list.filter((t) => t.source !== "MANUAL");
    if (search.source === "manual") list = list.filter((t) => t.source === "MANUAL");
    if (search.owner) list = list.filter((t) => t.assigned_member_id === search.owner);
    return list;
  }, [q.data, filter, search, me.id]);

  const set = (p: Partial<Search>) => navigate({ search: (s: Search) => ({ ...s, ...p }) });
  async function complete(id: string) {
    const { error } = await supabase.from("tasks").update({ status: "COMPLETED" }).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    toast.success("המשימה הושלמה");
    invalidate();
  }
  const overdueCount = (q.data?.tasks ?? []).filter((t) => (t.status === "OPEN" || t.status === "IN_PROGRESS") && new Date(t.due_at) < new Date()).length;

  return (
    <div>
      <PageHeader title="משימות" actions={<TaskDialog trigger={<Button><Plus className="size-4" /> משימה חדשה</Button>} />} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterChips value={filter} onChange={(v) => set({ filter: v })} options={[
          { value: "mine", label: "שלי" }, { value: "today", label: "היום" }, { value: "overdue", label: "באיחור", count: overdueCount },
          { value: "open", label: "פתוחות" }, { value: "done", label: "הושלמו" },
        ]} />
        <div className="flex gap-2">
          <Select value={search.source ?? "any"} onValueChange={(v) => set({ source: v === "any" ? undefined : v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">ידניות ואוטומטיות</SelectItem><SelectItem value="auto">אוטומטיות</SelectItem><SelectItem value="manual">ידניות</SelectItem></SelectContent>
          </Select>
          <Select value={search.owner ?? "any"} onValueChange={(v) => set({ owner: v === "any" ? undefined : v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">כל העובדים</SelectItem>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="panel overflow-x-auto">
        {q.isLoading ? <TableSkeleton cols={7} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !rows.length ? (
          <EmptyState title="אין משימות להצגה" text="משימות חדשות — ידניות או כאלה שהמערכת יוצרת — יופיעו כאן." />
        ) : (
          <table className="data-table">
            <thead><tr><th>משימה</th><th>קשור ל</th><th>אחראי</th><th>מועד</th><th>עדיפות</th><th>סטטוס</th><th>מקור</th><th>סניף</th><th /></tr></thead>
            <tbody>
              {rows.map((t) => {
                const open = t.status === "OPEN" || t.status === "IN_PROGRESS";
                const overdue = open && new Date(t.due_at) < new Date();
                const name = t.entity_id ? q.data!.names.get(t.entity_id) : undefined;
                return (
                  <tr key={t.id}>
                    <td className="font-medium">{t.title}{(q.data!.tickets.get(t.id) ?? []).map((k) => <Link key={k.id} to="/tickets/$id" params={{ id: k.id }} className="num ms-2 text-xs font-normal text-primary hover:underline">קריאה #{k.no}</Link>)}</td>
                    <td>
                      {t.entity_type === "lead" && t.entity_id ? <Link className="text-primary hover:underline" to="/leads/$id" params={{ id: t.entity_id }}>{ENTITY.lead} · {name}</Link>
                        : t.entity_type === "customer" && t.entity_id ? <Link className="text-primary hover:underline" to="/customers/$id" params={{ id: t.entity_id }}>{ENTITY.customer} · {name}</Link>
                        : <span className="text-muted-foreground">כללי</span>}
                    </td>
                    <td>{memberName(t.assigned_member_id)}</td>
                    <td className={overdue ? "font-medium text-critical" : "text-muted-foreground"}>{fmtRelative(t.due_at, true)}</td>
                    <td><StatusBadge tone={t.priority === "URGENT" || t.priority === "HIGH" ? "warning" : "neutral"}>{TASK_PRIORITY[t.priority]}</StatusBadge></td>
                    <td>{overdue ? <StatusBadge tone="critical">באיחור</StatusBadge> : <StatusBadge tone={t.status === "COMPLETED" ? "ok" : "neutral"}>{TASK_STATUS[t.status]}</StatusBadge>}</td>
                    <td><SourceBadge source={t.source} /></td>
                    <td className="text-muted-foreground">{branchName(t.branch_id)}</td>
                    <td className="text-end">{open && <Button size="sm" variant="ghost" onClick={() => complete(t.id)}><CheckCircle2 className="size-4" /> בוצע</Button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
