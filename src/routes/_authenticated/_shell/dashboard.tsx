import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInsights, useRefreshInsights } from "@/lib/queries";
import { RULES, sevRank, worst, type Insight } from "@/lib/rules";
import { fmtMoney, fmtNum, fmtRelative, greeting } from "@/lib/format";
import { SEVERITY_UI } from "@/components/app/badges";
import { DailyPlanManager } from "@/components/app/DailyPlan";
import { EmptyState, ErrorState } from "@/components/app/states";
import { RuleLink } from "@/components/app/InsightLink";
import { Skeleton } from "@/components/ui/skeleton";
import { BranchComparison, PendingApprovals } from "@/components/app/RoleWidgets";
import { BlockedCustomers, EmployeeToday, LeadsFollowUp, ManagerStrip, SmartInventory, TeamBoard } from "@/components/app/DashboardWidgets";

export const Route = createFileRoute("/_authenticated/_shell/dashboard")({
  head: () => ({
    meta: [
      { title: "מרכז פעולה — Pulse" },
      { name: "description", content: "מה דורש את תשומת הלב שלך היום, לפי סדר עדיפות." },
      { property: "og:title", content: "מרכז פעולה — Pulse" },
      { property: "og:description", content: "מה דורש את תשומת הלב שלך היום, לפי סדר עדיפות." },
    ],
  }),
  component: Dashboard,
});

function Kpi({ label, value, prev, current, invert }: { label: string; value: string; prev?: number; current?: number; invert?: boolean }) {
  let trend: React.ReactNode = null;
  if (prev !== undefined && current !== undefined && prev > 0) {
    const pct = Math.round(((current - prev) / prev) * 100);
    const good = invert ? pct <= 0 : pct >= 0;
    const Icon = pct >= 0 ? TrendingUp : TrendingDown;
    trend = (
      <span className={"inline-flex items-center gap-0.5 text-xs " + (good ? "text-ok" : "text-critical")}>
        <Icon className="size-3.5" /><span className="num">{pct > 0 ? "+" : ""}{pct}%</span>
      </span>
    );
  }
  return (
    <div className="px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="num text-xl font-semibold tracking-tight">{value}</span>
        {trend}
      </div>
    </div>
  );
}

function breakdown(rule: string, list: Insight[]): string | null {
  if (rule === "INVALID_FOLLOW_UP") {
    const a = list.filter((i) => i.metadata?.reason === "NO_TASK").length;
    const b = list.length - a;
    return [a && `${a} ללא משימה עתידית`, b && `${b} משימות באיחור`].filter(Boolean).join(" • ");
  }
  if (rule === "MISSING_COMPLIANCE") {
    const c: Record<string, number> = {};
    list.forEach((i) => ((i.metadata?.missing as string[]) ?? []).forEach((k) => (c[k] = (c[k] ?? 0) + 1)));
    const names: Record<string, string> = { HEALTH_DECLARATION: "ללא הצהרת בריאות", SIGNED_TERMS: "ללא תקנון", PAYMENT_METHOD: "ללא אמצעי תשלום" };
    return Object.entries(c).map(([k, n]) => `${n} ${names[k] ?? k}`).join(" • ");
  }
  if (rule === "FAILED_PAYMENT") {
    const sum = list.reduce((s, i) => s + Number(i.metadata?.amount ?? 0), 0);
    return `סה״כ ${fmtMoney(sum)} לגבייה`;
  }
  return list.slice(0, 2).map((i) => i.explanation).filter(Boolean).join(" • ") + (list.length > 2 ? ` ועוד ${list.length - 2}` : "");
}

const COPILOT: { q: string; rule?: string; to?: "tasks" }[] = [
  { q: "איזה לידים דורשים טיפול היום?", rule: "INVALID_FOLLOW_UP" },
  { q: "תראה לי לקוחות עם מסמכים חסרים", rule: "MISSING_COMPLIANCE" },
  { q: "אילו חיובים נכשלו?", rule: "FAILED_PAYMENT" },
  { q: "מה חסר במלאי?", rule: "LOW_STOCK" },
];

