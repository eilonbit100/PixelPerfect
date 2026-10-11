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
type CardFix = { id: string; full_name: string; items: string[] };

export function usePeople() {
  const { org, branchId } = useOrg();
  return useQuery({
    queryKey: ["dash-people", org.id, branchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_people", { _org: org.id, _branch: branchId ?? undefined });
      if (error) throw error;
      const d = data as { leads: PeopleLead[]; blocked: Blocked[]; card_fixes: CardFix[] };
      return { leads: prioritizeLeads(d.leads ?? []), card_fixes: d.card_fixes ?? [], blocked: (d.blocked ?? []).map((b) => ({ ...b, reasons: b.reasons.filter((r) => r !== "FROZEN") })).filter((b) => b.reasons.length) };
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
      <thead><tr><th className="col-title">שם</th><th>מצב</th>{showOwner && <th>אחראי</th>}<th>שיחה אחרונה</th><th>תוצאה</th><th className="col-md">ניסיונות</th><th>מעקב הבא</th><th></th></tr></thead>
      <tbody>
        {list.map((l) => {
          const ui = LEAD_STATE_UI[l.state];
          return (
            <tr key={l.id}>
              <td className="col-title"><Link to="/leads/$id" params={{ id: l.id }} className="font-medium hover:underline">{l.full_name}</Link><span className="ms-1 text-[11px] text-muted-foreground">{l.stage === "PROSPECT" ? "מתעניין" : "ליד"}</span></td>
              <td><SeverityBadge severity={ui.sev} label={ui.label} /></td>
              {showOwner && <td>{l.assigned_member_id ? memberName(l.assigned_member_id) : <span className="text-critical">לא משויך</span>}</td>}
              <td className="text-muted-foreground">{l.last_call_at ? fmtRelative(l.last_call_at) : "אין"}</td>
              <td><span className="block max-w-28 truncate" title={resultLabel(l.last_result)}>{resultLabel(l.last_result)}</span></td>
              <td className="num col-md">{l.attempts}</td>
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

const DAILY_LEAD_GOAL = 4;
const CARD_ITEM: Record<string, string> = { HEALTH_DECLARATION: "הצהרת בריאות", SIGNED_TERMS: "חתימה על תקנון", PAYMENT_METHOD: "אמצעי תשלום" };

function useMyStats() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["dash-my-stats", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_my_stats", { _org: org.id });
      if (error) throw error;
      return data as { closed_today: number; closed_week: number; closed_month: number; calls_today: number };
    },
  });
}

function SoftRow({ to, id, name, sub, meta, cta }: { to: "/leads/$id" | "/customers/$id"; id: string; name: string; sub?: string; meta?: React.ReactNode; cta: string }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <Link to={to} params={{ id }} className="block truncate text-sm font-medium hover:underline">{name}</Link>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {meta && <span className="text-[11px] text-muted-foreground">{meta}</span>}
        <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs"><Link to={to} params={{ id }}>{cta}</Link></Button>
      </div>
    </li>
  );
}

export function EmployeeToday() {
  const { me, memberName } = useOrg();
  const people = usePeople();
  const stats = useMyStats();
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
  const all = people.data?.leads ?? [];
  const pool = all.filter((l) => l.stage === "LEAD").sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const prospects = all.filter((l) => l.stage === "PROSPECT")
    .sort((a, b) => Number(b.assigned_member_id === me.id) - Number(a.assigned_member_id === me.id) || +new Date(a.next_due ?? a.created_at) - +new Date(b.next_due ?? b.created_at));
  const focus = prospects.filter((l) => l.assigned_member_id === me.id && isActionToday(l.state));
  const fixes = people.data?.card_fixes ?? [];
  const s = stats.data;
  const calls = s?.calls_today ?? 0;
  const pct = Math.min(100, Math.round((calls / DAILY_LEAD_GOAL) * 100));
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="panel p-4">
          <p className="text-xs text-muted-foreground">היעד של היום</p>
          <p className="mt-1 text-lg font-semibold">להתקשר ל־{DAILY_LEAD_GOAL} לידים ולהמשיך שיחה עם המתעניינים</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
            <span className="num shrink-0 text-sm font-medium">{calls}/{DAILY_LEAD_GOAL} שיחות</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip label="משימות להיום" value={tasks.data?.length} to="/tasks" search={{ view: "mine" }} />
            <Chip label="לידים במאגר" value={people.data ? pool.length : undefined} to="/leads" />
            <Chip label="מתעניינים פתוחים" value={people.data ? prospects.length : undefined} to="/leads" />
            <Chip label="כרטיסים להשלמה" value={people.data ? fixes.length : undefined} to="/reports/cards" />
          </div>
        </section>
        <section className="panel p-4">
          <p className="text-xs text-muted-foreground">הסגירות שלי · מנויים חודשיים</p>
          <div className="mt-2 grid grid-cols-3 divide-x divide-x-reverse text-center">
            {([["היום", s?.closed_today], ["השבוע", s?.closed_week], ["החודש", s?.closed_month]] as const).map(([l, v]) => (
              <div key={l} className="px-2">
                {v == null ? <Skeleton className="mx-auto h-7 w-8" /> : <p className="num text-2xl font-semibold">{fmtNum(v)}</p>}
                <p className="text-[11px] text-muted-foreground">{l}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Panel title="חשוב להיום" hint="משימות ומעקבים שנקבעו להיום">
        {tasks.isLoading || people.isLoading ? <Loading /> : !tasks.data?.length && !focus.length ? <Empty text="אין משהו דחוף — זמן מצוין לקחת ליד חדש מהמאגר" /> : (
          <ul className="divide-y">
            {focus.map((l) => <SoftRow key={l.id} to="/leads/$id" id={l.id} name={l.full_name} sub={`מתעניין · ${resultLabel(l.last_result)}`} meta={l.next_due ? fmtRelative(l.next_due, true) : undefined} cta="להמשיך שיחה" />)}
            {(tasks.data ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <Link to="/tasks" search={{ task: t.id } as never} className="truncate text-sm hover:underline">{t.title}</Link>
                <span className={"shrink-0 text-[11px] " + (new Date(t.due_at) < now ? "text-attention" : "text-muted-foreground")}>{fmtRelative(t.due_at, true)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="לקחת ליד חדש" hint="מהמאגר — הוותיקים קודם" action={<Link to="/leads" className="text-xs text-primary hover:underline">כל המאגר</Link>}>
          {people.isLoading ? <Loading /> : !pool.length ? <Empty text="המאגר ריק כרגע" /> : (
            <ul className="divide-y">{pool.slice(0, 6).map((l) => <SoftRow key={l.id} to="/leads/$id" id={l.id} name={l.full_name} sub={l.phone ?? undefined} meta={`נכנס ${fmtRelative(l.created_at)}`} cta="להתקשר" />)}</ul>
          )}
        </Panel>
        <Panel title="להמשיך שיחה עם מתעניינים" hint="שלך קודם, אחר כך של הצוות" action={<Link to="/leads" className="text-xs text-primary hover:underline">הכל</Link>}>
          {people.isLoading ? <Loading /> : !prospects.length ? <Empty text="אין מתעניינים פתוחים" /> : (
            <ul className="divide-y">{prospects.slice(0, 6).map((l) => (
              <SoftRow key={l.id} to="/leads/$id" id={l.id} name={l.full_name}
                sub={`${l.assigned_member_id === me.id ? "שלי" : memberName(l.assigned_member_id)} · ${resultLabel(l.last_result)}`}
                meta={l.last_call_at ? `שיחה ${fmtRelative(l.last_call_at)}` : undefined} cta="להמשיך" />
            ))}</ul>
          )}
        </Panel>
      </div>

      <Panel title="לסגור בכרטיסי לקוחות" hint="הצהרת בריאות, תקנון או אמצעי תשלום">
        {people.isLoading ? <Loading /> : !fixes.length ? <Empty text="כל הכרטיסים מלאים" /> : (
          <ul className="grid divide-y sm:grid-cols-2 sm:divide-y-0">{fixes.slice(0, 8).map((c) => (
            <SoftRow key={c.id} to="/customers/$id" id={c.id} name={c.full_name} sub={c.items.map((i) => CARD_ITEM[i] ?? i).join(" · ")} cta="להשלים" />
          ))}</ul>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Manager ---------------- */

export function ManagerStrip() {
  const people = usePeople();
  const team = useTeamTasks(true);
  const leads = people.data?.leads ?? [];
  const now = new Date();
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      <Chip label="לידים שלא חזרו אליהם" value={people.data ? leads.filter((l) => l.state === "new_overdue").length : undefined} bad to="/leads" />
      <Chip label="מתעניינים בלי מעקב / שיוך" value={people.data ? leads.filter((l) => l.stage === "PROSPECT" && (l.state === "no_followup" || !l.assigned_member_id)).length : undefined} bad to="/leads" />
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
