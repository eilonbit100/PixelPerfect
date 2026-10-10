import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Lock, DatabaseZap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { reportByKey, useReportPerms, type RangeKey } from "@/lib/reports";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { DataTable, ExportBar, FilterBar, SaveTemplateButton, defaultFilters, type Filters } from "@/components/app/ReportView";

type Search = { range?: RangeKey; from?: string; to?: string; b?: string };

export const Route = createFileRoute("/_authenticated/_shell/reports/$key")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    range: typeof s.range === "string" ? (s.range as RangeKey) : undefined,
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
    b: typeof s.b === "string" ? s.b : undefined,
  }),
  head: () => ({ meta: [
    { title: "הפקת דוח — Pulse" },
    { name: "description", content: "בחירת תקופה וסניף, תצוגה מקדימה וייצוא ל-Excel, CSV או PDF." },
    { property: "og:title", content: "הפקת דוח — Pulse" },
    { property: "og:description", content: "בחירת תקופה וסניף, תצוגה מקדימה וייצוא ל-Excel, CSV או PDF." },
  ] }),
  component: ReportPage,
});

function ReportPage() {
  const { key } = Route.useParams();
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { org } = useOrg();
  const def = reportByKey(key);
  const perms = useReportPerms();
  const base = defaultFilters(s.range ?? "month");
  const f: Filters = { range: s.range ?? "month", from: s.from ?? base.from, to: s.to ?? base.to, branches: s.b ? s.b.split(",").filter(Boolean) : [] };
  const setF = (n: Filters) => navigate({ search: { range: n.range, from: n.from, to: n.to, b: n.branches.join(",") || undefined }, replace: true });
  const p = perms.data?.[key];

  const q = useQuery({
    queryKey: ["report", org.id, key, f.from, f.to, f.branches.join(",")],
    enabled: !!def && !!p?.view && !def.unavailable,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("run_report", { _org: org.id, _key: key, _from: f.from, _to: f.to, _branches: f.branches });
      if (error) throw error;
      return data as { rows: Record<string, unknown>[]; own?: boolean };
    },
  });

  const back = <Link to="/reports" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> לספריית הדוחות</Link>;
  if (!def) return <>{back}<EmptyState title="הדוח לא נמצא" /></>;
  if (perms.isLoading) return <>{back}<TableSkeleton /></>;
  if (!p?.view) return <>{back}<EmptyState icon={<Lock className="size-5" />} title="אין לך הרשאה לדוח זה" text="אפשר לבקש גישה ממשתמש מטה." /></>;

  return (
    <div className="space-y-4">
      <div>
        {back}
        <PageHeader
          title={`${def.number ? def.number + " · " : ""}${def.name}`}
          subtitle={<>{def.desc}{q.data?.own && <span className="ms-2 text-xs text-attention">· מוצגים רק הנתונים שלך</span>}</>}
          actions={!def.unavailable && <div className="flex flex-wrap items-center gap-2">
            <SaveTemplateButton reportKey={key} config={{ range: f.range, from: f.from, to: f.to, branches: f.branches }} defaultName={def.name} canShare={!!perms.data?._share?.view} />
            {p.export && <ExportBar args={{ key, filters: f }} disabled={!q.data} />}
          </div>}
        />
      </div>
      {def.unavailable ? (
        <div className="panel"><EmptyState icon={<DatabaseZap className="size-5" />} title="נתונים אינם זמינים" text={def.unavailable} /></div>
      ) : (
        <>
          <FilterBar value={f} onChange={setF} dateNote={def.dateMeaning} />
          {def.note && <p className="text-xs text-muted-foreground">{def.note}</p>}
          {q.isLoading ? <div className="panel"><TableSkeleton /></div>
            : q.error ? <div className="panel"><ErrorState onRetry={() => q.refetch()} /></div>
            : !q.data?.rows.length ? <div className="panel"><EmptyState title="אין נתונים בתקופה שנבחרה" text="נסה טווח תאריכים אחר או סניף אחר." /></div>
            : <DataTable cols={def.cols} rows={q.data.rows} link={def.link} />}
        </>
      )}
    </div>
  );
}
