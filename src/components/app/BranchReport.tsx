import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, FileSpreadsheet, FileText, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { DETAILS, KPIS, MOVEMENT, bmWarnings, fmtKpi, pctChange, type BmResult, type DetailKey } from "@/lib/branch-report";
import { exportBranchReport } from "@/lib/reports.functions";
import { DataTable, FilterBar, type Filters } from "@/components/app/ReportView";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Change({ cur, prev, invert }: { cur: number | null | undefined; prev: number | null | undefined; invert?: boolean }) {
  const p = pctChange(cur, prev);
  if (p == null) return <span className="text-xs text-muted-foreground">אין בסיס להשוואה</span>;
  const good = invert ? p < 0 : p > 0;
  const Icon = p === 0 ? Minus : p > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", p === 0 ? "text-muted-foreground" : good ? "text-ok" : "text-critical")}><Icon className="size-3.5" />{p > 0 ? "+" : ""}{p}%</span>;
}

const INVERT = new Set(["debt", "cancelled", "req_total", "leavers", "transfers_out"]);

export function BranchReport({ f, setF, canExport }: { f: Filters; setF: (f: Filters) => void; canExport: boolean }) {
  const { org } = useOrg();
  const [tab, setTab] = useState<DetailKey>("sales");
  const q = useQuery({
    queryKey: ["branch-report", org.id, f.from, f.to, f.branches.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("branch_management_report", { _org: org.id, _from: f.from, _to: f.to, _branches: f.branches });
      if (error) throw error;
      return data as unknown as BmResult;
    },
  });
  const r = q.data;
  const open = (d?: DetailKey) => { if (!d) return; setTab(d); document.getElementById("bm-details")?.scrollIntoView({ behavior: "smooth" }); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><FilterBar value={f} onChange={setF} dateNote="מכירות לפי תאריך רכישה · הצטרפויות לפי תאריך התחלה · ביטולים לפי תאריך ביטול בפועל · פעילים נכון לסוף התקופה" /></div>
        {canExport && <ExportButtons f={f} disabled={!r} />}
      </div>
      {q.isLoading ? <div className="panel"><TableSkeleton /></div>
        : q.error ? <div className="panel"><ErrorState onRetry={() => q.refetch()} /></div>
        : !r ? null : (
        <>
          <p className="text-xs text-muted-foreground">השוואה לתקופה הקודמת: {r.prev_from.split("-").reverse().join("/")} – {r.prev_to.split("-").reverse().join("/")}</p>
          {bmWarnings(r.current).map((w) => (
            <div key={w} className="flex items-center gap-2 rounded-md border border-attention/40 bg-attention/10 px-3 py-2 text-sm"><AlertTriangle className="size-4 text-attention" /><span className="font-medium">תשומת לב</span> · {w}</div>
          ))}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {KPIS.map((k) => (
              <button key={k.key} type="button" onClick={() => open(k.detail)} title={k.hint} className="panel p-3 text-start hover:bg-muted/50">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="num mt-1 text-xl font-semibold">{fmtKpi(r.current[k.key], k.type)}</div>
                {k.sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{k.sub(r.current)}</div>}
                <div className="mt-1 flex items-center justify-between gap-2">
                  {k.type === "percent" ? <span className="text-xs text-muted-foreground">קודם: {fmtKpi(r.previous[k.key], k.type)}</span>
                    : <><span className="num text-xs text-muted-foreground">קודם: {fmtKpi(r.previous[k.key], k.type)}</span><Change cur={r.current[k.key]} prev={r.previous[k.key]} invert={INVERT.has(k.key)} /></>}
                </div>
              </button>
            ))}
          </div>
          <div className="panel overflow-x-auto">
            <div className="border-b px-4 py-2.5 text-sm font-medium">תנועת מנויים</div>
            <table className="data-table">
              <thead><tr><th>מדד</th><th>תקופה נוכחית</th><th>תקופה קודמת</th><th>שינוי</th></tr></thead>
              <tbody>{MOVEMENT.map((m) => (
                <tr key={m.key}><td>{m.label}</td><td className="num">{fmtKpi(r.current[m.key])}</td><td className="num">{fmtKpi(r.previous[m.key])}</td><td><Change cur={r.current[m.key]} prev={r.previous[m.key]} invert={INVERT.has(m.key)} /></td></tr>
              ))}</tbody>
            </table>
            <p className="px-4 py-2 text-xs text-muted-foreground">שינוי נטו = הצטרפויות − עזיבות. חידושים, הקפאות ומעברים בין סניפים אינם נספרים בשינוי הנטו. מעבר בין סניפים מזוהה לפי רצף המנויים של הלקוח.</p>
          </div>
          {r.by_branch && r.by_branch.length > 1 && (
            <div className="panel overflow-x-auto">
              <div className="border-b px-4 py-2.5 text-sm font-medium">השוואה בין סניפים</div>
              <table className="data-table">
                <thead><tr><th>סניף</th>{KPIS.map((k) => <th key={k.key}>{k.label}</th>)}</tr></thead>
                <tbody>{r.by_branch.map((b) => (
                  <tr key={b.branch_id}><td className="font-medium">{b.branch}</td>{KPIS.map((k) => <td key={k.key} className="num">{fmtKpi(b[k.key] as number, k.type)}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div id="bm-details" className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="tablist">
              {DETAILS.map((d) => (
                <button key={d.key} type="button" role="tab" aria-selected={tab === d.key} onClick={() => setTab(d.key)}
                  className={cn("rounded-md border px-2.5 py-1 text-xs", tab === d.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  {d.label} <span className="num opacity-70">{r.details[d.key]?.length ?? 0}</span>
                </button>
              ))}
            </div>
            {(() => { const d = DETAILS.find((x) => x.key === tab)!; const rows = r.details[tab] ?? [];
              return rows.length ? <DataTable key={tab} cols={d.cols} rows={rows} link="customer" /> : <div className="panel"><EmptyState title={`אין ${d.label} בתקופה שנבחרה`} /></div>; })()}
          </div>
        </>
      )}
    </div>
  );
}

function ExportButtons({ f, disabled }: { f: Filters; disabled: boolean }) {
  const { org } = useOrg();
  const run = useServerFn(exportBranchReport);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function go(format: "xlsx" | "pdf") {
    const w = format === "pdf" ? window.open("", "_blank") : null;
    setBusy(format);
    try {
      const r = await run({ data: { orgId: org.id, from: f.from, to: f.to, branches: f.branches, format } });
      if (format === "pdf" && r.html && w) { w.document.open(); w.document.write(r.html); w.document.close(); }
      else if (r.url) window.location.href = r.url;
      toast.success("הדוח הופק");
      qc.invalidateQueries({ queryKey: ["report-runs"] });
    } catch (e) { w?.close(); toast.error(e instanceof Error ? e.message : "ההפקה נכשלה"); } finally { setBusy(null); }
  }
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="outline" disabled={disabled || !!busy} onClick={() => go("xlsx")}><FileSpreadsheet className="size-4" /> {busy === "xlsx" ? "מפיק…" : "Excel"}</Button>
      <Button size="sm" variant="outline" disabled={disabled || !!busy} onClick={() => go("pdf")}><FileText className="size-4" /> {busy === "pdf" ? "מפיק…" : "PDF"}</Button>
    </div>
  );
}
