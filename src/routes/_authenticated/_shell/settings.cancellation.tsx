import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { friendlyError } from "@/lib/errors";
import { NOTICE_LABEL } from "@/components/app/CustomerCard";
import { ErrorState, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_shell/settings/cancellation")({
  head: () => ({ meta: [
    { title: "מדיניות מנויים וביטולים — Pulse" }, { name: "description", content: "תקופת הודעה מוקדמת לביטול מנוי, ברמת ארגון, סניף או מסלול." },
    { property: "og:title", content: "מדיניות מנויים וביטולים — Pulse" }, { property: "og:description", content: "תקופת הודעה מוקדמת לביטול מנוי." },
  ] }),
  component: CancellationPolicy,
});

const PRESETS: Record<string, { unit: string; value: number; label: string }> = {
  IMMEDIATE: { unit: "IMMEDIATE", value: 0, label: "ביטול מיידי" },
  D14: { unit: "DAYS", value: 14, label: "14 ימים" },
  D30: { unit: "DAYS", value: 30, label: "30 ימים" },
  M1: { unit: "MONTHS", value: 1, label: "חודש קלנדרי אחד" },
  CUSTOM: { unit: "DAYS", value: 0, label: "תקופה מותאמת אישית" },
};
const presetOf = (u: string, v: number) => Object.entries(PRESETS).find(([k, p]) => k !== "CUSTOM" && p.unit === u && p.value === v)?.[0] ?? "CUSTOM";

type Row = { id: string; branch_id: string | null; membership_plan_id: string | null; notice_unit: string; notice_value: number; updated_at: string };

function PolicyEditor({ row, onSaved, canEdit }: { row: Row; onSaved: () => void; canEdit: boolean }) {
  const [unit, setUnit] = useState(row.notice_unit);
  const [value, setValue] = useState(row.notice_value);
  const [preset, setPreset] = useState(presetOf(row.notice_unit, row.notice_value));
  const dirty = unit !== row.notice_unit || value !== row.notice_value;
  async function save() {
    if (unit !== "IMMEDIATE" && (!value || value < 1)) return toast.error("יש להזין משך תקין");
    const { error } = await supabase.from("cancellation_policies").update({ notice_unit: unit, notice_value: unit === "IMMEDIATE" ? 0 : value, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) return toast.error(friendlyError(error));
    toast.success("המדיניות נשמרה — תחול על בקשות ביטול חדשות בלבד");
    onSaved();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select disabled={!canEdit} value={preset} onValueChange={(k) => { setPreset(k); if (k !== "CUSTOM") { setUnit(PRESETS[k].unit); setValue(PRESETS[k].value); } }}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(PRESETS).map(([k, p]) => <SelectItem key={k} value={k}>{p.label}</SelectItem>)}</SelectContent>
      </Select>
      {preset === "CUSTOM" && <>
        <Input disabled={!canEdit} type="number" min={1} max={365} className="w-20" value={value} onChange={(e) => setValue(Number(e.target.value))} />
        <Select disabled={!canEdit} value={unit === "IMMEDIATE" ? "DAYS" : unit} onValueChange={setUnit}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="DAYS">ימים</SelectItem><SelectItem value="MONTHS">חודשים</SelectItem></SelectContent>
        </Select>
      </>}
      {canEdit && dirty && <Button size="sm" onClick={save}>שמור</Button>}
    </div>
  );
}