function Copilot({ groups }: { groups: { rule: string; list: Insight[] }[] }) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<{ text: string; rule?: string } | null>(null);
  const count = (r: string) => groups.find((g) => g.rule === r)?.list.length ?? 0;

  function ask(text: string) {
    const t = text.trim();
    if (!t) return;
    const match =
      /ליד/.test(t) ? (/לא מטופל|הפסיק/.test(t) ? "INACTIVE_LEAD" : "INVALID_FOLLOW_UP")
      : /מסמ|הצהר|תקנון/.test(t) ? "MISSING_COMPLIANCE"
      : /חיוב|תשלום|גבי/.test(t) ? "FAILED_PAYMENT"
      : /תוקף/.test(t) ? "NEAR_EXPIRY"
      : /אזל/.test(t) ? "OUT_OF_STOCK"
      : /מלאי/.test(t) ? "LOW_STOCK"
      : /משימ|איחור/.test(t) ? "OVERDUE_TASK"
      : /פתיח|מנוי/.test(t) ? "INCOMPLETE_ONBOARDING"
      : undefined;
    if (!match) {
      const top = [...groups].sort((a, b) => sevRank(worst(a.list)!) - sevRank(worst(b.list)!))[0];
      setAnswer(top ? { text: `הנושא הדחוף ביותר כרגע: ${RULES[top.rule].group(top.list.length)}.`, rule: top.rule } : { text: "אין כרגע נושאים פתוחים שדורשים טיפול." });
      return;
    }
    const n = count(match);
    setAnswer(n ? { text: `יש ${RULES[match].group(n)}.`, rule: match } : { text: "לא נמצאו רשומות כאלה כרגע — הכל תקין." });
  }

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-primary" /> שאל את המערכת</div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="mt-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="מה דורש ממני טיפול היום?"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {COPILOT.map((c) => (
          <button key={c.q} onClick={() => { setQ(c.q); ask(c.q); }} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground">{c.q}</button>
        ))}
      </div>
      {answer && (
        <div className="mt-3 rounded-md border bg-background p-3 text-sm">
          <p>{answer.text}</p>
          {answer.rule && (
            <RuleLink rule={answer.rule} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              הצג את הרשומות <ArrowLeft className="size-3.5" />
            </RuleLink>
          )}
          <p className="mt-2 text-xs text-muted-foreground">התשובה מבוססת על נתוני המערכת בזמן אמת.</p>
        </div>
      )}
    </div>
  );
}

