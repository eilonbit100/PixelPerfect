import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { fmtMoney } from "@/lib/format";
import { StatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { ProductEditDialog, type ProductRow } from "@/components/app/ProductEditDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/_shell/settings/catalog")({
  head: () => ({ meta: [
    { title: "קטלוג מוצרים — Pulse" }, { name: "description", content: "ניהול קטלוג מוצרי מדף וציוד: עלות, מחיר מכירה, קטגוריות וספקים." },
    { property: "og:title", content: "קטלוג מוצרים — Pulse" }, { property: "og:description", content: "ניהול קטלוג מוצרי מדף וציוד." },
  ] }),
  component: CatalogPage,
});

function CatalogPage() {
  const { org, isAdmin } = useOrg();
  const [term, setTerm] = useState("");
  const q = useQuery({
    queryKey: ["catalog", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_products").select("*").eq("organization_id", org.id).is("deleted_at", null).order("name");
      if (error) throw error; return data as unknown as ProductRow[];
    },
  });
  const rows = (q.data ?? []).filter((p) => !term.trim() || [p.name, p.sku, p.barcode, p.brand, p.import_code].some((v) => v?.includes(term.trim())));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Input className="w-64" placeholder="חיפוש לפי שם, מק״ט, ברקוד או מותג" value={term} onChange={(e) => setTerm(e.target.value)} />
        {isAdmin ? <ProductEditDialog trigger={<Button><Plus className="size-4" /> מוצר חדש</Button>} /> : <span className="text-xs text-muted-foreground">עריכת הקטלוג והמחירים מותרת למטה בלבד.</span>}
      </div>
      <div className="panel overflow-x-auto">
        {q.isLoading ? <TableSkeleton cols={8} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !rows.length ? <EmptyState title="אין מוצרים" /> : (
          <table className="data-table">
            <thead><tr><th>מוצר</th><th>סוג</th><th>מותג</th><th>קטגוריה</th><th className="text-end">עלות</th><th className="text-end">מחיר מכירה</th><th>תוקף</th><th>חלון החזרה</th><th /></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td className="font-medium"><Link to="/inventory/$id" params={{ id: p.id }} className="hover:underline">{p.name}</Link>{p.variant && <span className="text-muted-foreground"> · {p.variant}</span>}
                  {p.status === "INACTIVE" && <StatusBadge className="ms-2">לא פעיל</StatusBadge>}<span className="num block text-xs text-muted-foreground">{p.sku}</span></td>
                <td>{p.kind === "EQUIPMENT" ? "ציוד קבוע" : "מוצר מדף"}</td>
                <td className="text-muted-foreground">{p.brand ?? "—"}</td>
                <td className="text-muted-foreground">{[p.category, p.subcategory].filter(Boolean).join(" › ") || "—"}</td>
                <td className="num text-end">{p.cost != null ? fmtMoney(p.cost) : "—"}</td>
                <td className="num text-end">{p.price != null ? fmtMoney(p.price) : "—"}</td>
                <td>{p.track_expiry ? "מנוהל" : "—"}</td>
                <td className="num">{p.returnable ? (p.return_window_days != null ? `${p.return_window_days} ימים` : "לפי הספק") : "לא ניתן להחזרה"}</td>
                <td className="text-end">{isAdmin && <ProductEditDialog p={p} trigger={<Button size="sm" variant="ghost">עריכה</Button>} />}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