function CancellationPolicy() {
  const { org, isAdmin, branches, branchName } = useOrg();
  const [scope, setScope] = useState("");
  const q = useQuery({
    queryKey: ["cancellation-policies", org.id],
    queryFn: async () => {
      const [p, plans] = await Promise.all([
        supabase.from("cancellation_policies").select("*").eq("organization_id", org.id),
        supabase.from("membership_plans").select("id,name").eq("organization_id", org.id).eq("active", true),
      ]);
      if (p.error) throw p.error;
      if (plans.error) throw plans.error;
      return { rows: p.data as Row[], plans: plans.data };
    },
  });
  if (q.isLoading) return <TableSkeleton rows={3} cols={2} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  const { rows, plans } = q.data!;
  const orgRow = rows.find((r) => !r.branch_id && !r.membership_plan_id);
  const overrides = rows.filter((r) => r !== orgRow);
  const used = new Set(overrides.map((r) => r.branch_id ?? r.membership_plan_id));
  const scopeName = (r: Row) => r.branch_id ? `סניף: ${branchName(r.branch_id)}` : `מסלול: ${plans.find((p) => p.id === r.membership_plan_id)?.name ?? "—"}`;

  async function addOverride() {
    if (!scope || !orgRow) return;
    const [kind, id] = scope.split(":");
    const { error } = await supabase.from("cancellation_policies").insert({
      organization_id: org.id, branch_id: kind === "b" ? id : null, membership_plan_id: kind === "p" ? id : null,
      notice_unit: orgRow.notice_unit, notice_value: orgRow.notice_value,
    });
    if (error) return toast.error(friendlyError(error));
    setScope("");
    q.refetch();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("cancellation_policies").delete().eq("id", id);
    if (error) return toast.error(friendlyError(error));
    q.refetch();
  }

  return (
    <div className="max-w-2xl space-y-4">
      {!isAdmin && <p className="text-sm text-muted-foreground">רק משתמשי מטה יכולים לשנות את מדיניות הביטולים.</p>}
      <div className="panel space-y-3 p-5">
        <div>
          <div className="font-medium">תקופת הודעה מוקדמת לביטול מנוי</div>
          <p className="text-sm text-muted-foreground">ברירת המחדל לכל הארגון. דוגמה: בקשה מ־10.10 עם חודש קלנדרי אחד ← בתוקף מ־10.11. אם היום אינו קיים בחודש הבא — היום האחרון בחודש.</p>
        </div>
        {orgRow ? <PolicyEditor key={orgRow.id + orgRow.updated_at} row={orgRow} onSaved={() => q.refetch()} canEdit={isAdmin} /> : <p className="text-sm text-critical">לא הוגדרה מדיניות ארגונית.</p>}
        <p className="text-xs text-muted-foreground">שינוי המדיניות חל על בקשות ביטול חדשות בלבד. בקשות קיימות שומרות את התאריך שחושב בעת פתיחתן.</p>
      </div>

      <div className="panel">
        <div className="border-b px-4 py-3"><div className="text-sm font-medium">דריסה לפי סניף או מסלול</div>
          <p className="text-xs text-muted-foreground">סדר עדיפות: מסלול ← סניף ← ארגון.</p></div>
        <ul className="divide-y">
          {overrides.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="font-medium">{scopeName(r)}</span>
              <div className="flex items-center gap-2">
                <PolicyEditor key={r.id + r.updated_at} row={r} onSaved={() => q.refetch()} canEdit={isAdmin} />
                {isAdmin && <Button size="icon" variant="ghost" onClick={() => remove(r.id)} aria-label="הסר דריסה"><Trash2 className="size-4" /></Button>}
              </div>
            </li>
          ))}
          {!overrides.length && <li className="px-4 py-3 text-sm text-muted-foreground">אין דריסות — כל המנויים פועלים לפי מדיניות הארגון ({NOTICE_LABEL(orgRow ? { unit: orgRow.notice_unit, value: orgRow.notice_value } : null)}).</li>}
        </ul>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 border-t p-3">
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-60"><SelectValue placeholder="בחר סניף או מסלול" /></SelectTrigger>
              <SelectContent>
                {branches.filter((b) => !used.has(b.id)).map((b) => <SelectItem key={b.id} value={`b:${b.id}`}>סניף: {b.name}</SelectItem>)}
                {plans.filter((p) => !used.has(p.id)).map((p) => <SelectItem key={p.id} value={`p:${p.id}`}>מסלול: {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={addOverride} disabled={!scope}><Plus className="size-4" /> הוסף דריסה</Button>
          </div>
        )}
      </div>
      <Label className="sr-only">מדיניות</Label>
    </div>
  );
}
