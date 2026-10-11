import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Apple,
  Boxes,
  CupSoda,
  Dumbbell,
  PackageSearch,
  Pill,
  Refrigerator,
  Search,
  Sandwich,
  SprayCan,
  X,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInsights } from "@/lib/queries";
import { RULES, healthLabel, insightTargetId, worst, type Insight } from "@/lib/rules";
import { fmtDate, fmtNum } from "@/lib/format";
import { SeverityBadge, StatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, FilterChips, PageHeader } from "@/components/app/states";
import { StockDialog } from "@/components/app/StockDialog";
import { CountsTab, MovementsTab, SuppliersTab } from "@/components/app/InventoryTabs";
import { KPI_RULES } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type SearchParams = { filter?: string; rule?: string; tab?: string; category?: string; query?: string };

const CATEGORY_ICONS: Array<{ terms: string[]; icon: LucideIcon }> = [
  { terms: ["ציוד", "אימון", "כושר"], icon: Dumbbell },
  { terms: ["משקה", "שתייה", "מים"], icon: CupSoda },
  { terms: ["חטיף", "מזון"], icon: Sandwich },
  { terms: ["תוסף", "ויטמין", "אבקה"], icon: Pill },
  { terms: ["מקרר", "קירור"], icon: Refrigerator },
  { terms: ["ניקיון", "תחזוקה"], icon: SprayCan },
  { terms: ["פרי", "בריאות"], icon: Apple },
];

function categoryIcon(category: string | null): LucideIcon {
  const normalized = category?.toLocaleLowerCase("he") ?? "";
  return CATEGORY_ICONS.find(({ terms }) => terms.some((term) => normalized.includes(term)))?.icon ?? Boxes;
}

