import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { ROLE } from "@/lib/format";
import { REPORTS, type Perm } from "@/lib/reports";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_shell/settings/report-permissions")({
  head: () => ({ meta: [
    { title: "הרשאות דוחות — Pulse" },
    { name: "description", content: "מי רואה איזה דוח, מי מייצא, ומי רואה רק את הנתונים שלו." },
    { property: "og:title", content: "הרשאות דוחות — Pulse" },
    { property: "og:description", content: "מי רואה איזה דוח, מי מייצא, ומי רואה רק את הנתונים שלו." },
  ] }),
  component: ReportPermissions,
});

const EXTRA = [{ key: "_builder", name: "יצירת דוח חדש ושמירה" }, { key: "_share", name: "שיתוף תבניות" }];
const ITEMS = [...REPORTS.map((r) => ({ key: r.key, name: `${r.number ? r.number + " · " : ""}${r.name}`, fin: !!r.financial })), ...EXTRA.map((e) => ({ ...e, fin: false }))];
const EMP_VIEW = ["purchases", "active", "lead_followup", "leads_no_task", "duplicate_leads", "checkins", "class_attendance", "treatments", "lead_conversion", "tasks_done"];

/** Mirrors report_perm() defaults in the database */
function roleDefault(role: string, key: string): Perm {
  if (role !== "EMPLOYEE") return { view: true, export: true, own: false };
  if (EMP_VIEW.includes(key)) return { view: true, export: true, own: key === "lead_conversion" || key === "tasks_done" };
  return { view: false, export: false, own: false };
}

function ReportPermissions() {
  const { org, isAdmin, members } = useOrg();
  const qc = useQueryClient();
  const [target, setTarget] = useState<string>("role:EMPLOYEE");
  const q = useQuery({
    queryKey: ["report-permissions", org.id],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("report_permissions").select("*").eq("organization_id", org.id);
      if (error) throw error;
      return data;
    },
  });
  if (!isAdmin) return <EmptyState title="רק משתמש מטה יכול לנהל הרשאות דוחות" />;
  if (q.isLoading) return <TableSkeleton />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;

  const [kind, id] = target.split(":");
  const member = kind === "member" ? members.find((m) => m.id === id) : undefined;
  const role = kind === "role" ? id : member?.role ?? "EMPLOYEE";
  const rows = q.data ?? [];
  const effective = (key: string): { p: Perm; source: "personal" | "role" | "default" } => {
    if (member) { const r = rows.find((x) => x.member_id === member.id && x.report_key === key); if (r) return { p: { view: r.can_view, export: r.can_export, own: r.own_only }, source: "personal" }; }
    const r = rows.find((x) => x.role === role && x.report_key === key);
    if (r) return { p: { view: r.can_view, export: r.can_export, own: r.own_only }, source: "role" };
    return { p: roleDefault(role, key), source: "default" };
  };
  async function set(key: string, next: Perm) {
    const del = supabase.from("report_permissions").delete().eq("organization_id", org.id).eq("report_key", key);
    const { error: e1 } = await (member ? del.eq("member_id", member.id) : del.eq("role", role));
    if (e1) return toast.error("השמירה נכשלה");
    const { error } = await supabase.from("report_permissions").insert({ organization_id: org.id, report_key: key, role: member ? null : role, member_id: member?.id ?? null,
      can_view: next.view, can_export: next.view && next.export, own_only: next.own });
    if (error) return toast.error("השמירה נכשלה");
    qc.invalidateQueries({ queryKey: ["report-permissions"] }); qc.invalidateQueries({ queryKey: ["report-perms"] });
  }
  async function resetPersonal(key: string) {
    if (!member) return;
    await supabase.from("report_permissions").delete().eq("organization_id", org.id).eq("member_id", member.id).eq("report_key", key);
    qc.invalidateQueries({ queryKey: ["report-permissions"] }); qc.invalidateQueries({ queryKey: ["report-perms"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">הרשאות עבור</span>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(ROLE).map(([k, l]) => <SelectItem key={k} value={`role:${k}`}>תפקיד: {l}</SelectItem>)}
            {members.filter((m) => m.status !== "REMOVED").map((m) => <SelectItem key={m.id} value={`member:${m.id}`}>חריגה אישית: {m.display_name ?? m.username} ({ROLE[m.role]})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">ההרשאות נאכפות בשרת. מנהל סניף רואה תמיד רק את הסניפים שלו. ״נתונים אישיים בלבד״ מציג לעובד רק את הרשומות המשויכות אליו.</p>
      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>דוח</th><th>צפייה</th><th>ייצוא</th><th>נתונים אישיים בלבד</th><th>מקור</th><th /></tr></thead>
          <tbody>{ITEMS.map((it) => {
            const { p, source } = effective(it.key);
            return (
              <tr key={it.key}>
                <td className="font-medium">{it.name}{it.fin && <span className="ms-2 text-xs text-muted-foreground">· מידע כספי</span>}</td>
                <td><Checkbox checked={p.view} onCheckedChange={(v) => set(it.key, { ...p, view: !!v })} /></td>
                <td><Checkbox checked={p.export} disabled={!p.view || it.key.startsWith("_")} onCheckedChange={(v) => set(it.key, { ...p, export: !!v })} /></td>
                <td><Checkbox checked={p.own} disabled={!p.view || it.key.startsWith("_")} onCheckedChange={(v) => set(it.key, { ...p, own: !!v })} /></td>
                <td className="text-xs text-muted-foreground">{source === "personal" ? "חריגה אישית" : source === "role" ? "הוגדר לתפקיד" : "ברירת מחדל"}</td>
                <td>{source === "personal" && <Button size="sm" variant="ghost" onClick={() => resetPersonal(it.key)}>בטל חריגה</Button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
