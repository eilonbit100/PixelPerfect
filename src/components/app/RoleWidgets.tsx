import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { fmtMoney, fmtNum } from "@/lib/format";
import type { Insight } from "@/lib/rules";
import { Skeleton } from "@/components/ui/skeleton";

export function MyWorkStrip() {
  const { me, branchId } = useOrg();
  const q = useQuery({
    queryKey: ["my-work", me.id, branchId],
    queryFn: async () => {
      const now = new Date().toISOString();
      const base = () => {
        let t = supabase.from("tasks").select("id", { count: "exact", head: true })
          .eq("assigned_member_id", me.id).in("status", ["OPEN", "IN_PROGRESS"]).is("deleted_at", null);
        if (branchId) t = t.eq("branch_id", branchId);
        return t;
      };
      let l = supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("assigned_member_id", me.id).not("status", "in", "(WON,LOST)").is("deleted_at", null);
      if (branchId) l = l.eq("branch_id", branchId);
      const [open, overdue, leads] = await Promise.all([base(), base().lt("due_at", now), l]);
      return { open: open.count ?? 0, overdue: overdue.count ?? 0, leads: leads.count ?? 0 };
    },
  });
  const d = q.data;
  const cells = [
    { label: "המשימות שלי", value: d?.open, to: "/tasks" as const, search: { filter: "mine" } },
    { label: "משימות באיחור", value: d?.overdue, to: "/tasks" as const, search: { filter: "overdue" }, bad: true },
    { label: "הלידים שלי", value: d?.leads, to: "/leads" as const, search: {} },
  ];
  return (
    <div className="panel mb-8 grid grid-cols-3 divide-x divide-x-reverse">
      {cells.map((c) => (
        <Link key={c.label} to={c.to} search={c.search as never} className="px-4 py-3 hover:bg-muted">
          <div className="eyebrow">{c.label}</div>
          {d ? <div className={"num mt-1 text-xl font-semibold " + (c.bad && d.overdue ? "text-critical" : "")}>{fmtNum(c.value ?? 0)}</div> : <Skeleton className="mt-2 h-6 w-10" />}
        </Link>
      ))}
    </div>
  );
}

export function PendingApprovals() {
  const { org, branchId, isAdmin } = useOrg();
  const q = useQuery({
    queryKey: ["approvals-pending", org.id, branchId],
    queryFn: async () => {
      let r = supabase.from("approval_requests").select("id, title, amount, branch_id").eq("approval_status", "PENDING_APPROVAL").order("submitted_at");
      if (branchId) r = r.eq("branch_id", branchId);
      const { data, error } = await r;
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">{isAdmin ? "ממתין לאישורך" : "בקשות שממתינות למטה"}</span>
        <Link to="/approvals" className="text-xs text-primary hover:underline">הכל</Link>
      </div>
      {!q.data ? <div className="p-4"><Skeleton className="h-4 w-full" /></div>
        : !q.data.length ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">אין בקשות ממתינות</p>
        : (
          <ul className="divide-y">
            {q.data.slice(0, 5).map((a) => (
              <li key={a.id}>
                <Link to="/approvals" className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-muted">
                  <span className="truncate">{a.title}</span>
                  {a.amount != null && <span className="num shrink-0 text-xs text-muted-foreground">{fmtMoney(a.amount)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

export function TeamFollowUp() {
  const { org, branchId, members, memberName } = useOrg();
  const q = useQuery({
    queryKey: ["team-followup", org.id, branchId],
    queryFn: async () => {
      let t = supabase.from("tasks").select("assigned_member_id, due_at").in("status", ["OPEN", "IN_PROGRESS"]).is("deleted_at", null).not("assigned_member_id", "is", null);
      let l = supabase.from("leads").select("assigned_member_id").not("status", "in", "(WON,LOST)").is("deleted_at", null).not("assigned_member_id", "is", null);
      if (branchId) { t = t.eq("branch_id", branchId); l = l.eq("branch_id", branchId); }
      const [tasks, leads] = await Promise.all([t, l]);
      if (tasks.error) throw tasks.error;
      if (leads.error) throw leads.error;
      const now = Date.now();
      const m = new Map<string, { open: number; overdue: number; leads: number }>();
      const get = (id: string) => m.get(id) ?? (m.set(id, { open: 0, overdue: 0, leads: 0 }), m.get(id)!);
      (tasks.data ?? []).forEach((x) => { const r = get(x.assigned_member_id!); r.open++; if (new Date(x.due_at).getTime() < now) r.overdue++; });
      (leads.data ?? []).forEach((x) => { get(x.assigned_member_id!).leads++; });
      return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.overdue - a.overdue);
    },
  });
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base font-semibold">איכות מעקב לפי עובד</h2>
      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>עובד</th><th>תפקיד</th><th>לידים פתוחים</th><th>משימות פתוחות</th><th>באיחור</th></tr></thead>
          <tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{memberName(r.id)}</td>
                <td className="text-muted-foreground">{members.find((x) => x.id === r.id)?.job_title ?? "—"}</td>
                <td className="num">{fmtNum(r.leads)}</td>
                <td className="num">{fmtNum(r.open)}</td>
                <td className={"num " + (r.overdue ? "font-medium text-critical" : "text-muted-foreground")}>{fmtNum(r.overdue)}</td>
              </tr>
            ))}
            {q.data && !q.data.length && <tr><td colSpan={5} className="text-center text-muted-foreground">אין נתונים</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function BranchComparison({ insights }: { insights: Insight[] }) {
  const { org, branches, setBranchId } = useOrg();
  const q = useQuery({
    queryKey: ["branch-compare", org.id],
    queryFn: async () => Promise.all(branches.map(async (b) => {
      const { data, error } = await supabase.rpc("get_dashboard_kpis", { _org: org.id, _branch: b.id });
      if (error) throw error;
      return { branch: b, k: data as Record<string, number> };
    })),
  });
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base font-semibold">השוואת סניפים</h2>
      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>סניף</th><th>לקוחות פעילים</th><th>הכנסות החודש</th><th>לידים · 30 יום</th><th>המרה</th><th>בעיות פתוחות</th><th>קריטיות</th><th></th></tr></thead>
          <tbody>
            {(q.data ?? []).map(({ branch, k }) => {
              const mine = insights.filter((i) => i.branch_id === branch.id);
              const crit = mine.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH").length;
              return (
                <tr key={branch.id}>
                  <td className="font-medium">{branch.name}</td>
                  <td className="num">{fmtNum(k.active_customers)}</td>
                  <td className="num">{fmtMoney(k.revenue)}</td>
                  <td className="num">{fmtNum(k.new_leads)}</td>
                  <td className="num">{k.closed_leads ? Math.round((k.won_leads / k.closed_leads) * 100) : 0}%</td>
                  <td className="num">{fmtNum(mine.length)}</td>
                  <td className={"num " + (crit ? "font-medium text-critical" : "text-muted-foreground")}>{fmtNum(crit)}</td>
                  <td><button onClick={() => setBranchId(branch.id)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">פירוט <ArrowLeft className="size-3" /></button></td>
                </tr>
              );
            })}
            {q.isLoading && <tr><td colSpan={8}><Skeleton className="h-4 w-full" /></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
