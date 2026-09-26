import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { orgQueryKey, useOrg } from "@/lib/org";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/_shell/settings/organization")({
  head: () => ({ meta: [{ title: "פרטי ארגון — Pulse" }, { name: "description", content: "פרטי הארגון." }, { property: "og:title", content: "פרטי ארגון — Pulse" }, { property: "og:description", content: "פרטי הארגון." }] }),
  component: OrgSettings,
});

function OrgSettings() {
  const { org, isAdmin } = useOrg();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: org.name, legal_name: org.legal_name ?? "", phone: org.phone ?? "", email: org.email ?? "" });
  async function save() {
    const { error } = await supabase.from("organizations").update(f).eq("id", org.id);
    if (error) return toast.error(friendlyError(error));
    toast.success("נשמר");
    qc.invalidateQueries({ queryKey: orgQueryKey });
  }
  return (
    <div className="panel max-w-xl space-y-4 p-5">
      {!isAdmin && <p className="text-sm text-muted-foreground">רק משתמשי מטה יכולים לערוך את פרטי הארגון.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>שם</Label><Input disabled={!isAdmin} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>שם משפטי</Label><Input disabled={!isAdmin} value={f.legal_name} onChange={(e) => setF({ ...f, legal_name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>טלפון</Label><Input disabled={!isAdmin} dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>אימייל</Label><Input disabled={!isAdmin} dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      </div>
      <div className="text-sm text-muted-foreground">אזור זמן: {org.timezone} · מטבע: ₪ ({org.currency})</div>
      {isAdmin && <Button onClick={save}>שמירה</Button>}
    </div>
  );
}