export const Route = createFileRoute("/_authenticated/_shell/inventory/")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    filter: typeof s.filter === "string" ? s.filter : undefined,
    rule: typeof s.rule === "string" ? s.rule : undefined,
    tab: typeof s.tab === "string" ? s.tab : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    query: typeof s.query === "string" ? s.query : undefined,
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

  const tab = search.tab ?? "shelf";
  const all = (q.data?.products ?? []).filter((p) => (tab === "equipment" ? p.kind === "EQUIPMENT" : p.kind !== "EQUIPMENT"));
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    all.forEach((p) => {
      const category = p.category?.trim() || "ללא קטגוריה";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "he"));
  }, [all]);
  const kpi = (rule: string) => new Set((insights.data ?? []).filter((i) => i.rule_key === rule).map((i) => insightTargetId(i))).size;
  const rows = useMemo(() => {
    let list = all;
    if (search.category) list = list.filter((p) => (p.category?.trim() || "ללא קטגוריה") === search.category);
    const query = search.query?.trim().toLocaleLowerCase("he");
    if (query) list = list.filter((p) => [p.name, p.sku, p.barcode].some((value) => value?.toLocaleLowerCase("he").includes(query)));
    if (search.rule) list = list.filter((p) => byProd.get(p.id)?.some((i) => i.rule_key === search.rule));
    if (filter === "attention") list = list.filter((p) => byProd.has(p.id));
    if (filter === "inactive") list = list.filter((p) => p.status === "INACTIVE");
    if (filter === "active") list = list.filter((p) => p.status === "ACTIVE");
    return list;
  }, [all, byProd, filter, search.category, search.query, search.rule]);
  const set = (p: Partial<SearchParams>) => navigate({ search: (s: SearchParams) => ({ ...s, ...p }) });

  return (
    <div>
      <PageHeader title="מלאי" subtitle="כל תנועה נרשמת ביומן — היתרה מתעדכנת רק דרך תנועת מלאי" />
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {KPI_RULES.map((k) => {
          const n = kpi(k.rule);
          const active = search.rule === k.rule;
          return (
            <button key={k.rule} onClick={() => set({ tab: undefined, category: undefined, rule: active ? undefined : k.rule })} aria-pressed={active}
              className={"inline-flex items-center gap-2 rounded-md border bg-surface px-2.5 py-1 text-start transition-colors hover:bg-muted " + (active ? "border-foreground/80 ring-2 ring-primary" : "")}>
              <span className="text-[11px] text-muted-foreground">{k.label}</span>
              <span className={"num text-sm font-semibold " + (n ? (k.rule === "OUT_OF_STOCK" ? "text-critical" : "text-warning") : "")}>{insights.isLoading ? "…" : n}</span>
            </button>);
        })}
        <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
        <FilterChips dense value={filter} onChange={(v) => set({ filter: v === "all" ? undefined : v })} options={[
          { value: "all", label: "כל המוצרים", count: all.length },
          { value: "attention", label: "דורשים טיפול", count: all.filter((p) => byProd.has(p.id)).length },
          { value: "active", label: "פעילים" }, { value: "inactive", label: "לא פעילים" },
        ]} />
      </div>


      <div className="mb-3 flex flex-wrap gap-1 border-b">
        {[["shelf", "מוצרי מדף"], ["equipment", "ציוד קבוע"], ["counts", "ספירות"], ["movements", "תנועות"], ["suppliers", "ספקים"]].map(([k, l]) => (
          <button key={k} onClick={() => set({ tab: k === "shelf" ? undefined : k, category: undefined, rule: undefined, filter: undefined, query: undefined })}
            className={"-mb-px border-b-2 px-3 py-2 text-sm " + (tab === k ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div>
      {tab === "counts" ? <CountsTab /> : tab === "movements" ? <MovementsTab /> : tab === "suppliers" ? <SuppliersTab /> : <>
      {search.rule && RULES[search.rule] && (
        <div className="mb-3 flex items-center gap-2 rounded-md border bg-accent px-3 py-2 text-sm text-accent-foreground">
          מציג רק רשומות עבור: <strong>{RULES[search.rule].description}</strong>
          <button onClick={() => set({ rule: undefined })} className="ms-auto inline-flex items-center gap-1 text-xs hover:underline"><X className="size-3.5" /> נקה</button>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-1" aria-label="קטגוריות מוצרים">
        <button type="button" onClick={() => set({ category: undefined })} aria-pressed={!search.category}
          className={"inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors " + (search.category ? "bg-surface hover:bg-muted" : "border-foreground/80 bg-foreground text-background")}>
          <PackageSearch className="size-3.5" />
          <span>הכול</span>
          <span className={"num " + (search.category ? "text-muted-foreground" : "opacity-70")}>{all.length}</span>
        </button>
        {categories.map(([category, count]) => {
          const Icon = categoryIcon(category);
          const active = search.category === category;
          return (
            <button key={category} type="button" onClick={() => set({ category: active ? undefined : category })} aria-pressed={active} title={category}
              className={"inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors " + (active ? "border-foreground/80 bg-foreground text-background" : "bg-surface hover:bg-muted")}>
              <Icon className="size-3.5 shrink-0" />
              <span className="max-w-28 truncate">{category}</span>
              <span className={"num " + (active ? "opacity-70" : "text-muted-foreground")}>{count}</span>
            </button>
          );
        })}
        <div className="relative min-w-36 flex-1 basis-36">
          <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search.query ?? ""} onChange={(event) => set({ query: event.target.value || undefined })} className="h-7 border-border/70 pe-7 ps-7 text-xs" placeholder="שם, מק״ט או ברקוד" aria-label="חיפוש מוצרים" />
          {search.query && (
            <button type="button" onClick={() => set({ query: undefined })} aria-label="ניקוי חיפוש" className="absolute end-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>


      {q.isLoading || insights.isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-md" />)}
        </div>
      ) : q.error ? (
        <div className="panel"><ErrorState onRetry={() => q.refetch()} /></div>
      ) : !rows.length ? (
        <div className="panel"><EmptyState title="אין מוצרים להצגה" text="אפשר לבחור קטגוריה אחרת או לנקות את החיפוש והמסננים." /></div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((p) => {
            const iss = byProd.get(p.id) ?? [];
            const w = worst(iss);
            const Icon = categoryIcon(p.category);
            const stock = q.data?.stock.get(p.id) ?? 0;
            return (
              <article key={p.id} className="group grid min-w-0 grid-rows-[1fr_auto] rounded-md border bg-surface transition-colors hover:border-primary/60 hover:bg-muted/30">
                <Link to="/inventory/$id" params={{ id: p.id }} className="flex min-w-0 flex-col gap-2 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`פתיחת ${p.name}`}>
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                      <Icon className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-2 text-sm font-medium leading-5">{p.name}</h2>
                      <p className="num truncate text-[11px] text-muted-foreground">{p.sku}</p>
                    </div>
                    {p.status === "INACTIVE" && <StatusBadge>לא פעיל</StatusBadge>}
                  </div>
                  <div className="flex min-w-0 items-end justify-between gap-2">
                    <div>
                      <div className="text-[11px] text-muted-foreground">מלאי</div>
                      <div className="num text-lg font-semibold leading-none">{fmtNum(stock)}</div>
                    </div>
                    <div className="min-w-0 truncate text-end text-[11px] text-muted-foreground">{p.category?.trim() || "ללא קטגוריה"}</div>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-2 border-t pt-2">
                    {w ? <SeverityBadge severity={w} label={healthLabel(iss.find((i) => i.severity === w)!)} /> : <SeverityBadge severity="OK" />}
                    <span className="truncate text-[11px] text-muted-foreground">{q.data?.exp.get(p.id) ? `תוקף ${fmtDate(q.data.exp.get(p.id))}` : q.data?.sname.get(p.default_supplier_id ?? "") ?? ""}</span>
                  </div>
                </Link>
                {p.status === "ACTIVE" && p.kind !== "EQUIPMENT" && (
                  <div className="border-t p-2">
                    <StockDialog
                      productId={p.id}
                      productName={p.name}
                      defaultType={iss.some((i) => i.rule_key === "COUNT_DISCREPANCY") ? "PHYSICAL_COUNT" : "RECEIPT"}
                      trigger={<Button size="sm" variant={w ? "default" : "outline"} className="h-7 w-full text-xs">{w ? "טפל" : "תנועת מלאי"}</Button>}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      </>}

    </div>
  );
}
