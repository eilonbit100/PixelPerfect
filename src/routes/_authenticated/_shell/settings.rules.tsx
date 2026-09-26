import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { RULES } from "@/lib/rules";
import { SeverityBadge } from "@/components/app/badges";
import { ErrorState, TableSkeleton } from "@/components/app/states";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Severity } from "@/lib/rules";

export const Route = createFileRoute("/_authenticated/_shell/settings/rules")({
  head: () => ({ meta: [{ title: "כללים עסקיים — Pulse" }, { name: "description", content: "הגדרת ספים וכללי זיהוי." }, { property: "og:title", content: "כללים עסקיים — Pulse" }, { property: "og:description", content: "הגדרת ספים וכללי זיהוי." }] }),
  component: RulesSettings,
});

const PARAM: Record<string, { label: string; key: string }> = {
  INACTIVE_LEAD: { label: "ימים ללא פעילות", key: "days" },
  NEAR_EXPIRY: { label: "ימי התראה לפני תוקף", key: "days" },
};

function RulesSettings() {
  const { org, isAdmin } = useOrg();
  const invalidate = useInvalidateAll();
  const q = useQuery({
    queryKey: ["rules", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rule_definitions").select("*").or(`organization_id.is.null,organization_id.eq.${org.id}`);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (q.isLoading) return <TableSkeleton rows={6} cols={4} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  const sys = q.data!.filter((r) => !r.organization_id && RULES[r.key]);
  const ov = (k: string) => q.data!.find((r) => r.organization_id === org.id && r.key === k);

  async function save(key: string, patch: { enabled?: boolean; configuration?: Record<string, unknown> }) {
    const base = sys.find((s) => s.key === key)!;
    const cur = ov(key);
    const row = {
      organization_id: org.id, key, name: base.name, entity_type: base.entity_type, default_severity: base.default_severity,
      enabled: patch.enabled ?? cur?.enabled ?? base.enabled,
      configuration: { ...((cur?.configuration as object) ?? {}), ...(patch.configuration ?? {}) },
    };
    const { error } = await supabase.from("rule_definitions").upsert(row as never, { onConflict: "organization_id,key" });
    if (error) return toast.error(friendlyError(error));
    toast.success("הכלל עודכן והבדיקה הורצה מחדש");
    invalidate();
  }

  return (
    <div className="panel overflow-x-auto">
      <table className="data-table">
        <thead><tr><th>כלל</th><th>מה נבדק</th><th>חומרה</th><th>סף</th><th>פעיל</th></tr></thead>
        <tbody>{sys.map((r) => {
          const o = ov(r.key);
          const enabled = o?.enabled ?? r.enabled;
          const cfg = { ...(r.configuration as Record<string, unknown>), ...((o?.configuration as Record<string, unknown>) ?? {}) };
          const p = PARAM[r.key];
          return (
            <tr key={r.id}>
              <td className="font-medium">{r.name}</td>
              <td className="text-muted-foreground">{RULES[r.key].description}</td>
              <td><SeverityBadge severity={r.default_severity as Severity} /></td>
              <td>{p ? (
                <label className="flex items-center gap-2 text-sm">
                  <Input type="number" min={1} disabled={!isAdmin} defaultValue={String(cfg[p.key] ?? "")} className="num h-8 w-16"
                    onBlur={(e) => Number(e.target.value) !== Number(cfg[p.key]) && save(r.key, { configuration: { [p.key]: Number(e.target.value) } })} />
                  <span className="text-muted-foreground">{p.label}</span>
                </label>
              ) : <span className="text-muted-foreground">—</span>}</td>
              <td><Switch disabled={!isAdmin} checked={enabled} onCheckedChange={(v) => save(r.key, { enabled: v })} /></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
