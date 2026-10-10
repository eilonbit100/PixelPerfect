import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownUp, FileSpreadsheet, FileText, FileDown, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { ROLE } from "@/lib/format";
import { RANGES, fmtCell, rangeDates, type Col, type RangeKey } from "@/lib/reports";
import { exportReport } from "@/lib/reports.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type Filters = { range: RangeKey; from: string; to: string; branches: string[] };

export function defaultFilters(range: RangeKey = "month"): Filters {
  return { range, ...rangeDates(range), branches: [] };
}

export function FilterBar({ value, onChange, dateNote }: { value: Filters; onChange: (f: Filters) => void; dateNote?: string }) {
  const { branches } = useOrg();
  const toggle = (id: string) => onChange({ ...value, branches: value.branches.includes(id) ? value.branches.filter((x) => x !== id) : [...value.branches, id] });
  return (
    <div className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="me-1 text-xs font-medium text-muted-foreground">תקופה</span>
        {RANGES.map((r) => (
          <button key={r.value} type="button" onClick={() => onChange({ ...value, range: r.value, ...(r.value === "custom" ? {} : rangeDates(r.value)) })}
            className={cn("rounded-md border px-2.5 py-1 text-xs", value.range === r.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{r.label}</button>
        ))}
        <div className="flex items-center gap-1.5 ms-2">
          <Input type="date" className="h-8 w-36" value={value.from} onChange={(e) => onChange({ ...value, range: "custom", from: e.target.value })} />
          <span className="text-xs text-muted-foreground">עד</span>
          <Input type="date" className="h-8 w-36" value={value.to} onChange={(e) => onChange({ ...value, range: "custom", to: e.target.value })} />
        </div>
      </div>
      {branches.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="me-1 text-xs font-medium text-muted-foreground">סניפים</span>
          <button type="button" onClick={() => onChange({ ...value, branches: [] })}
            className={cn("rounded-md border px-2.5 py-1 text-xs", !value.branches.length ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>כל הסניפים שלי</button>
          {branches.map((b) => (
            <button key={b.id} type="button" onClick={() => toggle(b.id)}
              className={cn("rounded-md border px-2.5 py-1 text-xs", value.branches.includes(b.id) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{b.name}</button>
          ))}
        </div>
      )}
      {dateNote && <p className="text-xs text-muted-foreground">משמעות התאריכים: {dateNote}</p>}
    </div>
  );
}

export function DataTable({ cols, rows, link }: { cols: Col[]; rows: Record<string, unknown>[]; link?: "customer" | "lead" }) {
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(200);
  const list = useMemo(() => {
    let r = rows;
    if (q.trim()) { const s = q.trim().toLowerCase(); r = r.filter((x) => cols.some((c) => fmtCell(x[c.key], c).toLowerCase().includes(s))); }
    if (sort) r = [...r].sort((a, b) => {
      const x = a[sort.k], y = b[sort.k];
      if (x == null) return 1; if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "he")) * sort.dir;
    });
    return r;
  }, [rows, q, sort, cols]);
  const idKey = link === "lead" ? "lead_id" : "customer_id";
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="סינון בתוך התוצאות" className="h-8 w-56" />
        <span className="num text-xs text-muted-foreground">{list.length} שורות</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr>{cols.map((c) => (
            <th key={c.key}>
              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => s?.k === c.key ? { k: c.key, dir: s.dir === 1 ? -1 : 1 } : { k: c.key, dir: 1 })}>
                {c.label}<ArrowDownUp className={cn("size-3", sort?.k === c.key ? "opacity-100" : "opacity-30")} />
              </button>
            </th>))}</tr></thead>
          <tbody>{list.slice(0, limit).map((r, i) => (
            <tr key={i}>{cols.map((c, ci) => {
              const v = fmtCell(r[c.key], c);
              const num = c.type === "money" || c.type === "number" || c.type === "percent" || c.type === "date" || c.type === "datetime" || c.key === "phone";
              const id = r[idKey] as string | undefined;
              return (
                <td key={c.key} className={num ? "num" : ""} dir={c.key === "phone" ? "ltr" : undefined} style={c.key === "phone" ? { textAlign: "right" } : undefined}>
                  {ci === 0 && id && link === "customer" ? <Link to="/customers/$id" params={{ id }} className="font-medium hover:underline">{v || "—"}</Link>
                    : ci === 0 && id && link === "lead" ? <Link to="/leads/$id" params={{ id }} className="font-medium hover:underline">{v || "—"}</Link>
                    : v || <span className="text-muted-foreground">—</span>}
                </td>
              );
            })}</tr>))}</tbody>
        </table>
      </div>
      {list.length > limit && <div className="border-t p-2 text-center"><Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 500)}>הצג עוד</Button></div>}
    </div>
  );
}

