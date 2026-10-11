import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { fmtDate, fmtNum, fmtRelative } from "@/lib/format";
import { ENTRY_REASON } from "@/lib/entry";
import { TASK_OUTCOME } from "@/lib/tasks";
import { LEAD_STATE_UI, isActionToday, prioritizeLeads, type PeopleLead } from "@/lib/dashboard";
import { SeverityBadge } from "@/components/app/badges";
import { TaskDialog } from "@/components/app/TaskDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type Blocked = { id: string; full_name: string; phone: string | null; reasons: string[] };

export function usePeople() {
  const { org, branchId } = useOrg();
  return useQuery({
    queryKey: ["dash-people", org.id, branchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_people", { _org: org.id, _branch: branchId ?? undefined });
      if (error) throw error;
      const d = data as { leads: PeopleLead[]; blocked: Blocked[] };
      return { leads: prioritizeLeads(d.leads ?? []), blocked: (d.blocked ?? []).map((b) => ({ ...b, reasons: b.reasons.filter((r) => r !== "FROZEN") })).filter((b) => b.reasons.length) };
    },
  });
}

function useTeamTasks(enabled: boolean) {
  const { org, branchId } = useOrg();
  return useQuery({
    enabled,
    queryKey: ["dash-team-tasks", org.id, branchId],
    queryFn: async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      let q = supabase.from("tasks").select("id, assigned_member_id, status, due_at, completed_at").is("deleted_at", null)
        .or(`status.in.(OPEN,IN_PROGRESS),completed_at.gte.${since.toISOString()}`).limit(2000);
      if (branchId) q = q.eq("branch_id", branchId);
      const acc = branchId ? supabase.from("member_branch_access").select("organization_member_id").eq("branch_id", branchId) : null;
      const [t, a] = await Promise.all([q, acc]);
      if (t.error) throw t.error;
      return { tasks: t.data ?? [], memberIds: a ? new Set((a.data ?? []).map((r) => r.organization_member_id)) : null };
    },
  });
}

const Chip = ({ label, value, bad, to, search }: { label: string; value?: number; bad?: boolean; to: string; search?: Record<string, string> }) => (
  <Link to={to as never} search={search as never} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-surface px-2 py-1 hover:bg-accent">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    {value == null ? <Skeleton className="h-4 w-5" /> : <span className={"num text-sm font-semibold " + (bad && value ? "text-critical" : "")}>{fmtNum(value)}</span>}
  </Link>
);

const resultLabel = (r: string | null) => (r ? TASK_OUTCOME[r] ?? r : "—");

