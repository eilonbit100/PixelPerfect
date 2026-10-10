import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { fmtDate } from "@/lib/format";
import { ErrorState, FilterChips, PageHeader, TableSkeleton } from "@/components/app/states";
import { HEALTH_LABEL, healthState, healthSeverity, entryBlocked, type HealthState } from "@/lib/health";
import { SeverityBadge, StatusBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_shell/reports/health")({
  head: () => ({ meta: [
    { title: "הצהרות בריאות — דוחות Pulse" },
    { name: "description", content: "מעקב הצהרות בריאות: חסרות, פגות, ממתינות ומנויים חסומים לכניסה." },
    { property: "og:title", content: "הצהרות בריאות — דוחות Pulse" },
    { property: "og:description", content: "מעקב הצהרות בריאות: חסרות, פגות, ממתינות ומנויים חסומים לכניסה." },
  ] }),
  component: () => (
    <div>
      <Link to="/reports" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> לספריית הדוחות</Link>
      <PageHeader title="הצהרות בריאות" subtitle="מצב נוכחי של כל ההצהרות, עם הטופס החתום" />
      <HealthReport />
    </div>
  ),
});

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
