import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { orgQueryKey, useOrg } from "@/lib/org";
import { friendlyError } from "@/lib/errors";
import { StatusBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/_shell/settings/branches")({
  head: () => ({ meta: [{ title: "סניפים — Pulse" }, { name: "description", content: "ניהול סניפי הארגון." }, { property: "og:title", content: "סניפים — Pulse" }, { property: "og:description", content: "ניהול סניפי הארגון." }] }),
  component: Branches,
});

function Branches() {
  const { org, allBranches, isAdmin } = useOrg();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: orgQueryKey });

  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("branches").insert({ organization_id: org.id, name: name.trim(), address: address || null });
    if (error) return toast.error(friendlyError(error));
    setName(""); setAddress(""); toast.success("הסניף נוסף"); refresh();
  }
  async function patch(id: string, p: Record<string, unknown>) {
    const { error } = await supabase.from("branches").update(p).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    refresh();
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="panel flex flex-wrap items-end gap-2 p-4">
          <Input placeholder="שם הסניף" value={name} onChange={(e) => setName(e.target.value)} className="w-48" />
          <Input placeholder="כתובת" value={address} onChange={(e) => setAddress(e.target.value)} className="w-64" />
          <Button onClick={add}>הוסף סניף</Button>
        </div>
      )}
      <div className="panel">
        <table className="data-table">
          <thead><tr><th>סניף</th><th>כתובת</th><th>טלפון</th><th>סטטוס</th>{isAdmin && <th>פעיל</th>}</tr></thead>
          <tbody>{allBranches.map((b) => (
            <tr key={b.id}>
              <td>{isAdmin ? <Input defaultValue={b.name} className="h-8 w-44" onBlur={(e) => e.target.value !== b.name && patch(b.id, { name: e.target.value })} /> : b.name}</td>
              <td className="text-muted-foreground">{b.address}</td>
              <td className="num text-muted-foreground">{b.phone}</td>
              <td>{b.active ? <StatusBadge tone="ok">פעיל</StatusBadge> : <StatusBadge>לא פעיל</StatusBadge>}</td>
              {isAdmin && <td><Switch checked={b.active} onCheckedChange={(v) => patch(b.id, { active: v })} /></td>}
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
