import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { TASK_PRIORITY } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function defaultDue() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setHours(12, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskDialog({
  trigger, entityType, entityId, branchId, defaultTitle, defaultAssignee,
}: {
  trigger: ReactNode; entityType?: string; entityId?: string; branchId?: string | null; defaultTitle?: string; defaultAssignee?: string | null;
}) {
  const { org, members, me, branches, branchId: selBranch } = useOrg();
  const invalidate = useInvalidateAll();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [desc, setDesc] = useState("");
  const [due, setDue] = useState(defaultDue());
  const [priority, setPriority] = useState("NORMAL");
  const [assignee, setAssignee] = useState<string>(defaultAssignee ?? me.id);
  const [branch, setBranch] = useState<string>(branchId ?? selBranch ?? branches[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return toast.error("יש להזין כותרת למשימה");
    setSaving(true);
    const { error } = await supabase.from("tasks").insert({
      organization_id: org.id, branch_id: branchId ?? branch, title: title.trim(), description: desc || null,
      due_at: new Date(due).toISOString(), priority, assigned_member_id: assignee || null,
      entity_type: entityType ?? null, entity_id: entityId ?? null, source: "MANUAL",
    });
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("המשימה נוצרה");
    setOpen(false);
    setTitle(defaultTitle ?? ""); setDesc(""); setDue(defaultDue());
    invalidate();
  }

  const assignable = members.filter((m) => m.status === "ACTIVE" || m.status === "INVITED");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle>משימה חדשה</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>כותרת</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>מועד</Label><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="num" /></div>
            <div className="space-y-1.5">
              <Label>עדיפות</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TASK_PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>אחראי</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{assignable.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!branchId && (
              <div className="space-y-1.5">
                <Label>סניף</Label>
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5"><Label>פירוט</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={save} disabled={saving}>{saving ? "שומר…" : "צור משימה"}</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
