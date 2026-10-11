import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { ErrorState, FilterChips, PageHeader, TableSkeleton } from "@/components/app/states";
import { StatusBadge } from "@/components/app/badges";
import { CATEGORY_LABEL, SEVERITY_LABEL, cardHealth, type HealthCategory, type HealthIssue, type HealthSeverity } from "@/lib/card-health";

type F = "all" | "BLOCKS_ENTRY" | HealthCategory;
type Search = { f?: F };

export const Route = createFileRoute("/_authenticated/_shell/reports/cards")({
  validateSearch: (s: Record<string, unknown>): Search => ({ f: typeof s.f === "string" ? (s.f as F) : undefined }),
  head: () => ({ meta: [
    { title: "כרטיסי לקוח לא תקינים — Pulse" },
    { name: "description", content: "כל הליקויים בכרטיסי הלקוח במקום אחד: הצהרות, תקנונים, תשלומים, אמצעי תשלום ופרטים חסרים." },
    { property: "og:title", content: "כרטיסי לקוח לא תקינים — Pulse" },
    { property: "og:description", content: "כל הליקויים בכרטיסי הלקוח במקום אחד, כל לקוח נספר פעם אחת." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

const SEV_TONE: Record<HealthSeverity, "critical" | "warning" | "neutral"> = { BLOCKS_ENTRY: "critical", URGENT: "warning", INFO: "neutral" };
const SEV_RANK: Record<HealthSeverity, number> = { BLOCKS_ENTRY: 0, URGENT: 1, INFO: 2 };

function Page() {
  const { org, branchId } = useOrg();
  const { f = "all" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = useQuery({
    queryKey: ["card-health-report", org.id, branchId],
    queryFn: async () => {
      let cq = supabase.from("customers").select("id,full_name,phone,national_id,birth_date,address,payment_method,created_at,home_branch_id").eq("organization_id", org.id).is("deleted_at", null).limit(5000);
      if (branchId) cq = cq.eq("home_branch_id", branchId);
      const [c, ci, p, m, plans] = await Promise.all([
        cq,
        supabase.from("customer_compliance_items").select("id,customer_id,status,expires_at,updated_at,requirement:compliance_requirements(key,name,required,active)").eq("organization_id", org.id).limit(20000),
        supabase.from("payments").select("id,customer_id,status,amount,due_at,created_at,failure_reason").eq("organization_id", org.id).eq("status", "FAILED").limit(20000),
        supabase.from("memberships").select("customer_id,status,membership_plan_id").eq("organization_id", org.id).in("status", ["ACTIVE", "FROZEN", "PENDING"]).limit(20000),
        supabase.from("membership_plans").select("id,billing_period").eq("organization_id", org.id),
      ]);
      for (const x of [c, ci, p, m, plans]) if (x.error) throw x.error;
      const group = <T extends { customer_id: string }>(rows: T[]) => { const g = new Map<string, T[]>(); rows.forEach((r) => g.set(r.customer_id, [...(g.get(r.customer_id) ?? []), r])); return g; };
      const bill = new Map(plans.data!.map((x) => [x.id, x.billing_period]));
      const gi = group(ci.data!), gp = group(p.data!), gm = group(m.data!);
      return c.data!.map((x) => ({
        ...x,
        issues: cardHealth(x, (gi.get(x.id) ?? []) as never, (gp.get(x.id) ?? []) as never,
          (gm.get(x.id) ?? []).map((y) => ({ status: y.status, billing_period: y.membership_plan_id ? bill.get(y.membership_plan_id) ?? null : null }))),
      })).filter((x) => x.issues.length);
    },
  });

  const rows = q.data ?? [];
  const match = (i: HealthIssue) => f === "all" || (f === "BLOCKS_ENTRY" ? i.severity === "BLOCKS_ENTRY" : i.category === f);
  const count = (pred: (i: HealthIssue) => boolean) => rows.filter((r) => r.issues.some(pred)).length;
  const list = rows.filter((r) => r.issues.some(match))
    .map((r) => ({ ...r, top: Math.min(...r.issues.map((i) => SEV_RANK[i.severity])) }))
    .sort((a, b) => a.top - b.top || b.issues.length - a.issues.length);

  return (
    <div>
      <Link to="/reports" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> לספריית הדוחות</Link>
      <PageHeader title="כרטיסי לקוח לא תקינים" subtitle="כל לקוח נספר פעם אחת בסך הכול, ומופיע בכל מסנן שרלוונטי לו. תיקון בכרטיס מסיר אותו מכאן." />
      <div className="mb-3">
        <FilterChips value={f} onChange={(v) => navigate({ search: { f: v === "all" ? undefined : v }, replace: true })} options={[
          { value: "all", label: "כל הכרטיסים הלא תקינים", count: rows.length },
          { value: "BLOCKS_ENTRY", label: "חוסם כניסה", count: count((i) => i.severity === "BLOCKS_ENTRY") },
          ...(Object.keys(CATEGORY_LABEL) as HealthCategory[]).map((k) => ({ value: k, label: CATEGORY_LABEL[k], count: count((i) => i.category === k) })),
        ]} />
      </div>
      <div className="panel overflow-x-auto">
        {q.isLoading ? <TableSkeleton cols={4} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !list.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">אין כרטיסים לא תקינים במסנן זה</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>לקוח</th><th>טלפון</th><th>ליקויים</th><th>חומרה</th></tr></thead>
            <tbody>{list.slice(0, 500).map((r) => {
              const shown = r.issues.filter(match);
              const sev = (["BLOCKS_ENTRY", "URGENT", "INFO"] as HealthSeverity[])[r.top];
              return (
                <tr key={r.id}>
                  <td className="font-medium"><Link to="/customers/$id" params={{ id: r.id }} className="hover:underline">{r.full_name}</Link></td>
                  <td className="text-muted-foreground"><span className="num" dir="ltr">{r.phone ?? "—"}</span></td>
                  <td><ul className="space-y-0.5 text-sm">{shown.map((i) => <li key={i.key}><span className="text-muted-foreground">{CATEGORY_LABEL[i.category]}:</span> {i.title}</li>)}</ul></td>
                  <td><StatusBadge tone={SEV_TONE[sev]}>{SEVERITY_LABEL[sev]}</StatusBadge></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
