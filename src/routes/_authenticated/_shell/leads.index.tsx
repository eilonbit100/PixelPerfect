import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInsights } from "@/lib/queries";
import { RULES, healthLabel, worst, type Insight } from "@/lib/rules";
import { LEAD_SOURCE, LEAD_STATUS, fmtDate, fmtRelative } from "@/lib/format";
import { SeverityBadge, StatusBadge, leadStatusTone } from "@/components/app/badges";
import { EmptyState, ErrorState, FilterChips, PageHeader, TableSkeleton } from "@/components/app/states";
import { LeadDialog } from "@/components/app/LeadDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Search = { filter?: string; rule?: string; source?: string; owner?: string; status?: string };

export const Route = createFileRoute("/_authenticated/_shell/leads/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    filter: typeof s.filter === "string" ? s.filter : undefined,
    rule: typeof s.rule === "string" ? s.rule : undefined,
    source: typeof s.source === "string" ? s.source : undefined,
    owner: typeof s.owner === "string" ? s.owner : undefined,
    status: typeof s.status === "string" ? s.status : undefined,
  }),
  head: () => ({
    meta: [
      { title: "לידים — Pulse" },
      { name: "description", content: "ניהול לידים עם תקינות מעקב בזמן אמת." },
      { property: "og:title", content: "לידים — Pulse" },
      { property: "og:description", content: "ניהול לידים עם תקינות מעקב בזמן אמת." },
    ],
  }),
  component: LeadsPage,
});

const OPEN = ["NEW", "CONTACT_ATTEMPT", "FOLLOW_UP", "TRIAL"];

function LeadsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/leads/" });
  const { org, branchId, me, memberName, members } = useOrg();
  const insights = useInsights();
  const [adv, setAdv] = useState(!!(search.source || search.owner || search.status));
  const filter = search.filter ?? "all";

  const leads = useQuery({
    queryKey: ["leads", org.id, branchId],
    queryFn: async () => {
      let q = supabase.from("leads").select("*").eq("organization_id", org.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(1000);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const tasks = useQuery({
    queryKey: ["lead-tasks", org.id, branchId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("id,entity_id,due_at").eq("organization_id", org.id).eq("entity_type", "lead")
        .in("status", ["OPEN", "IN_PROGRESS"]).is("deleted_at", null).order("due_at").limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byLead = useMemo(() => {
    const m = new Map<string, Insight[]>();
    (insights.data ?? []).filter((i) => i.entity_type === "lead").forEach((i) => m.set(i.entity_id, [...(m.get(i.entity_id) ?? []), i]));
    return m;
  }, [insights.data]);
  const nextTask = useMemo(() => {
    const m = new Map<string, { due_at: string; overdue: boolean }>();
    const now = Date.now();
    (tasks.data ?? []).forEach((t) => {
      if (!t.entity_id) return;
      const cur = m.get(t.entity_id);
      const overdue = new Date(t.due_at).getTime() < now;
      if (!cur || (cur.overdue && !overdue)) m.set(t.entity_id, { due_at: t.due_at, overdue });
    });
    return m;
  }, [tasks.data]);

  const rows = useMemo(() => {
    let list = leads.data ?? [];
    if (search.rule) list = list.filter((l) => byLead.get(l.id)?.some((i) => i.rule_key === search.rule));
    switch (filter) {
      case "mine": list = list.filter((l) => l.assigned_member_id === me.id); break;
      case "new": list = list.filter((l) => l.status === "NEW"); break;
      case "attention": list = list.filter((l) => byLead.has(l.id)); break;
      case "follow_up": list = list.filter((l) => l.status === "FOLLOW_UP"); break;
      case "overdue": list = list.filter((l) => nextTask.get(l.id)?.overdue); break;
      case "no_task": list = list.filter((l) => OPEN.includes(l.status) && !nextTask.has(l.id)); break;
      case "won": list = list.filter((l) => l.status === "WON"); break;
      case "lost": list = list.filter((l) => l.status === "LOST"); break;
    }
    if (search.source) list = list.filter((l) => l.source === search.source);
    if (search.owner) list = list.filter((l) => l.assigned_member_id === search.owner);
    if (search.status) list = list.filter((l) => l.status === search.status);
    return list;
  }, [leads.data, byLead, nextTask, filter, search, me.id]);

  const all = leads.data ?? [];
  const chips = [
    { value: "all", label: "כולם", count: all.length },
    { value: "mine", label: "שלי" },
    { value: "new", label: "חדשים" },
    { value: "attention", label: "דורשים טיפול", count: all.filter((l) => byLead.has(l.id)).length },
    { value: "follow_up", label: "מעקב" },
    { value: "overdue", label: "משימות באיחור" },
    { value: "no_task", label: "ללא משימה" },
    { value: "won", label: "נמכרו" },
    { value: "lost", label: "לא רלוונטיים" },
  ];
  const set = (patch: Partial<Search>) => navigate({ search: (p: Search) => ({ ...p, ...patch }) });

  return (
    <div>
      <PageHeader title="לידים" subtitle="סטטוס עסקי ותקינות תפעולית לכל ליד" actions={<LeadDialog trigger={<Button><Plus className="size-4" /> ליד חדש</Button>} />} />

      {search.rule && RULES[search.rule] && (
        <div className="mb-3 flex items-center gap-2 rounded-md border bg-accent px-3 py-2 text-sm text-accent-foreground">
          מציג רק רשומות עבור: <strong>{RULES[search.rule].description}</strong>
          <button onClick={() => set({ rule: undefined })} className="ms-auto inline-flex items-center gap-1 text-xs hover:underline"><X className="size-3.5" /> נקה</button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterChips options={chips} value={filter} onChange={(v) => set({ filter: v === "all" ? undefined : v })} />
        <Button variant="ghost" size="sm" onClick={() => setAdv(!adv)}><SlidersHorizontal className="size-4" /> סינון מתקדם</Button>
      </div>
      {adv && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Select value={search.status ?? "any"} onValueChange={(v) => set({ status: v === "any" ? undefined : v })}>
            <SelectTrigger className="w-40"><SelectValue placeholder="סטטוס" /></SelectTrigger>
            <SelectContent><SelectItem value="any">כל הסטטוסים</SelectItem>{Object.entries(LEAD_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={search.source ?? "any"} onValueChange={(v) => set({ source: v === "any" ? undefined : v })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">כל המקורות</SelectItem>{Object.entries(LEAD_SOURCE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={search.owner ?? "any"} onValueChange={(v) => set({ owner: v === "any" ? undefined : v })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">כל העובדים</SelectItem>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      <div className="panel overflow-x-auto">
        {leads.isLoading || insights.isLoading ? <TableSkeleton cols={7} /> : leads.error ? <ErrorState onRetry={() => leads.refetch()} /> : !rows.length ? (
          all.length ? <EmptyState title="אין לידים שתואמים לסינון" text="נסה לבחור סינון אחר." />
            : <EmptyState title="אין עדיין לידים" text="ברגע שייכנס ליד חדש הוא יופיע כאן." action={<LeadDialog trigger={<Button>הוסף ליד</Button>} />} />
        ) : (
          <table className="data-table">
            <thead><tr><th>ליד</th><th>טלפון</th><th>מקור</th><th>סטטוס</th><th>עובד אחראי</th><th>טיפול אחרון</th><th>פעולה הבאה</th><th>תקינות</th><th>נוצר</th></tr></thead>
            <tbody>
              {rows.map((l) => {
                const iss = byLead.get(l.id) ?? [];
                const w = worst(iss);
                const nt = nextTask.get(l.id);
                return (
                  <tr key={l.id} className="cursor-pointer" onClick={() => navigate({ to: "/leads/$id", params: { id: l.id } })}>
                    <td className="font-medium"><Link to="/leads/$id" params={{ id: l.id }} onClick={(e) => e.stopPropagation()}>{l.full_name}</Link></td>
                    <td className="num text-muted-foreground">{l.phone ?? "—"}</td>
                    <td className="text-muted-foreground">{LEAD_SOURCE[l.source] ?? l.source}</td>
                    <td><StatusBadge tone={leadStatusTone(l.status)}>{LEAD_STATUS[l.status]}</StatusBadge></td>
                    <td>{memberName(l.assigned_member_id)}</td>
                    <td className="text-muted-foreground">{fmtRelative(l.last_activity_at)}</td>
                    <td className={nt?.overdue ? "text-critical" : ""}>{nt ? fmtRelative(nt.due_at, true) : "—"}</td>
                    <td>{w ? <SeverityBadge severity={w} label={healthLabel(iss.find((i) => i.severity === w)!)} /> : <SeverityBadge severity="OK" />}</td>
                    <td className="num text-muted-foreground">{fmtDate(l.created_at)}</td>
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
