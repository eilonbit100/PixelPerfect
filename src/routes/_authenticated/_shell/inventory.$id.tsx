import { LinkedTickets } from "@/components/app/TicketLinks";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInsights, useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { insightTargetId } from "@/lib/rules";
import { TX_TYPE, fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { SeverityBadge, SeverityIcon, StatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { StockDialog } from "@/components/app/StockDialog";
import { ProductEditDialog, type ProductRow } from "@/components/app/ProductEditDialog";
import { fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/_shell/inventory/$id")({
  head: () => ({
    meta: [
      { title: "מוצר — Pulse" },
      { name: "description", content: "מלאי לפי סניף, אצוות ותנועות אחרונות." },
      { property: "og:title", content: "מוצר — Pulse" },
      { property: "og:description", content: "מלאי לפי סניף, אצוות ותנועות אחרונות." },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { branchName, isManager, isAdmin, branchId } = useOrg();
  const insights = useInsights();
  const invalidate = useInvalidateAll();

  const q = useQuery({
    queryKey: ["product", id, branchId],
    queryFn: async () => {
      let sl = supabase.from("inventory_stock_levels").select("*").eq("product_id", id);
      let tx = supabase.from("inventory_transactions").select("*").eq("product_id", id).order("created_at", { ascending: false }).limit(50);
      let lots = supabase.from("inventory_lots").select("*").eq("product_id", id).gt("quantity", 0).order("expiry_date");
      if (branchId) { sl = sl.eq("branch_id", branchId); tx = tx.eq("branch_id", branchId); lots = lots.eq("branch_id", branchId); }
      const [p, s, t, l] = await Promise.all([supabase.from("inventory_products").select("*").eq("id", id).maybeSingle(), sl, tx, lots]);
      for (const r of [p, s, t, l]) if (r.error) throw r.error;
      let replacement: { id: string; name: string } | null = null;
      if (p.data?.replacement_product_id) {
        const r = await supabase.from("inventory_products").select("id,name").eq("id", p.data.replacement_product_id).maybeSingle();
        replacement = r.data;
      }
      return { p: p.data, s: s.data!, t: t.data!, l: l.data!, replacement };
    },
  });

  if (q.isLoading) return <TableSkeleton rows={6} cols={4} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  const { p, s, t, l, replacement } = q.data!;
  if (!p) return <EmptyState title="המוצר לא נמצא" />;
  const issues = (insights.data ?? []).filter((i) => insightTargetId(i) === id);

  async function setMin(slId: string, v: string, field: "minimum_stock" | "target_stock" = "minimum_stock") {
    const { error } = await supabase.from("inventory_stock_levels").update(field === "minimum_stock" ? { minimum_stock: Number(v) } : { target_stock: v === "" ? null : Number(v) }).eq("id", slId);
    if (error) return toast.error(friendlyError(error));
    toast.success("המינימום עודכן");
    invalidate();
  }

  return (
    <div>
      <Link to="/inventory" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> מלאי</Link>
      <div className="panel mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{p.name}</h1>
              {p.status === "INACTIVE" ? <StatusBadge>לא פעיל</StatusBadge> : <StatusBadge tone="ok">פעיל</StatusBadge>}
              <StatusBadge>{p.kind === "EQUIPMENT" ? "ציוד קבוע" : "מוצר מדף"}</StatusBadge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 text-sm text-muted-foreground">
              {p.brand && <span>{p.brand}</span>}{p.variant && <span>{p.variant}</span>}
              <span className="num">{p.sku}</span>{p.barcode && <span className="num">ברקוד {p.barcode}</span>}<span>{[p.category, p.subcategory].filter(Boolean).join(" › ")}</span>
              <span>עלות <span className="num">{p.cost != null ? fmtMoney(p.cost) : "—"}</span></span><span>מחיר מכירה <span className="num">{p.price != null ? fmtMoney(p.price) : "—"}</span></span>
              {p.track_expiry && <span>ניהול תוקף</span>}
              {p.returnable && <span>ניתן להחזרה לספק</span>}
            </div>
            {p.status === "INACTIVE" && replacement && (
              <p className="mt-2 text-sm">הפריט אינו פעיל. מוצר חלופי: <Link to="/inventory/$id" params={{ id: replacement.id }} className="text-primary hover:underline">{replacement.name}</Link></p>
            )}
          </div>
          <div className="flex gap-2">
          {isAdmin && <ProductEditDialog p={p as ProductRow} trigger={<Button variant="outline">עריכת פרטים</Button>} />}
          {p.status === "ACTIVE" && p.kind !== "EQUIPMENT" && <StockDialog productId={id} productName={p.name} trigger={<Button>תנועת מלאי</Button>} onReplacement={(rid) => navigate({ to: "/inventory/$id", params: { id: rid } })} />}
          </div>
        </div>
        {issues.length ? (
          <div className="mt-4 space-y-2">
            {issues.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-3">
                <SeverityIcon severity={i.severity} />
                <div className="flex-1">
                  <div className="flex items-center gap-2"><SeverityBadge severity={i.severity} /><span className="font-medium">{i.title}</span><span className="text-xs text-muted-foreground">· {branchName(i.branch_id)}</span></div>
                  <div className="text-sm text-muted-foreground">{i.explanation}</div>
                  {i.rule_key === "COUNT_DISCREPANCY" && (
                    <div className="mt-1 flex gap-4 text-sm num">
                      <span>במערכת: {fmtNum(i.metadata.system as number)}</span><span>נספר: {fmtNum(i.metadata.counted as number)}</span>
                      <span className="text-critical">פער: {fmtNum(i.metadata.difference as number)}</span>
                    </div>
                  )}
                </div>
                {p.status === "ACTIVE" && (
                  <StockDialog productId={id} productName={p.name} defaultBranch={i.branch_id}
                    defaultType={i.rule_key === "COUNT_DISCREPANCY" && isManager ? "PHYSICAL_COUNT" : (i.rule_key === "NEAR_EXPIRY" || i.rule_key === "RETURN_WINDOW") && isManager ? "RETURN_TO_SUPPLIER" : "RECEIPT"}
                    trigger={<Button size="sm">{i.rule_key === "COUNT_DISCREPANCY" ? "ספירה חוזרת" : (i.rule_key === "NEAR_EXPIRY" || i.rule_key === "RETURN_WINDOW") ? "החזרה / גריעה" : "קבלת סחורה"}</Button>} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok"><CheckCircle2 className="size-4" /> המלאי תקין</div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <div className="border-b px-4 py-3 text-sm font-medium">מלאי לפי סניף</div>
          <table className="data-table">
            <thead><tr><th>סניף</th><th className="text-end">מלאי</th><th>מינימום</th><th>מלאי יעד</th></tr></thead>
            <tbody>{s.map((x) => (
              <tr key={x.id}>
                <td>{branchName(x.branch_id)}</td>
                <td className={"num text-end font-medium " + (x.current_stock <= 0 ? "text-critical" : x.current_stock <= x.minimum_stock ? "text-warning" : "")}>{fmtNum(x.current_stock)}</td>
                <td>{isManager ? <Input type="number" defaultValue={x.minimum_stock} className="num h-8 w-20" onBlur={(e) => Number(e.target.value) !== Number(x.minimum_stock) && setMin(x.id, e.target.value)} /> : <span className="num">{fmtNum(x.minimum_stock)}</span>}</td>
                <td>{isManager ? <Input type="number" defaultValue={x.target_stock ?? ""} className="num h-8 w-20" onBlur={(e) => e.target.value !== (x.target_stock?.toString() ?? "") && setMin(x.id, e.target.value, "target_stock")} /> : <span className="num">{x.target_stock != null ? fmtNum(x.target_stock) : "—"}</span>}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="panel">
          <div className="border-b px-4 py-3 text-sm font-medium">אצוות ותוקף</div>
          {!l.length ? <EmptyState title="אין אצוות פעילות" /> : (
            <table className="data-table">
              <thead><tr><th>אצווה</th><th>סניף</th><th className="text-end">כמות</th><th>תוקף</th><th>החזרה עד</th></tr></thead>
              <tbody>{l.map((x) => (
                <tr key={x.id}><td className="num">{x.lot_number ?? "—"}</td><td>{branchName(x.branch_id)}</td><td className="num text-end">{fmtNum(x.quantity)}</td><td className="num">{fmtDate(x.expiry_date)}</td><td className="num">{x.return_deadline ? fmtDate(x.return_deadline) : "—"}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel mt-4">
        <div className="border-b px-4 py-3 text-sm font-medium">תנועות אחרונות</div>
        {!t.length ? <EmptyState title="אין תנועות" /> : (
          <table className="data-table">
            <thead><tr><th>מועד</th><th>סוג</th><th>סניף</th><th className="text-end">שינוי</th><th className="text-end">לפני</th><th className="text-end">אחרי</th><th>הערה</th></tr></thead>
            <tbody>{t.map((x) => (
              <tr key={x.id}>
                <td className="num text-muted-foreground">{fmtDateTime(x.created_at)}</td>
                <td>{TX_TYPE[x.transaction_type]}{x.override_used && <span className="ms-2 inline-flex items-center gap-1 text-xs text-warning"><ShieldAlert className="size-3.5" /> חריגה</span>}</td>
                <td>{branchName(x.branch_id)}</td>
                <td className={"num text-end " + (x.quantity_delta < 0 ? "text-critical" : "text-ok")}>{x.quantity_delta > 0 ? "+" : ""}{fmtNum(x.quantity_delta)}</td>
                <td className="num text-end text-muted-foreground">{fmtNum(x.stock_before)}</td>
                <td className="num text-end">{fmtNum(x.stock_after)}</td>
                <td className="text-muted-foreground">{[x.reason ?? x.override_reason ?? x.notes, x.reference].filter(Boolean).join(" · ")}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
      <div className="mt-4"><LinkedTickets kind="product" id={id} title="קריאות על פריט/ציוד זה" /></div>
    </div>
  );
}
