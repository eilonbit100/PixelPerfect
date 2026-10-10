import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { SOURCES, useReportPerms } from "@/lib/reports";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { DataTable, ExportBar, FilterBar, SaveTemplateButton, defaultFilters, type Filters } from "@/components/app/ReportView";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Search = { source?: string; cols?: string; status?: string; from?: string; to?: string; b?: string; saved?: string };

export const Route = createFileRoute("/_authenticated/_shell/reports/builder")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const g = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : undefined);
    return { source: g("source"), cols: g("cols"), status: g("status"), from: g("from"), to: g("to"), b: g("b"), saved: g("saved") };
  },
  head: () => ({ meta: [
    { title: "יצירת דוח חדש — Pulse" },
    { name: "description", content: "בניית דוח מותאם ממקורות ושדות מאושרים, עם תצוגה מקדימה, ייצוא ושמירה." },
    { property: "og:title", content: "יצירת דוח חדש — Pulse" },
    { property: "og:description", content: "בניית דוח מותאם ממקורות ושדות מאושרים, עם תצוגה מקדימה, ייצוא ושמירה." },
  ] }),
  component: Builder,
});

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium"><span className="num flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>{title}</div>
      {children}
    </section>
  );
}

function Builder() {
  const s = Route.useSearch();
  const { org } = useOrg();
  const perms = useReportPerms();
  const canFin = !!perms.data?.receipts?.view;
  const sources = SOURCES.filter((x) => !x.financial || canFin);
  const [source, setSource] = useState(s.source && sources.some((x) => x.key === s.source) ? s.source : "");
  const src = sources.find((x) => x.key === source);
  const [cols, setCols] = useState<string[]>(s.cols ? s.cols.split(",") : []);
  const [status, setStatus] = useState(s.status ?? "");
  const base = defaultFilters(s.from ? "custom" : "month");
  const [f, setF] = useState<Filters>({ ...base, from: s.from ?? base.from, to: s.to ?? base.to, branches: s.b ? s.b.split(",") : [] });
  const [run, setRun] = useState(0);
  const picked = src ? src.cols.filter((c) => cols.includes(c.key)) : [];

  const q = useQuery({
    queryKey: ["custom-report", org.id, source, cols.join(","), status, f.from, f.to, f.branches.join(","), run],
    enabled: run > 0 && !!src && cols.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("run_custom_report", { _org: org.id, _source: source, _columns: picked.map((c) => c.key), _from: f.from, _to: f.to, _branches: f.branches, _status: status });
      if (error) throw error;
      return data as { rows: Record<string, unknown>[] };
    },
  });

  const back = <Link to="/reports" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> לספריית הדוחות</Link>;
  if (perms.isLoading) return <>{back}<TableSkeleton /></>;
  if (!perms.data?._builder?.view) return <>{back}<EmptyState icon={<Lock className="size-5" />} title="אין לך הרשאה ליצור דוחות" /></>;

  return (
    <div className="space-y-4">
      {back}
      <PageHeader title="יצירת דוח חדש" subtitle="רק מקורות ושדות מאושרים, ורק הנתונים שמותר לך לראות" />
      <Step n={1} title="מקור מידע">
        <div className="flex flex-wrap gap-1.5">
          {sources.map((x) => (
            <button key={x.key} type="button" onClick={() => { setSource(x.key); setCols(x.cols.slice(0, 4).map((c) => c.key)); setStatus(""); setRun(0); }}
              className={cn("rounded-md border px-3 py-1.5 text-sm", source === x.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{x.label}</button>
          ))}
        </div>
      </Step>
      {src && <>
        <Step n={2} title="עמודות">
          <div className="flex flex-wrap gap-4">{src.cols.map((c) => (
            <label key={c.key} className="flex items-center gap-1.5 text-sm"><Checkbox checked={cols.includes(c.key)} onCheckedChange={(v) => setCols((p) => v ? [...p, c.key] : p.filter((x) => x !== c.key))} />{c.label}</label>
          ))}</div>
        </Step>
        <Step n={3} title="מסננים">
          <div className="space-y-3">
            <FilterBar value={f} onChange={setF} />
            {src.status && (
              <div className="flex items-center gap-2 text-sm"><span className="text-xs font-medium text-muted-foreground">סטטוס</span>
                <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">הכל</SelectItem>{Object.entries(src.status).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
        </Step>
        <Step n={4} title="תצוגה מקדימה">
          <Button disabled={!cols.length} onClick={() => setRun((r) => r + 1)}>הצג תצוגה מקדימה</Button>
          {!cols.length && <span className="ms-3 text-xs text-muted-foreground">בחר לפחות עמודה אחת</span>}
        </Step>
        {run > 0 && (
          q.isLoading ? <div className="panel"><TableSkeleton /></div>
          : q.error ? <div className="panel"><ErrorState onRetry={() => q.refetch()} /></div>
          : !q.data?.rows.length ? <div className="panel"><EmptyState title="אין נתונים בהגדרות שנבחרו" /></div>
          : <>
              <DataTable cols={picked} rows={q.data.rows} />
              <Step n={5} title="שמירה או ייצוא">
                <div className="flex flex-wrap items-center gap-2">
                  <ExportBar args={{ source, columns: picked.map((c) => c.key), status, title: `דוח ${src.label}`, filters: f }} />
                  <SaveTemplateButton reportKey={null} config={{ source, columns: picked.map((c) => c.key), status, branches: f.branches }} defaultName={`דוח ${src.label}`} canShare={!!perms.data?._share?.view} />
                </div>
              </Step>
            </>
        )}
      </>}
    </div>
  );
}
