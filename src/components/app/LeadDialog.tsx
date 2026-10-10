import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { LEAD_SOURCE, isValidIsraeliPhone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LeadDialog({ trigger, defaultPhone }: { trigger: ReactNode; defaultPhone?: string }) {
  const { org, branches, branchId, members, me } = useOrg();
  const invalidate = useInvalidateAll();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ full_name: "", phone: defaultPhone ?? "", email: "", source: "WEBSITE", branch: branchId ?? branches[0]?.id ?? "", owner: me.id });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!f.full_name.trim()) return toast.error("יש להזין שם");
    if (f.phone && !isValidIsraeliPhone(f.phone)) return toast.error("מספר הטלפון אינו תקין");
    setBusy(true);
    if (f.phone) {
      const dup = await supabase.rpc("find_person_by_phone", { _org: org.id, _phone: f.phone });
      const hit = dup.data?.[0];
      if (hit) {
        setBusy(false);
        setOpen(false);
        toast.info(`המספר כבר קיים במערכת (${hit.full_name}) — נפתח הכרטיס הקיים`);
        return hit.kind === "customer" ? navigate({ to: "/customers/$id", params: { id: hit.id } }) : navigate({ to: "/leads/$id", params: { id: hit.id } });
      }
    }
    const { data, error } = await supabase.from("leads").insert({
      organization_id: org.id, branch_id: f.branch, full_name: f.full_name.trim(), phone: f.phone || null,
      email: f.email || null, source: f.source, assigned_member_id: f.owner, status: "NEW",
    }).select("id").single();
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("הליד נוצר");
    setOpen(false);
    invalidate();
    navigate({ to: "/leads/$id", params: { id: data.id } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle>ליד חדש</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>שם מלא</Label><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>טלפון</Label><Input dir="ltr" placeholder="050-000-0000" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>אימייל</Label><Input dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>מקור</Label>
              <Select value={f.source} onValueChange={(v) => setF({ ...f, source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(LEAD_SOURCE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>סניף</Label>
              <Select value={f.branch} onValueChange={(v) => setF({ ...f, branch: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>אחראי</Label>
              <Select value={f.owner} onValueChange={(v) => setF({ ...f, owner: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{members.filter((m) => m.status !== "REMOVED").map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={save} disabled={busy}>צור ליד</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
