import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { errorCode, friendlyError } from "@/lib/errors";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { countGap } from "@/lib/inventory";
import { COUNT_STATUS } from "@/components/app/InventoryTabs";
import { StatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, FilterChips, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/_shell/inventory/counts/$id")({
  head: () => ({ meta: [
    { title: "ספירת מלאי — Pulse" }, { name: "description", content: "הזנת כמויות שנספרו, פערים ואישור ספירה." },
    { property: "og:title", content: "ספירת מלאי — Pulse" }, { property: "og:description", content: "הזנת כמויות שנספרו, פערים ואישור ספירה." },
  ] }),
  component: CountPage,
});

function CountPage() {
  const { id } = Route.useParams();
  const { branchName, memberName, isManager } = useOrg();
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  const [filter, setFilter] = useState("all");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["stock-count", id],
    queryFn: async () => {
      const [c, l] = await Promise.all([
        supabase.from("stock_counts").select("*").eq("id", id).maybeSingle(),
        supabase.from("stock_count_lines").select("*, inventory_products(name, sku)").eq("count_id", id),
      ]);
      if (c.error) throw c.error; if (l.error) throw l.error;
      const lines = (l.data ?? []).sort((a, b) => (a.inventory_products?.name ?? "").localeCompare(b.inventory_products?.name ?? "", "he"));
      return { c: c.data, lines };
    },
  });
  if (q.isLoading) return <TableSkeleton rows={8} cols={5} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  const { c, lines } = q.data!;
  if (!c) return <EmptyState title="הספירה לא נמצאה או שאין לך הרשאה" />;
  const open = c.status === "OPEN";
  const counted = lines.filter((l) => l.counted_qty != null);
  const gaps = counted.filter((l) => countGap(l) !== 0);
  const missingReason = gaps.filter((l) => !l.reason?.trim());
  let rows = lines;
  if (filter === "uncounted") rows = rows.filter((l) => l.counted_qty == null);
  if (filter === "gaps") rows = rows.filter((l) => l.counted_qty != null && countGap(l) !== 0);
  if (term.trim()) rows = rows.filter((l) => (l.inventory_products?.name ?? "").includes(term.trim()) || (l.inventory_products?.sku ?? "").includes(term.trim()));

  async function save(lineId: string, qty: string, reason: string | null) {
    const { error } = await supabase.rpc("set_count_line", { _line: lineId, _counted: qty === "" ? (null as unknown as number) : Number(qty), _reason: reason ?? undefined });
    if (error) return toast.error(friendlyError(error));
    qc.invalidateQueries({ queryKey: ["stock-count", id] });
  }
  async function approve() {
    setBusy(true);
    const { data, error } = await supabase.rpc("approve_stock_count", { _count: id });
    setBusy(false);
    if (error) return toast.error(errorCode(error) === "GAP_REASON_REQUIRED" ? "לכל פער יש להזין סיבה לפני האישור" : friendlyError(error));
    const r = data as { counted: number; gaps: number; uncounted: number };
    toast.success(`הספירה אושרה: ${r.counted} נספרו, ${r.gaps} פערים עודכנו, ${r.uncounted} לא נספרו`);
    qc.invalidateQueries({ queryKey: ["stock-count", id] }); qc.invalidateQueries({ queryKey: ["stock-counts"] });
    invalidate();
  }
  async function cancel() {
    const { error } = await supabase.rpc("cancel_stock_count", { _count: id });
    if (error) return toast.error(friendlyError(error));
    toast.success("הספירה בוטלה"); qc.invalidateQueries({ queryKey: ["stock-count", id] }); qc.invalidateQueries({ queryKey: ["stock-counts"] });
  }

  return (
    <div>
      <Link to="/inventory" search={{ tab: "counts" }} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> ספירות</Link>
      <div className="panel mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><h1 className="text-xl font-semibold">ספירת מלאי · {branchName(c.branch_id)}</h1><StatusBadge tone={COUNT_STATUS[c.status]?.tone}>{COUNT_STATUS[c.status]?.label}</StatusBadge></div>
            <p className="mt-1 text-sm text-muted-foreground">נפתחה <span className="num">{fmtDateTime(c.opened_at)}</span> ע״י {memberName(c.opened_by)}{c.note ? ` · ${c.note}` : ""}
              {c.approved_at && <> · אושרה <span className="num">{fmtDateTime(c.approved_at)}</span> ע״י {memberName(c.approved_by)}</>}</p>
          </div>
          {open && isManager && <div className="flex gap-2">
            <Button disabled={busy || !counted.length} onClick={approve}><Check className="size-4" /> אישור ועדכון מלאי</Button>
            <Button variant="outline" onClick={cancel}><X className="size-4" /> ביטול ספירה</Button>
          </div>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><div className="text-xs text-muted-foreground">מוצרים בספירה</div><div className="num text-lg font-semibold">{lines.length}</div></div>
          <div><div className="text-xs text-muted-foreground">נספרו</div><div className="num text-lg font-semibold">{counted.length}</div></div>
          <div><div className="text-xs text-muted-foreground">לא נספרו</div><div className="num text-lg font-semibold">{lines.length - counted.length}</div></div>
          <div><div className="text-xs text-muted-foreground">פערים{open && missingReason.length ? ` (${missingReason.length} ללא סיבה)` : ""}</div><div className={"num text-lg font-semibold " + (gaps.length ? "text-warning" : "")}>{gaps.length}</div></div>
        </div>
        {open && <p className="mt-3 text-xs text-muted-foreground">הזן את הכמות שנמצאה על המדף. היתרה במערכת לא משתנה עד האישור. מכירות וקליטות שבוצעו במהלך הספירה יתווספו אוטומטית לכמות שנספרה בעת האישור. מוצר שלא נספר לא יעודכן.</p>}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterChips value={filter} onChange={setFilter} options={[{ value: "all", label: "הכול", count: lines.length }, { value: "uncounted", label: "לא נספרו", count: lines.length - counted.length }, { value: "gaps", label: "פערים", count: gaps.length }]} />
        <Input className="w-56" placeholder="חיפוש מוצר" value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      <div className="panel overflow-x-auto">
        {!rows.length ? <EmptyState title="אין מוצרים להצגה" /> : (
          <table className="data-table">
            <thead><tr><th>מוצר</th><th className="text-end">במערכת בפתיחה</th><th>נספר</th><th className="text-end">פער</th><th>סיבת פער</th></tr></thead>
            <tbody>{rows.map((l) => {
              const gap = countGap(l);
              return (
                <tr key={l.id}>
                  <td className="font-medium">{l.inventory_products?.name}<span className="num block text-xs text-muted-foreground">{l.inventory_products?.sku}</span></td>
                  <td className="num text-end">{fmtNum(l.system_qty)}</td>
                  <td>{open ? <Input type="number" min={0} className="num h-8 w-24" defaultValue={l.counted_qty ?? ""} aria-label={`כמות שנספרה ${l.inventory_products?.name}`}
                    onBlur={(e) => { const v = e.target.value; if (v !== (l.counted_qty?.toString() ?? "")) save(l.id, v, l.reason); }} />
                    : l.counted_qty == null ? <span className="text-muted-foreground">לא נספר</span> : <span className="num">{fmtNum(l.counted_qty)}</span>}</td>
                  <td className={"num text-end " + (gap ? "font-medium text-warning" : "")}>{gap == null ? "—" : gap > 0 ? `+${fmtNum(gap)}` : fmtNum(gap)}</td>
                  <td>{open && gap ? <Input className="h-8 w-48" defaultValue={l.reason ?? ""} placeholder="חובה לפער" aria-invalid={!l.reason}
                    onBlur={(e) => { if (e.target.value !== (l.reason ?? "")) save(l.id, l.counted_qty?.toString() ?? "", e.target.value); }} />
                    : <span className="text-muted-foreground">{l.reason ?? ""}</span>}</td>
                </tr>);
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