type ExportArgs = { key?: string; source?: string; columns?: string[]; status?: string; title?: string; filters: Filters };

export function ExportBar({ args, disabled }: { args: ExportArgs; disabled?: boolean }) {
  const { org } = useOrg();
  const run = useServerFn(exportReport);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function go(format: "xlsx" | "csv" | "pdf") {
    const w = format === "pdf" ? window.open("", "_blank") : null;
    setBusy(format);
    try {
      const r = await run({ data: { orgId: org.id, key: args.key, source: args.source, columns: args.columns, status: args.status, title: args.title,
        from: args.filters.from, to: args.filters.to, branches: args.filters.branches, format } });
      if (format === "pdf" && r.html && w) { w.document.open(); w.document.write(r.html); w.document.close(); }
      else if (r.url) window.location.href = r.url;
      toast.success(`הדוח הופק (${r.rows} שורות)`);
      qc.invalidateQueries({ queryKey: ["report-runs"] });
    } catch (e) {
      w?.close();
      toast.error(e instanceof Error ? e.message : "ההפקה נכשלה");
    } finally { setBusy(null); }
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant="outline" disabled={disabled || !!busy} onClick={() => go("xlsx")}><FileSpreadsheet className="size-4" /> {busy === "xlsx" ? "מפיק…" : "Excel"}</Button>
      <Button size="sm" variant="outline" disabled={disabled || !!busy} onClick={() => go("csv")}><FileDown className="size-4" /> {busy === "csv" ? "מפיק…" : "CSV"}</Button>
      <Button size="sm" variant="outline" disabled={disabled || !!busy} onClick={() => go("pdf")}><FileText className="size-4" /> {busy === "pdf" ? "מפיק…" : "PDF"}</Button>
    </div>
  );
}

export function SaveTemplateButton({ reportKey, config, defaultName, canShare }: { reportKey: string | null; config: Record<string, unknown>; defaultName: string; canShare: boolean }) {
  const { org, me } = useOrg();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [desc, setDesc] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  async function save() {
    if (!name.trim()) return toast.error("יש לתת שם לתבנית");
    const { error } = await supabase.from("saved_reports").insert({ organization_id: org.id, owner_member_id: me.id, name: name.trim(), description: desc || null, report_key: reportKey, config: config as never, shared_roles: roles });
    if (error) return toast.error("השמירה נכשלה");
    toast.success("התבנית נשמרה בדוחות שמורים");
    qc.invalidateQueries({ queryKey: ["saved-reports"] });
    setOpen(false);
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Save className="size-4" /> שמור כתבנית</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>שמירת תבנית דוח</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>שם</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>תיאור</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
            {canShare && (
              <div className="space-y-1.5"><Label>שיתוף עם</Label>
                <div className="flex gap-4">{Object.entries(ROLE).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-1.5 text-sm"><Checkbox checked={roles.includes(k)} onCheckedChange={(c) => setRoles((r) => c ? [...r, k] : r.filter((x) => x !== k))} />{l}</label>
                ))}</div>
                <p className="text-xs text-muted-foreground">התבנית נשמרת בלי נתונים. כל מי שפותח אותה רואה רק את מה שמותר לו.</p>
              </div>
            )}
          </div>
          <DialogFooter><Button onClick={save}>שמור</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
