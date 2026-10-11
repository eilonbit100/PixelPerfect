import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, CheckCircle2, CircleSlash, ListTodo, Plus, Search as SearchIcon, UserRound, UserX, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { LEAD_STATUS, LOSS_REASON, TASK_PRIORITY, TASK_STATUS, fmtRelative } from "@/lib/format";
import { OPEN_STATUSES, isOpen, isOverdue, leadsWithoutTask, sortQueue } from "@/lib/tasks";
import { SourceBadge, StatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { TaskDialog, useTaskTypes } from "@/components/app/TaskDialog";
import { TaskDetail } from "@/components/app/TaskDetail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Search = { view?: string; q?: string; owner?: string; branch?: string; type?: string; status?: string; priority?: string; from?: string; to?: string; source?: string; task?: string; filter?: string; range?: string };
const KEYS = ["view", "q", "owner", "branch", "type", "status", "priority", "from", "to", "source", "task", "filter", "range"] as const;

export const Route = createFileRoute("/_authenticated/_shell/tasks")({
  validateSearch: (s: Record<string, unknown>): Search => Object.fromEntries(KEYS.map((k) => [k, typeof s[k] === "string" ? s[k] : undefined])) as Search,
  head: () => ({
    meta: [
      { title: "משימות — Pulse" },
      { name: "description", content: "מרכז העבודה היומי: משימות, לידים ללא טיפול ומשימות באיחור." },
      { property: "og:title", content: "משימות — Pulse" },
      { property: "og:description", content: "מרכז העבודה היומי: משימות, לידים ללא טיפול ומשימות באיחור." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TasksPage,
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function rangeDates(r: string): { from?: string; to?: string } {
  const t = new Date(); const add = (n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return iso(d); };
  if (r === "today") return { from: iso(t), to: iso(t) };
  if (r === "tomorrow") return { from: add(1), to: add(1) };
  if (r === "week") return { from: iso(t), to: add(6) };
  if (r === "past7") return { from: add(-6), to: iso(t) };
  if (r === "month") return { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
  return {};
}

const LEGACY: Record<string, string> = { mine: "mine", today: "attention", overdue: "overdue", open: "all", done: "done" };

function TasksPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/tasks" });
  const { org, branchId, me, role, memberName, branchName, members, branches } = useOrg();
  const invalidate = useInvalidateAll();
  const types = useTaskTypes();
  const view = search.view ?? (search.filter ? LEGACY[search.filter] : undefined) ?? (role === "EMPLOYEE" ? "mine" : "attention");
  const typeLabel = (k: string | null) => types.data?.find((t) => t.key === k)?.label ?? "—";

  const q = useQuery({
    queryKey: ["tasks-all", org.id, branchId],
    queryFn: async () => {
      let t = supabase.from("tasks").select("*").eq("organization_id", org.id).is("deleted_at", null).order("due_at").limit(2000);
      if (branchId) t = t.eq("branch_id", branchId);
      let l = supabase.from("leads").select("id,full_name,phone,status,stage,branch_id,created_at,loss_reason,loss_note,assigned_member_id").eq("organization_id", org.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(2000);
      if (branchId) l = l.eq("branch_id", branchId);
      const [{ data, error }, leads] = await Promise.all([t, l]);
      if (error) throw error;
      if (leads.error) throw leads.error;
      const custIds = data.filter((x) => x.entity_type === "customer").map((x) => x.entity_id!);
      const c = custIds.length ? (await supabase.from("customers").select("id,full_name").in("id", custIds.slice(0, 500))).data ?? [] : [];
      const names = new Map<string, string>();
      [...leads.data, ...c].forEach((x) => names.set(x.id, x.full_name));
      const stage = new Map(leads.data.map((x) => [x.id, x.stage]));
      const ids = data.map((x) => x.id);
      const tk = ids.length ? (await supabase.from("approval_requests").select("id,ticket_no,task_id").in("task_id", ids.slice(0, 300))).data ?? [] : [];
      const linkedIds = data.filter((x) => x.entity_type === "ticket" && x.entity_id).map((x) => x.entity_id!);
      const lt = linkedIds.length ? (await supabase.from("approval_requests").select("id,ticket_no").in("id", linkedIds.slice(0, 300))).data ?? [] : [];
      const ticketNo = new Map(lt.map((x) => [x.id, x.ticket_no]));
      const tickets = new Map<string, { id: string; no: number }[]>();
      tk.forEach((x) => { if (x.task_id) tickets.set(x.task_id, [...(tickets.get(x.task_id) ?? []), { id: x.id, no: x.ticket_no }]); });
      return { tasks: role === "EMPLOYEE" ? data.filter((x) => x.assigned_member_id === me.id) : data, leads: leads.data, names, stage, tickets, ticketNo };
    },
  });

  const inRange = (iso: string) => (!search.from || iso.slice(0, 10) >= search.from) && (!search.to || iso.slice(0, 10) <= search.to);
  const data = q.data;
  const counts = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const openLead = new Set(tasks.filter((t) => isOpen(t) && t.entity_type === "lead").map((t) => t.entity_id!));
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
    const attention = (t: (typeof tasks)[number]) => isOpen(t) && (new Date(t.due_at) <= endToday || t.priority === "URGENT");
    return {
      openLead,
      attention,
      mine: tasks.filter((t) => isOpen(t) && t.assigned_member_id === me.id).length,
      attentionN: tasks.filter(attention).length,
      overdue: tasks.filter((t) => isOverdue(t)).length,
      nolead: leadsWithoutTask(data?.leads ?? [], openLead).length,
      done: tasks.filter((t) => t.status === "COMPLETED").length,
      unassigned: tasks.filter((t) => isOpen(t) && !t.assigned_member_id).length,
      lost: (data?.leads ?? []).filter((l) => l.status === "LOST").length,
    };
  }, [data, me.id]);

  const leadView = view === "nolead" || view === "lost";
  const leadRows = useMemo(() => {
    if (!data || !leadView) return [];
    let list = view === "nolead" ? leadsWithoutTask(data.leads, counts.openLead) : data.leads.filter((l) => l.status === "LOST");
    if (search.branch) list = list.filter((l) => l.branch_id === search.branch);
    if (search.owner) list = list.filter((l) => l.assigned_member_id === search.owner);
    if (search.q) { const s = search.q.trim(); list = list.filter((l) => l.full_name.includes(s) || (l.phone ?? "").includes(s)); }
    return list.filter((l) => inRange(l.created_at));
  }, [data, view, search, counts.openLead]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    let list = data?.tasks ?? [];
    if (search.task) return list.filter((t) => t.id === search.task);
    if (leadView) return [];
    switch (view) {
      case "mine": list = sortQueue(list.filter((t) => isOpen(t) && t.assigned_member_id === me.id)); break;
      case "attention": list = sortQueue(list.filter(counts.attention)); break;
      case "overdue": list = list.filter((t) => isOverdue(t)); break;
      case "unassigned": list = list.filter((t) => isOpen(t) && !t.assigned_member_id); break;
      case "done": list = list.filter((t) => t.status === "COMPLETED").reverse(); break;
    }
    if (search.source === "auto") list = list.filter((t) => t.source !== "MANUAL");
    if (search.source === "manual") list = list.filter((t) => t.source === "MANUAL");
    if (search.owner) list = list.filter((t) => t.assigned_member_id === search.owner);
    if (search.branch) list = list.filter((t) => t.branch_id === search.branch);
    if (search.type) list = list.filter((t) => t.task_type === search.type);
    if (search.status) list = list.filter((t) => (search.status === "OVERDUE" ? isOverdue(t) : t.status === search.status));
    if (search.priority) list = list.filter((t) => t.priority === search.priority);
    if (search.q) {
      const s = search.q.trim();
      list = list.filter((t) => t.title.includes(s) || (t.description ?? "").includes(s) || (t.entity_id && (data?.names.get(t.entity_id) ?? "").includes(s)));
    }
    return list.filter((t) => inRange(t.due_at));
  }, [data, view, search, me.id, counts, leadView]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<Search>) => navigate({ search: (s: Search) => ({ ...s, task: undefined, filter: undefined, ...p }), replace: true });
  async function complete(id: string) {
    const { error } = await supabase.from("tasks").update({ status: "COMPLETED" }).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    toast.success("המשימה הושלמה");
    invalidate();
  }

  const cards = [
    { v: "mine", label: "המשימות שלי", n: counts.mine, icon: UserRound },
    { v: "attention", label: "דורשים טיפול", n: counts.attentionN, icon: ListTodo },
    { v: "overdue", label: "משימות באיחור", n: counts.overdue, icon: AlertTriangle, tone: "critical" },
    { v: "nolead", label: "ללא משימה", n: counts.nolead, icon: UserX, tone: "warning" },
    { v: "done", label: "הושלמו", n: counts.done, icon: CheckCircle2 },
    { v: "lost", label: "לא רלוונטיים", n: counts.lost, icon: CircleSlash },
    ...(role === "EMPLOYEE" ? [] : [{ v: "unassigned", label: "לא משויכות", n: counts.unassigned, icon: UserX, tone: "warning" }]),
  ];
  const sel = (val: string | undefined, onChange: (v: string | undefined) => void, label: string, items: [string, string][], w = "w-36") => (
    <Select value={val ?? "any"} onValueChange={(v) => onChange(v === "any" ? undefined : v)}>
      <SelectTrigger className={w} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="any">{label}</SelectItem>{items.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <div>
      <PageHeader title="משימות" subtitle="מרכז העבודה היומי" actions={<TaskDialog trigger={<Button><Plus className="size-4" /> משימה חדשה</Button>} />} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {cards.map((c) => (
          <button key={c.v} type="button" onClick={() => set({ view: c.v, status: undefined })} aria-pressed={view === c.v && !search.task}
            className={`panel flex items-center justify-between gap-2 px-3 py-2 text-start transition-colors hover:bg-muted/50 ${view === c.v && !search.task ? "ring-2 ring-primary" : ""}`}>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><c.icon className={`size-3.5 ${c.tone === "critical" ? "text-critical" : c.tone === "warning" ? "text-warning" : ""}`} />{c.label}</span>
            <span className="num text-lg font-semibold leading-none">{q.isLoading ? "…" : c.n}</span>
          </button>
        ))}
      </div>
      {search.task && <div className="mb-3 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">מוצגת משימה אחת <Button size="sm" variant="ghost" onClick={() => set({})}>הצג את כל המשימות</Button></div>}
      <div className="panel mb-3 flex flex-wrap items-center gap-2 p-2">
        <div className="relative w-64">
          <SearchIcon className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-8" placeholder={leadView ? "חיפוש לפי שם או טלפון" : "חיפוש לפי משימה, לקוח או ליד"} defaultValue={search.q} onChange={(e) => set({ q: e.target.value || undefined })} aria-label="חיפוש" />
        </div>
        {role !== "EMPLOYEE" && sel(search.owner, (v) => set({ owner: v }), "אחראי: כולם", members.map((m) => [m.id, m.display_name ?? "—"]))}
        {!branchId && branches.length > 1 && sel(search.branch, (v) => set({ branch: v }), "סניף: כולם", branches.map((b) => [b.id, b.name]))}
        {!leadView && <>
          {sel(search.type, (v) => set({ type: v }), "סוג: הכל", (types.data ?? []).map((t) => [t.key, t.label]), "w-44")}
          {sel(search.status, (v) => set({ status: v }), "סטטוס: הכל", [...Object.entries(TASK_STATUS), ["OVERDUE", "באיחור"]])}
          {sel(search.priority, (v) => set({ priority: v }), "עדיפות: הכל", Object.entries(TASK_PRIORITY))}
          {sel(search.source, (v) => set({ source: v }), "מקור: הכל", [["auto", "אוטומטיות"], ["manual", "ידניות"]])}
        </>}
        <Select value={search.range ?? (search.from || search.to ? "custom" : "any")} onValueChange={(v) => set(v === "any" ? { range: undefined, from: undefined, to: undefined } : v === "custom" ? { range: "custom" } : { range: v, ...rangeDates(v) })}>
          <SelectTrigger className="w-44" aria-label={leadView ? "תאריך כניסה" : "מועד יעד"}>
            <span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-muted-foreground" /><SelectValue /></span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{leadView ? "כניסה: כל התאריכים" : "יעד: כל התאריכים"}</SelectItem>
            <SelectItem value="today">היום</SelectItem>
            <SelectItem value="tomorrow">מחר</SelectItem>
            <SelectItem value="week">7 הימים הקרובים</SelectItem>
            <SelectItem value="past7">7 הימים האחרונים</SelectItem>
            <SelectItem value="month">החודש</SelectItem>
            <SelectItem value="custom">טווח תאריכים…</SelectItem>
          </SelectContent>
        </Select>
        {(search.range ?? (search.from || search.to ? "custom" : "")) === "custom" && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>מ־</span><Input type="date" dir="ltr" className="num w-36 text-end" value={search.from ?? ""} onChange={(e) => set({ range: "custom", from: e.target.value || undefined })} aria-label="מתאריך" />
            <span>עד</span><Input type="date" dir="ltr" className="num w-36 text-end" value={search.to ?? ""} onChange={(e) => set({ range: "custom", to: e.target.value || undefined })} aria-label="עד תאריך" />
          </div>
        )}
        {(search.q || search.owner || search.branch || search.type || search.status || search.priority || search.source || search.from || search.to || search.range) && (
          <Button size="sm" variant="ghost" className="ms-auto" onClick={() => navigate({ search: { view }, replace: true })}><X className="size-4" /> נקה סינון</Button>
        )}
      </div>
      <div className="panel overflow-x-auto">
        {q.isLoading ? <TableSkeleton cols={8} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : leadView ? (
          !leadRows.length ? <EmptyState title={view === "nolead" ? "לכל הלידים יש משימת מעקב" : "אין לידים לא רלוונטיים"} text="שנו את הסינון כדי לראות רשומות נוספות." /> : (
            <table className="data-table">
              <thead><tr><th>שם</th><th>שלב</th><th>סטטוס</th><th>טלפון</th><th>אחראי</th><th>נכנס</th><th>סניף</th>{view === "lost" ? <th>סיבת סגירה</th> : <th />}</tr></thead>
              <tbody>
                {leadRows.map((l) => (
                  <tr key={l.id}>
                    <td className="font-medium"><Link className="text-primary hover:underline" to="/leads/$id" params={{ id: l.id }}>{l.full_name}</Link></td>
                    <td>{l.stage === "PROSPECT" ? "מתעניין" : "ליד"}</td>
                    <td>{LEAD_STATUS[l.status] ?? l.status}</td>
                    <td className="num">{l.phone ?? "—"}</td>
                    <td>{memberName(l.assigned_member_id)}</td>
                    <td className="num text-muted-foreground">{fmtRelative(l.created_at)}</td>
                    <td className="text-muted-foreground">{branchName(l.branch_id)}</td>
                    {view === "lost" ? <td>{LOSS_REASON[l.loss_reason ?? ""] ?? l.loss_reason ?? "—"}{l.loss_note && <span className="block text-xs text-muted-foreground">{l.loss_note}</span>}</td> : (
                      <td className="text-end">
                        <TaskDialog entityType="lead" entityId={l.id} branchId={l.branch_id} defaultTitle={`מעקב — ${l.full_name}`} defaultAssignee={l.assigned_member_id ?? me.id}
                          trigger={<Button size="sm" variant="outline"><Plus className="size-4" /> משימת מעקב</Button>} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : !rows.length ? (
          <EmptyState title="אין משימות להצגה" text="משימות חדשות — ידניות או כאלה שהמערכת יוצרת — יופיעו כאן." />
        ) : (
          <table className="data-table tasks-table">
            <thead><tr><th>משימה</th><th className="hidden xl:table-cell">סוג</th><th>קשור ל</th><th>אחראי</th><th>יעד</th><th>עדיפות</th><th>סטטוס</th><th className="hidden xl:table-cell">נוצרה</th><th className="hidden xl:table-cell">מקור</th><th /></tr></thead>
            <tbody>
              {rows.map((t) => {
                const overdue = isOverdue(t);
                const name = t.entity_id ? data!.names.get(t.entity_id) : undefined;
                return (
                  <tr key={t.id} className="cursor-pointer" onClick={() => navigate({ search: (s: Search) => ({ ...s, task: t.id }), replace: true })}>
                    <td className="col-title max-w-56">
                      <span className="block truncate font-medium">{t.title}</span>
                      {(data!.tickets.get(t.id) ?? []).map((k) => <Link key={k.id} onClick={(e) => e.stopPropagation()} to="/tickets/$id" params={{ id: k.id }} className="num ms-2 text-xs text-primary hover:underline">קריאה #{k.no}</Link>)}
                      {t.description && <span className="block truncate text-xs text-muted-foreground">{t.description}</span>}
                    </td>
                    <td className="hidden text-muted-foreground xl:table-cell">{typeLabel(t.task_type)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {t.entity_type === "lead" && t.entity_id ? <Link className="text-primary hover:underline" to="/leads/$id" params={{ id: t.entity_id }}>{data!.stage.get(t.entity_id) === "PROSPECT" ? "מתעניין" : "ליד"} · {name}</Link>
                        : t.entity_type === "customer" && t.entity_id ? <Link className="text-primary hover:underline" to="/customers/$id" params={{ id: t.entity_id }}>לקוח · {name}</Link>
                        : t.entity_type === "ticket" && t.entity_id ? <Link className="text-primary hover:underline" to="/tickets/$id" params={{ id: t.entity_id }}>קריאה #{data!.ticketNo.get(t.entity_id) ?? "—"}</Link>
                        : t.entity_type === "cancellation_request" ? <span>בקשת ביטול</span>
                        : <span className="text-muted-foreground">כללי</span>}
                    </td>
                    <td>{memberName(t.assigned_member_id)}</td>
                    <td className={overdue ? "num font-medium text-critical" : "num text-muted-foreground"}>{fmtRelative(t.due_at, true)}</td>
                    <td><StatusBadge tone={t.priority === "URGENT" || t.priority === "HIGH" ? "warning" : "neutral"}>{TASK_PRIORITY[t.priority]}</StatusBadge></td>
                    <td>{overdue ? <StatusBadge tone="critical">באיחור</StatusBadge> : <StatusBadge tone={t.status === "COMPLETED" ? "ok" : "neutral"}>{TASK_STATUS[t.status]}</StatusBadge>}</td>
                    <td className="num hidden text-muted-foreground xl:table-cell">{fmtRelative(t.created_at)}</td>
                    <td className="hidden xl:table-cell"><SourceBadge source={t.source} /></td>
                    <td className="text-end" onClick={(e) => e.stopPropagation()}>{OPEN_STATUSES.includes(t.status) && <Button size="icon" variant="ghost" aria-label="סמן כבוצע" title="סמן כבוצע" onClick={() => complete(t.id)}><CheckCircle2 className="size-4" /></Button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <TaskDetail taskId={search.task ?? null} onClose={() => navigate({ search: (s: Search) => ({ ...s, task: undefined }), replace: true })} />
    </div>
  );
}