function InsightList({ title, hint, groups, empty }: { title: string; hint: string; groups: { rule: string; list: Insight[] }[]; empty: string }) {
  const n = groups.reduce((s, g) => s + g.list.length, 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>
        {!!n && <span className="num text-xs text-muted-foreground">{n} פריטים</span>}
      </div>
      <div className="panel divide-y overflow-hidden">
        {!groups.length ? <p className="px-4 py-4 text-sm text-muted-foreground">{empty}</p> : groups.map(({ rule, list }) => {
          const sev = worst(list)!;
          const ui = SEVERITY_UI[sev];
          const Icon = ui.icon;
          const tone = ui.cls.split(" ")[1];
          return (
            <RuleLink key={rule} rule={rule} className="group flex items-center gap-3 px-4 py-3 hover:bg-accent">
              <Icon className={"size-4 shrink-0 " + tone} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium">{RULES[rule].group(list.length)}</span>
                  <span className={"shrink-0 text-xs " + tone}>{ui.label}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{breakdown(rule, list)}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
                {RULES[rule].cta} <ArrowLeft className="size-3.5" />
              </span>
            </RuleLink>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard() {
  const { org, branchId, profileName, me, memberName, role, branchName } = useOrg();
  useRefreshInsights();
  const insights = useInsights();
  const navigate = useNavigate();

  const kpis = useQuery({
    enabled: role === "HQ",
    queryKey: ["kpis", org.id, branchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_kpis", { _org: org.id, _branch: branchId ?? undefined });
      if (error) throw error;
      return data as Record<string, number>;
    },
  });

  const myTasks = useQuery({
    queryKey: ["my-tasks", me.id, branchId],
    queryFn: async () => {
      let q = supabase.from("tasks").select("*").eq("assigned_member_id", me.id).in("status", ["OPEN", "IN_PROGRESS"])
        .is("deleted_at", null).lte("due_at", new Date(Date.now() + 36 * 3600e3).toISOString()).order("due_at").limit(8);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const groups = useMemo(() => {
    const m = new Map<string, Insight[]>();
    (insights.data ?? []).forEach((i) => { if (RULES[i.rule_key]) m.set(i.rule_key, [...(m.get(i.rule_key) ?? []), i]); });
    return [...m.entries()].map(([rule, list]) => ({ rule, list }))
      .sort((a, b) => sevRank(worst(a.list)!) - sevRank(worst(b.list)!) || b.list.length - a.list.length);
  }, [insights.data]);

  const k = kpis.data;
  const conv = k && k.closed_leads ? Math.round((k.won_leads / k.closed_leads) * 100) : 0;
  const firstName = (profileName || "").split(" ")[0];

  const scope = role === "HQ" ? (branchId ? `סניף ${branchName(branchId)}` : "כל הארגון") : role === "BRANCH_MANAGER" ? `סניף ${branchName(branchId)}` : "הסניף שלך";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {role === "EMPLOYEE" ? "הנה מה שדורש ממך טיפול היום." : `הנה מה שדורש את תשומת הלב שלך היום · ${scope}`}
        </p>
      </div>

      {role === "HQ" && (
      <div className="panel mb-4 grid grid-cols-2 divide-x divide-y divide-x-reverse sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-5">
        {kpis.isLoading || !k ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="px-4 py-3"><Skeleton className="h-3 w-20" /><Skeleton className="mt-2 h-6 w-16" /></div>)
        ) : (
          <>
            <Kpi label="לקוחות פעילים" value={fmtNum(k.active_customers)} />
            <Kpi label="הכנסות החודש" value={fmtMoney(k.revenue)} current={k.revenue} prev={k.revenue_prev} />
            <Kpi label="לידים חדשים · 30 יום" value={fmtNum(k.new_leads)} current={k.new_leads} prev={k.new_leads_prev} />
            <Kpi label="המרה · 30 יום" value={`${conv}%`} />
            <Kpi label="ביטולים · 30 יום" value={fmtNum(k.cancellations)} />
          </>
        )}
      </div>
      )}
      {role !== "EMPLOYEE" && <ManagerStrip />}

      {role === "EMPLOYEE" ? (
        <div className="mb-6 space-y-4"><EmployeeToday /></div>
      ) : (
        <div className="mb-6 space-y-4">
          <LeadsFollowUp />
          <div className="grid gap-4 xl:grid-cols-2"><TeamBoard /><BlockedCustomers /></div>
          <SmartInventory />
          <DailyPlanManager />
        </div>
      )}

      {role !== "EMPLOYEE" && (
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0 space-y-6 overflow-hidden">
          {insights.isLoading ? (
            <div className="panel divide-y">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="p-4"><Skeleton className="h-4 w-56" /><Skeleton className="mt-2 h-3 w-80" /></div>)}</div>
          ) : insights.error ? (
            <div className="panel"><ErrorState onRetry={() => insights.refetch()} /></div>
          ) : !groups.length ? (
            <div className="panel"><EmptyState icon={<CheckCircle2 className="size-5 text-ok" />} title="הכל תקין" text="אין כרגע בעיות שדורשות טיפול. המערכת ממשיכה לבדוק ברקע." /></div>
          ) : (
            <>
              <InsightList title="לביצוע היום" hint="קריטי — לטפל עוד היום" groups={groups.filter((g) => sevRank(worst(g.list)!) <= sevRank("HIGH"))} empty="אין היום משהו קריטי" />
              <InsightList title="דורש טיפול" hint="פחות דחוף — אפשר בימים הקרובים" groups={groups.filter((g) => sevRank(worst(g.list)!) > sevRank("HIGH"))} empty="אין נושאים פתוחים" />
            </>
          )}
        </section>

        <aside className="space-y-6">
          {role !== "EMPLOYEE" && <PendingApprovals />}
          <Copilot groups={groups} />
          <div className="panel">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-medium">המשימות שלי להיום</span>
              <Link to="/tasks" search={{ filter: "mine" }} className="text-xs text-primary hover:underline">הכל</Link>
            </div>
            {myTasks.isLoading ? <div className="p-4"><Skeleton className="h-4 w-full" /></div>
              : !myTasks.data?.length ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">אין משימות קרובות</p>
              : (
                <ul className="divide-y">
                  {myTasks.data.map((t) => {
                    const overdue = new Date(t.due_at) < new Date();
                    return (
                      <li key={t.id}>
                        <button
                          className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-start hover:bg-muted"
                          onClick={() => t.entity_type === "lead" && t.entity_id ? navigate({ to: "/leads/$id", params: { id: t.entity_id } })
                            : t.entity_type === "customer" && t.entity_id ? navigate({ to: "/customers/$id", params: { id: t.entity_id } })
                            : navigate({ to: "/tasks" })}
                        >
                          <span className="truncate text-sm">{t.title}</span>
                          <span className={"shrink-0 text-xs " + (overdue ? "text-critical" : "text-muted-foreground")}>{fmtRelative(t.due_at, true)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            <div className="border-t px-4 py-2 text-xs text-muted-foreground">מחובר/ת כ־{memberName(me.id)}</div>
          </div>
        </aside>
      </div>
      )}
      {role === "HQ" && !branchId && <BranchComparison insights={insights.data ?? []} />}
    </div>
  );
}
