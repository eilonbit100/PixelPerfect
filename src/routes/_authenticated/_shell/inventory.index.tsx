import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInsights } from "@/lib/queries";
import { RULES, healthLabel, insightTargetId, worst, type Insight } from "@/lib/rules";
import { fmtDate, fmtNum } from "@/lib/format";
import { SeverityBadge, StatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, FilterChips, PageHeader, TableSkeleton } from "@/components/app/states";
import { StockDialog } from "@/components/app/StockDialog";
import { Button } from "@/components/ui/button";

type Search = { filter?: string; rule?: string };

export const Route = createFileRoute("/_authenticated/_shell/inventory/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    filter: typeof s.filter === "string" ? s.filter : undefined,
    rule: typeof s.rule === "string" ? s.rule : undefined,
  }),
  head: () => ({
    meta: [
      { title: "מלאי — Pulse" },
      { name: "description", content: "מלאי לפי סניף, תוקף ופערי ספירה." },
      { property: "og:title", content: "מלאי — Pulse" },
      { property: "og:description", content: "מלאי לפי סניף, תוקף ופערי ספירה." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/inventory/" });
  const { org, branchId } = useOrg();
  const insights = useInsights();
  const filter = search.filter ?? "all";

  const q = useQuery({
    queryKey: ["inventory", org.id, branchId],
    queryFn: async () => {
      let sl = supabase.from("inventory_stock_levels").select("product_id,current_stock,minimum_stock").eq("organization_id", org.id);
      let lots = supabase.from("inventory_lots").select("product_id,expiry_date,quantity").eq("organization_id", org.id).gt("quantity", 0).not("expiry_date", "is", null);
      if (branchId) { sl = sl.eq("branch_id", branchId); lots = lots.eq("branch_id", branchId); }
      const [p, s, l, sup] = await Promise.all([
        supabase.from("inventory_products").select("*").eq("organization_id", org.id).is("deleted_at", null).order("name"),
        sl, lots, supabase.from("suppliers").select("id,name").eq("organization_id", org.id),
      ]);
      for (const r of [p, s, l, sup]) if (r.error) throw r.error;
      const stock = new Map<string, number>(); s.data!.forEach((x) => stock.set(x.product_id, (stock.get(x.product_id) ?? 0) + Number(x.current_stock)));
      const exp = new Map<string, string>(); l.data!.forEach((x) => { const c = exp.get(x.product_id); if (!c || x.expiry_date! < c) exp.set(x.product_id, x.expiry_date!); });
      const sname = new Map(sup.data!.map((x) => [x.id, x.name]));
      return { products: p.data!, stock, exp, sname };
    },
  });

  const byProd = useMemo(() => {
    const m = new Map<string, Insight[]>();
    (insights.data ?? []).filter((i) => i.entity_type.startsWith("inventory_")).forEach((i) => { const k = insightTargetId(i); m.set(k, [...(m.get(k) ?? []), i]); });
    return m;
  }, [insights.data]);

  const all = q.data?.products ?? [];
  const rows = useMemo(() => {
    let list = all;
    if (search.rule) list = list.filter((p) => byProd.get(p.id)?.some((i) => i.rule_key === search.rule));
    if (filter === "attention") list = list.filter((p) => byProd.has(p.id));
    if (filter === "inactive") list = list.filter((p) => p.status === "INACTIVE");
    if (filter === "active") list = list.filter((p) => p.status === "ACTIVE");
    return list;
  }, [all, byProd, filter, search.rule]);
  const set = (p: Partial<Search>) => navigate({ search: (s: Search) => ({ ...s, ...p }) });

  return (
    <div>
      <PageHeader title="מלאי" subtitle="כל תנועה נרשמת ביומן — היתרה מתעדכנת רק דרך תנועת מלאי" />
      {search.rule && RULES[search.rule] && (
        <div className="mb-3 flex items-center gap-2 rounded-md border bg-accent px-3 py-2 text-sm text-accent-foreground">
          מציג רק רשומות עבור: <strong>{RULES[search.rule].description}</strong>
          <button onClick={() => set({ rule: undefined })} className="ms-auto inline-flex items-center gap-1 text-xs hover:underline"><X className="size-3.5" /> נקה</button>
        </div>
      )}
      <div className="mb-3">
        <FilterChips value={filter} onChange={(v) => set({ filter: v === "all" ? undefined : v })} options={[
          { value: "all", label: "כל המוצרים", count: all.length },
          { value: "attention", label: "דורשים טיפול", count: all.filter((p) => byProd.has(p.id)).length },
          { value: "active", label: "פעילים" }, { value: "inactive", label: "לא פעילים" },
        ]} />
      </div>
      <div className="panel overflow-x-auto">
        {q.isLoading || insights.isLoading ? <TableSkeleton cols={6} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !rows.length ? (
          <EmptyState title="אין מוצרים להצגה" />
        ) : (
          <table className="data-table">
            <thead><tr><th>מוצר</th><th>מק״ט</th><th className="text-end">מלאי</th><th>מצב</th><th>תוקף קרוב</th><th>ספק</th><th /></tr></thead>
            <tbody>
              {rows.map((p) => {
                const iss = byProd.get(p.id) ?? [];
                const w = worst(iss);
                return (
                  <tr key={p.id} className="cursor-pointer" onClick={() => navigate({ to: "/inventory/$id", params: { id: p.id } })}>
                    <td className="font-medium"><Link to="/inventory/$id" params={{ id: p.id }} onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                      {p.status === "INACTIVE" && <StatusBadge className="ms-2">לא פעיל</StatusBadge>}</td>
                    <td className="num text-muted-foreground">{p.sku}</td>
                    <td className="num text-end font-medium">{fmtNum(q.data!.stock.get(p.id) ?? 0)}</td>
                    <td>{w ? <SeverityBadge severity={w} label={healthLabel(iss.find((i) => i.severity === w)!)} /> : <SeverityBadge severity="OK" />}</td>
                    <td className="num text-muted-foreground">{fmtDate(q.data!.exp.get(p.id))}</td>
                    <td className="text-muted-foreground">{q.data!.sname.get(p.default_supplier_id ?? "") ?? "—"}</td>
                    <td className="text-end" onClick={(e) => e.stopPropagation()}>
                      {p.status === "ACTIVE" && (
                        <StockDialog productId={p.id} productName={p.name} defaultType={iss.some((i) => i.rule_key === "COUNT_DISCREPANCY") ? "PHYSICAL_COUNT" : "RECEIPT"}
                          trigger={<Button size="sm" variant={w ? "default" : "ghost"}>{w ? "טפל" : "תנועה"}</Button>} />
                      )}
                    </td>
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