function Panel({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0"><span className="text-sm font-medium">{title}</span>{hint && <span className="ms-2 text-[11px] text-muted-foreground">{hint}</span>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="px-3 py-5 text-center text-sm text-muted-foreground">{text}</p>;
const Loading = () => <div className="space-y-2 p-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>;

function LeadRows({ list, showOwner }: { list: ReturnType<typeof prioritizeLeads>; showOwner?: boolean }) {
  const { memberName } = useOrg();
  return (
    <table className="data-table tickets-table">
      <thead><tr><th className="col-title">שם</th><th>שלב</th><th>מצב</th>{showOwner && <th>אחראי</th>}<th>שיחה אחרונה</th><th>תוצאה</th><th>ניסיונות</th><th>מעקב הבא</th><th></th></tr></thead>
      <tbody>
        {list.map((l) => {
          const ui = LEAD_STATE_UI[l.state];
          return (
            <tr key={l.id}>
              <td className="col-title"><Link to="/leads/$id" params={{ id: l.id }} className="block max-w-56 truncate font-medium hover:underline">{l.full_name}</Link></td>
              <td>{l.stage === "PROSPECT" ? "מתעניין" : "ליד"}</td>
              <td><SeverityBadge severity={ui.sev} label={ui.label} /></td>
              {showOwner && <td>{l.assigned_member_id ? memberName(l.assigned_member_id) : <span className="text-critical">לא משויך</span>}</td>}
              <td className="text-muted-foreground">{l.last_call_at ? fmtRelative(l.last_call_at) : "אין"}</td>
              <td>{resultLabel(l.last_result)}</td>
              <td className="num">{l.attempts}</td>
              <td className={l.state === "followup_overdue" ? "text-critical" : "text-muted-foreground"}>{l.next_due ? fmtRelative(l.next_due, true) : "—"}</td>
              <td><Button asChild size="sm" variant="outline" className="h-6 px-2 text-[11px]"><Link to="/leads/$id" params={{ id: l.id }}>תיעוד שיחה</Link></Button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ---------------- Employee ---------------- */

export function EmployeeToday() {
  const { me } = useOrg();
  const people = usePeople();
  const tasks = useQuery({
    queryKey: ["dash-my-tasks", me.id],
    queryFn: async () => {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.from("tasks").select("id, title, due_at, entity_type, entity_id, priority")
        .eq("assigned_member_id", me.id).in("status", ["OPEN", "IN_PROGRESS"]).is("deleted_at", null).lte("due_at", end.toISOString()).order("due_at").limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const leads = people.data?.leads ?? [];
  const today = leads.filter((l) => isActionToday(l.state));
  const prospects = leads.filter((l) => l.stage === "PROSPECT");
  const now = new Date();
  const overdueTasks = (tasks.data ?? []).filter((t) => new Date(t.due_at) < now).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Chip label="משימות להיום" value={tasks.data?.length} to="/tasks" search={{ view: "mine" }} />
        <Chip label="משימות באיחור" value={tasks.data ? overdueTasks : undefined} bad to="/tasks" search={{ view: "mine" }} />
        <Chip label="לידים חדשים שלא חזרו אליהם" value={people.data ? leads.filter((l) => l.state === "new" || l.state === "new_overdue").length : undefined} bad to="/leads" search={{ filter: "mine" }} />
        <Chip label="מתעניינים לטיפול היום" value={people.data ? prospects.filter((l) => isActionToday(l.state)).length : undefined} to="/leads" search={{ filter: "mine" }} />
      </div>

      <Panel title="לטיפול עכשיו" hint="לפי סדר עדיפות — הכי דחוף למעלה">
        {people.isLoading ? <Loading /> : !today.length ? <Empty text="אין לידים או מתעניינים שדורשים שיחה היום" /> : <div className="overflow-x-auto"><LeadRows list={today} /></div>}
        {!!tasks.data?.length && (
          <ul className="divide-y border-t">
            {tasks.data.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                <Link to="/tasks" search={{ task: t.id } as never} className="truncate hover:underline">משימה · {t.title}</Link>
                <span className={"shrink-0 text-xs " + (new Date(t.due_at) < now ? "text-critical" : "text-muted-foreground")}>{fmtRelative(t.due_at, true)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="המתעניינים שלי בתהליך" hint="איפה כל אחד עומד" action={<Link to="/leads" search={{ filter: "mine" } as never} className="text-xs text-primary hover:underline">הכל</Link>}>
        {people.isLoading ? <Loading /> : !prospects.length ? <Empty text="אין מתעניינים פתוחים" /> : <div className="overflow-x-auto"><LeadRows list={prospects.slice(0, 15)} /></div>}
      </Panel>
    </div>
  );
}

/* ---------------- Manager ---------------- */

export function ManagerStrip({ cardsCount }: { cardsCount?: number }) {
  const people = usePeople();
  const team = useTeamTasks(true);
  const leads = people.data?.leads ?? [];
  const now = new Date();
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      <Chip label="לידים שלא חזרו אליהם" value={people.data ? leads.filter((l) => l.state === "new_overdue").length : undefined} bad to="/leads" />
      <Chip label="מתעניינים בלי מעקב / שיוך" value={people.data ? leads.filter((l) => l.stage === "PROSPECT" && (l.state === "no_followup" || !l.assigned_member_id)).length : undefined} bad to="/leads" />
      <Chip label="כרטיסים לא תקינים" value={cardsCount} bad to="/reports/cards" />
      <Chip label="חסומים בכניסה" value={people.data?.blocked.length} bad to="/reports/cards" />
      <Chip label="משימות צוות באיחור" value={team.data ? team.data.tasks.filter((t) => ["OPEN", "IN_PROGRESS"].includes(t.status) && new Date(t.due_at) < now).length : undefined} bad to="/tasks" search={{ view: "attention" }} />
    </div>
  );
}

export function LeadsFollowUp() {
  const people = usePeople();
  const list = (people.data?.leads ?? []).filter((l) => l.state !== "scheduled" || !l.assigned_member_id).slice(0, 15);
  return (
    <Panel title="מעקב לידים ומתעניינים" hint="לא חזרו, בלי מעקב או בלי שיוך" action={<Link to="/leads" className="text-xs text-primary hover:underline">הכל</Link>}>
      {people.isLoading ? <Loading /> : !list.length ? <Empty text="כל הלידים והמתעניינים במעקב תקין" /> : <div className="overflow-x-auto"><LeadRows list={list} showOwner /></div>}
    </Panel>
  );
}

export function BlockedCustomers() {
  const people = usePeople();
  const list = people.data?.blocked ?? [];
  return (
    <Panel title="לקוחות חסומים בכניסה" hint="הצהרת בריאות, תשלום או מנוי" action={<Link to="/reports/cards" className="text-xs text-primary hover:underline">כרטיסים לא תקינים</Link>}>
      {people.isLoading ? <Loading /> : !list.length ? <Empty text="אין לקוחות פעילים חסומים" /> : (
        <ul className="max-h-72 divide-y overflow-y-auto">
          {list.slice(0, 30).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <Link to="/customers/$id" params={{ id: c.id }} className="truncate font-medium hover:underline">{c.full_name}</Link>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">{c.reasons.map((r) => <SeverityBadge key={r} severity="HIGH" label={ENTRY_REASON[r] ?? r} />)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function TeamBoard() {
  const { members, me, role } = useOrg();
  const team = useTeamTasks(true);
  const people = usePeople();
  const rows = useMemo(() => {
    if (!team.data) return [];
    const now = new Date(); const end = new Date(); end.setHours(23, 59, 59, 999);
    const staff = members.filter((m) => m.status === "ACTIVE" && m.id !== me.id && (role === "HQ" ? m.role !== "HQ" : m.role === "EMPLOYEE")
      && (!team.data.memberIds || team.data.memberIds.has(m.id)));
    return staff.map((m) => {
      const mine = team.data.tasks.filter((t) => t.assigned_member_id === m.id);
      const open = mine.filter((t) => ["OPEN", "IN_PROGRESS"].includes(t.status));
      return {
        m, today: open.filter((t) => new Date(t.due_at) <= end).length, overdue: open.filter((t) => new Date(t.due_at) < now).length,
        done: mine.filter((t) => t.status === "COMPLETED").length, leads: (people.data?.leads ?? []).filter((l) => l.assigned_member_id === m.id).length,
      };
    });
  }, [team.data, people.data, members, me.id, role]);
  return (
    <Panel title="הצוות שלי" hint="משימות היום של כל עובד">
      {team.isLoading ? <Loading /> : !rows.length ? <Empty text="אין עובדים בסניף" /> : (
        <table className="data-table tickets-table">
          <thead><tr><th className="col-title">עובד</th><th>להיום</th><th>באיחור</th><th>בוצעו היום</th><th>לידים ומתעניינים</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m.id}>
                <td className="col-title"><Link to="/tasks" search={{ view: "all", owner: r.m.id } as never} className="font-medium hover:underline">{r.m.display_name}</Link>{r.m.job_title && <span className="ms-1 text-[11px] text-muted-foreground">{r.m.job_title}</span>}</td>
                <td className="num">{r.today}</td>
                <td className={"num " + (r.overdue ? "text-critical font-semibold" : "")}>{r.overdue}</td>
                <td className="num">{r.done}</td>
                <td className="num">{r.leads}</td>
                <td><TaskDialog defaultAssignee={r.m.id} trigger={<Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]"><Plus className="size-3" />משימה</Button>} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

type InvRow = { product_id: string; product: string; branch: string; supplier?: string | null; current_stock: number; minimum_stock?: number; sold30?: number; days_left?: number | null; lead_time?: number; suggested?: number; last_sale?: string | null; quantity?: number; expiry_date?: string; return_deadline?: string };

export function SmartInventory() {
  const { org, branchId } = useOrg();
  const q = useQuery({
    queryKey: ["dash-inv", org.id, branchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_inventory", { _org: org.id, _branch: branchId ?? undefined });
      if (error) throw error;
      return data as { reorder: InvRow[]; slow: InvRow[]; returns: InvRow[]; has_sales: boolean };
    },
  });
  const d = q.data;
  const col = (title: string, hint: string, rows: InvRow[] | undefined, render: (r: InvRow) => React.ReactNode, empty: string, report?: string) => (
    <div className="min-w-0 border-t first:border-t-0 lg:border-s lg:border-t-0 lg:first:border-s-0">
      <div className="flex items-center justify-between px-3 pt-2"><span className="text-xs font-medium">{title} <span className="text-muted-foreground">· {hint}</span></span>
        {report && <Link to="/reports/$key" params={{ key: report }} className="text-[11px] text-primary hover:underline">דוח</Link>}</div>
      {!rows ? <Loading /> : !rows.length ? <Empty text={empty} /> : (
        <ul className="max-h-64 divide-y overflow-y-auto">{rows.slice(0, 12).map((r, i) => (
          <li key={r.product_id + i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
            <Link to="/inventory/$id" params={{ id: r.product_id }} className="min-w-0 truncate hover:underline">{r.product}</Link>
            <span className="shrink-0 text-[11px] text-muted-foreground">{render(r)}</span>
          </li>))}</ul>
      )}
    </div>
  );
  return (
    <Panel title="מלאי חכם" hint={d && !d.has_sales ? "אין מכירות ב־30 יום — ההמלצות לפי מינימום בלבד" : "לפי קצב מכירה 30 יום וזמן אספקה"} action={<Link to="/inventory" className="text-xs text-primary hover:underline">למלאי</Link>}>
      {q.error ? <Empty text="לא ניתן לטעון את נתוני המלאי" /> : (
        <div className="grid lg:grid-cols-3">
          {col("להזמין", "מתחת למינימום או ייגמר בקרוב", d?.reorder, (r) => <><span className="num">{fmtNum(r.current_stock)}</span> במלאי{r.days_left != null && <> · ~{fmtNum(r.days_left)} ימים</>} · <b className="num text-foreground">להזמין {fmtNum(r.suggested)}</b></>, "אין מוצרים להזמנה", "reorder")}
          {col("להחזיר לספק", "פג תוקף בקרוב, עדיין בחלון החזרה", d?.returns, (r) => <><span className="num">{fmtNum(r.quantity)}</span> יח׳ · עד <b className="text-critical">{fmtDate(r.return_deadline)}</b></>, "אין החזרות פתוחות")}
          {col("לא זזים", "ללא מכירה 60 יום", d?.slow, (r) => <><span className="num">{fmtNum(r.current_stock)}</span> במלאי · {r.last_sale ? `נמכר ${fmtDate(r.last_sale)}` : "לא נמכר"}</>, "כל המוצרים נמכרים", "slow_movers")}
        </div>
      )}
    </Panel>
  );
}
