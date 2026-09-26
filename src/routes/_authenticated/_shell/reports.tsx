import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { LEAD_SOURCE, LOSS_REASON, fmtNum } from "@/lib/format";
import { ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { HEALTH_LABEL, healthState, healthSeverity, entryBlocked, type HealthState } from "@/lib/health";
import { SeverityBadge, StatusBadge } from "@/components/app/badges";
import { FilterChips } from "@/components/app/states";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { RuleLink } from "@/components/app/InsightLink";

export const Route = createFileRoute("/_authenticated/_shell/reports")({
  head: () => ({
    meta: [
      { title: "דוחות — Pulse" },
      { name: "description", content: "דוחות מכירות, לקוחות, תפעול ומלאי — עם מעבר ישיר לרשומות." },
      { property: "og:title", content: "דוחות — Pulse" },
      { property: "og:description", content: "דוחות מכירות, לקוחות, תפעול ומלאי — עם מעבר ישיר לרשומות." },
    ],
  }),
  component: Reports,
});

function Bar({ label, value, max, to }: { label: string; value: number; max: number; to?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <span className="w-32 shrink-0 truncate">{to ?? label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></div>
      <span className="num w-8 text-end text-muted-foreground">{value}</span>
    </div>
  );
}

function Stat({ label, value, link }: { label: string; value: number | string; link?: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div className="num mt-1 text-lg font-semibold">{value}</div>
      {link && <div className="mt-0.5 text-xs">{link}</div>}
    </div>
  );
}

function Reports() {
  const { org, branchId, members } = useOrg();
  const q = useQuery({
    queryKey: ["reports", org.id, branchId],
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 864e5).toISOString();
      let leads = supabase.from("leads").select("id,source,status,loss_reason,assigned_member_id,created_at").eq("organization_id", org.id).is("deleted_at", null).gte("created_at", since);
      let cust = supabase.from("customers").select("id,status,joined_at").eq("organization_id", org.id).is("deleted_at", null);
      let ins = supabase.from("insights").select("rule_key,status,resolved_at").eq("organization_id", org.id);
      let tasks = supabase.from("tasks").select("assigned_member_id,status,due_at,entity_type").eq("organization_id", org.id).is("deleted_at", null);
      let acts = supabase.from("activities").select("performed_by,activity_type").eq("organization_id", org.id).eq("entity_type", "lead").gte("created_at", since);
      let ms = supabase.from("memberships").select("status,updated_at").eq("organization_id", org.id);
      if (branchId) { leads = leads.eq("branch_id", branchId); cust = cust.eq("home_branch_id", branchId); ins = ins.eq("branch_id", branchId); tasks = tasks.eq("branch_id", branchId); acts = acts.eq("branch_id", branchId); ms = ms.eq("branch_id", branchId); }
      const r = await Promise.all([leads, cust, ins, tasks, acts, ms]);
      for (const x of r) if (x.error) throw x.error;
      return { leads: r[0].data!, cust: r[1].data!, ins: r[2].data!, tasks: r[3].data!, acts: r[4].data!, ms: r[5].data! };
    },
  });

  if (q.isLoading) return <><PageHeader title="דוחות" /><TableSkeleton /></>;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  const d = q.data!;
  const count = <T,>(arr: T[], key: (x: T) => string | null) => {
    const m: Record<string, number> = {};
    arr.forEach((x) => { const k = key(x); if (k) m[k] = (m[k] ?? 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const bySource = count(d.leads, (l) => l.source);
  const loss = count(d.leads.filter((l) => l.status === "LOST"), (l) => l.loss_reason ?? "UNKNOWN");
  const won = d.leads.filter((l) => l.status === "WON").length;
  const closed = d.leads.filter((l) => l.status === "WON" || l.status === "LOST").length;
  const open = (s: string) => s === "OPEN" || s === "IN_PROGRESS";
  const insOpen = (k?: string) => d.ins.filter((i) => (i.status === "OPEN" || i.status === "ACKNOWLEDGED") && (!k || i.rule_key === k)).length;
  const month = Date.now() - 30 * 864e5;

  const perf = members.map((m) => {
    const ls = d.leads.filter((l) => l.assigned_member_id === m.id);
    const w = ls.filter((l) => l.status === "WON").length;
    const c = ls.filter((l) => l.status === "WON" || l.status === "LOST").length;
    return {
      m, assigned: ls.length, won: w, conv: c ? Math.round((w / c) * 100) : 0,
      interactions: m.user_id ? d.acts.filter((a) => a.performed_by === m.user_id && ["CALL", "WHATSAPP", "MEETING", "NOTE"].includes(a.activity_type)).length : 0,
      followUps: ls.filter((l) => l.status === "FOLLOW_UP").length,
      overdue: d.tasks.filter((t) => t.assigned_member_id === m.id && open(t.status) && new Date(t.due_at) < new Date()).length,
    };
  }).filter((x) => x.assigned || x.overdue);

  return (
    <div className="space-y-6">
      <PageHeader title="דוחות" subtitle="90 הימים האחרונים · לחיצה על ערך פותחת את הרשומות" />

      <section>
        <h2 className="mb-2 text-sm font-semibold">לידים ומכירות</h2>
        <div className="panel mb-3 grid grid-cols-2 divide-x divide-x-reverse sm:grid-cols-4">
          <Stat label="לידים שנוצרו" value={d.leads.length} link={<Link to="/leads" className="text-primary hover:underline">פתח</Link>} />
          <Stat label="המרה" value={`${closed ? Math.round((won / closed) * 100) : 0}%`} />
          <Stat label="נמכרו" value={won} />
          <Stat label="מעקבים באיחור" value={insOpen("INVALID_FOLLOW_UP")} link={<RuleLink rule="INVALID_FOLLOW_UP" className="text-primary hover:underline">פתח</RuleLink>} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="panel p-4">
            <div className="mb-2 text-sm font-medium">לידים לפי מקור</div>
            {bySource.map(([k, v]) => <Bar key={k} label={LEAD_SOURCE[k] ?? k} value={v} max={bySource[0][1]} to={<Link to="/leads" search={{ source: k }} className="hover:underline">{LEAD_SOURCE[k] ?? k}</Link>} />)}
          </div>
          <div className="panel p-4">
            <div className="mb-2 text-sm font-medium">סיבות אובדן</div>
            {!loss.length ? <p className="text-sm text-muted-foreground">אין לידים שאבדו</p> :
              loss.map(([k, v]) => <Bar key={k} label={k === "UNKNOWN" ? "ללא תיעוד" : LOSS_REASON[k]} value={v} max={loss[0][1]}
                to={k === "UNKNOWN" ? <RuleLink rule="MISSING_LOST_REASON" className="text-critical hover:underline">ללא תיעוד</RuleLink> : undefined} />)}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">ביצועי עובדים</h2>
        <div className="panel overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>עובד</th><th className="text-end">לידים משויכים</th><th className="text-end">אינטראקציות</th><th className="text-end">נמכרו</th><th className="text-end">המרה</th><th className="text-end">מעקבים פתוחים</th><th className="text-end">משימות באיחור</th></tr></thead>
            <tbody>{perf.map((p) => (
              <tr key={p.m.id}>
                <td><Link to="/leads" search={{ owner: p.m.id }} className="font-medium hover:underline">{p.m.display_name}</Link></td>
                <td className="num text-end">{p.assigned}</td><td className="num text-end">{p.interactions}</td><td className="num text-end">{p.won}</td>
                <td className="num text-end">{p.conv}%</td><td className="num text-end">{p.followUps}</td>
                <td className={"num text-end " + (p.overdue ? "text-critical" : "")}>{p.overdue ? <Link to="/tasks" search={{ filter: "overdue", owner: p.m.id }} className="hover:underline">{p.overdue}</Link> : 0}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section>
          <h2 className="mb-2 text-sm font-semibold">לקוחות</h2>
          <div className="panel grid grid-cols-2 divide-x divide-y divide-x-reverse">
            <Stat label="פעילים" value={d.cust.filter((c) => c.status === "ACTIVE").length} link={<Link to="/customers" search={{ filter: "active" }} className="text-primary hover:underline">פתח</Link>} />
            <Stat label="חדשים · 30 יום" value={d.cust.filter((c) => new Date(c.joined_at).getTime() > month).length} link={<Link to="/customers" search={{ filter: "new" }} className="text-primary hover:underline">פתח</Link>} />
            <Stat label="ביטולים · 30 יום" value={d.ms.filter((m) => m.status === "CANCELLED" && new Date(m.updated_at).getTime() > month).length} />
            <Stat label="פתיחה לא הושלמה" value={insOpen("INCOMPLETE_ONBOARDING")} link={<RuleLink rule="INCOMPLETE_ONBOARDING" className="text-primary hover:underline">פתח</RuleLink>} />
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">תפעול</h2>
          <div className="panel grid grid-cols-2 divide-x divide-y divide-x-reverse">
            <Stat label="תובנות פתוחות" value={insOpen()} link={<Link to="/dashboard" className="text-primary hover:underline">למרכז הפעולה</Link>} />
            <Stat label="נפתרו · 30 יום" value={d.ins.filter((i) => i.status === "RESOLVED" && i.resolved_at && new Date(i.resolved_at).getTime() > month).length} />
            <Stat label="משימות באיחור" value={d.tasks.filter((t) => open(t.status) && new Date(t.due_at) < new Date()).length} link={<Link to="/tasks" search={{ filter: "overdue" }} className="text-primary hover:underline">פתח</Link>} />
            <Stat label="משימות פתוחות" value={fmtNum(d.tasks.filter((t) => open(t.status)).length)} />
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">מלאי</h2>
          <div className="panel grid grid-cols-2 divide-x divide-y divide-x-reverse">
            <Stat label="מלאי נמוך" value={insOpen("LOW_STOCK")} link={<RuleLink rule="LOW_STOCK" className="text-primary hover:underline">פתח</RuleLink>} />
            <Stat label="אזל" value={insOpen("OUT_OF_STOCK")} link={<RuleLink rule="OUT_OF_STOCK" className="text-primary hover:underline">פתח</RuleLink>} />
            <Stat label="תוקף קרוב" value={insOpen("NEAR_EXPIRY")} link={<RuleLink rule="NEAR_EXPIRY" className="text-primary hover:underline">פתח</RuleLink>} />
            <Stat label="פערי ספירה" value={insOpen("COUNT_DISCREPANCY")} link={<RuleLink rule="COUNT_DISCREPANCY" className="text-primary hover:underline">פתח</RuleLink>} />
          </div>
        </section>
      </div>

      <HealthReport />
    </div>
  );
}

function HealthReport() {
  const { org, branchId } = useOrg();
  const [f, setF] = useState<"expired_members" | "all" | HealthState>("expired_members");
  const q = useQuery({
    queryKey: ["health-report", org.id, branchId],
    queryFn: async () => {
      let cq = supabase.from("customers").select("id,full_name,phone,home_branch_id").eq("organization_id", org.id).is("deleted_at", null).limit(5000);
      if (branchId) cq = cq.eq("home_branch_id", branchId);
      const [c, h, m, d] = await Promise.all([
        cq,
        supabase.from("customer_compliance_items").select("customer_id,status,expires_at,completed_at,requirement:compliance_requirements!inner(key)").eq("organization_id", org.id).eq("requirement.key", "HEALTH_DECLARATION").limit(20000),
        supabase.from("memberships").select("customer_id,status").eq("organization_id", org.id).eq("status", "ACTIVE").limit(20000),
        supabase.from("customer_documents").select("customer_id,storage_path,uploaded_at").eq("organization_id", org.id).eq("document_type", "HEALTH_DECLARATION").order("uploaded_at", { ascending: false }).limit(20000),
      ]);
      for (const x of [c, h, m, d]) if (x.error) throw x.error;
      const health = new Map(h.data!.map((x) => [x.customer_id, x]));
      const active = new Set(m.data!.map((x) => x.customer_id));
      const doc = new Map<string, { storage_path: string; uploaded_at: string }>();
      d.data!.forEach((x) => { if (!doc.has(x.customer_id)) doc.set(x.customer_id, x); });
      return c.data!.map((x) => {
        const it = health.get(x.id);
        const s = healthState(it);
        return { ...x, s, expires: it?.expires_at ?? null, member: active.has(x.id), blocked: entryBlocked(s, active.has(x.id)), doc: doc.get(x.id) };
      });
    },
  });
  async function open(path: string) {
    const { data, error } = await supabase.storage.from("customer-documents").createSignedUrl(path, 60);
    if (error) return toast.error("לא ניתן לפתוח את הקובץ");
    window.open(data.signedUrl, "_blank");
  }
  const rows = q.data ?? [];
  const list = rows.filter((r) => f === "all" ? true : f === "expired_members" ? r.blocked : r.s === f)
    .sort((a, b) => (a.expires ?? "").localeCompare(b.expires ?? ""));
  const n = (s: HealthState) => rows.filter((r) => r.s === s).length;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">הצהרות בריאות</h2>
      <div className="mb-3">
        <FilterChips value={f} onChange={setF} options={[
          { value: "expired_members", label: "מנויים חסומים לכניסה", count: rows.filter((r) => r.blocked).length },
          { value: "EXPIRED", label: "פג תוקף", count: n("EXPIRED") },
          { value: "EXPIRING", label: "פג תוך 30 יום", count: n("EXPIRING") },
          { value: "PENDING", label: "ממתינות לאישור", count: n("PENDING") },
          { value: "MISSING", label: "חסרות", count: n("MISSING") },
          { value: "VALID", label: "בתוקף", count: n("VALID") },
          { value: "all", label: "כל ההצהרות", count: rows.length },
        ]} />
      </div>
      <div className="panel overflow-x-auto">
        {q.isLoading ? <TableSkeleton cols={5} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !list.length ? <p className="p-6 text-center text-sm text-muted-foreground">אין מתאמנים בקטגוריה זו</p> : (
          <table className="data-table">
            <thead><tr><th>מתאמן</th><th>טלפון</th><th>מנוי</th><th>תוקף</th><th>מצב</th><th /></tr></thead>
            <tbody>{list.slice(0, 300).map((r) => (
              <tr key={r.id}>
                <td className="font-medium"><Link to="/customers/$id" params={{ id: r.id }} className="hover:underline">{r.full_name}</Link></td>
                <td className="text-muted-foreground"><span className="num" dir="ltr">{r.phone ?? "—"}</span></td>
                <td>{r.member ? <StatusBadge tone="ok">מנוי פעיל</StatusBadge> : <StatusBadge tone="neutral">לא מנוי</StatusBadge>}</td>
                <td className="num text-muted-foreground">{fmtDate(r.expires)}</td>
                <td className="flex flex-wrap items-center gap-1.5"><SeverityBadge severity={healthSeverity(r.s) as "OK"} label={HEALTH_LABEL[r.s]} />{r.blocked && <StatusBadge tone="critical">כניסה חסומה</StatusBadge>}</td>
                <td className="text-end">{r.doc && <Button size="sm" variant="ghost" onClick={() => open(r.doc!.storage_path)}><Download className="size-4" /> טופס</Button>}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </section>
  );
}
