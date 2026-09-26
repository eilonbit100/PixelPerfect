import { useState } from "react";
import { toast } from "sonner";
import { Megaphone, Snowflake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { FREEZE_REASON } from "@/lib/entry";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Front-desk note: shows on check-in and in the customer popup until marked handled */
export function DeskNote({ customerId, note, onSaved }: { customerId: string; note: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(note ?? "");
  async function save(value: string | null) {
    const { error } = await supabase.from("customers").update({ desk_note: value }).eq("id", customerId);
    if (error) return toast.error(friendlyError(error));
    setEditing(false);
    onSaved();
  }
  if (editing) return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <Label>הודעה לקבלה</Label>
      <Textarea value={v} onChange={(e) => setV(e.target.value)} placeholder="למשל: להחתים על הוראת קבע" autoFocus />
      <div className="flex gap-2"><Button size="sm" onClick={() => save(v.trim() || null)}>שמור</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>ביטול</Button></div>
    </div>
  );
  if (!note) return <Button size="sm" variant="outline" onClick={() => { setV(""); setEditing(true); }}><Megaphone className="size-4" /> הודעה לקבלה</Button>;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-attention/40 bg-attention-soft p-3 text-sm">
      <Megaphone className="size-4 text-attention" />
      <span className="flex-1 font-medium">{note}</span>
      <Button size="sm" variant="ghost" onClick={() => { setV(note); setEditing(true); }}>עריכה</Button>
      <Button size="sm" variant="outline" onClick={() => save(null)}>טופל</Button>
    </div>
  );
}

export function FreezeDialog({ orgId, customerId, membershipId, onSaved }: { orgId: string; customerId: string; membershipId: string; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ start: today, end: "", reason: "ABROAD", note: "" });
  const days = f.end && f.end >= f.start ? Math.round((new Date(f.end).getTime() - new Date(f.start).getTime()) / 864e5) + 1 : 0;
  async function save() {
    if (!f.end || f.end < f.start) return toast.error("יש לבחור תאריך סיום אחרי תאריך ההתחלה");
    const { error } = await supabase.from("customer_freezes").insert({
      organization_id: orgId, customer_id: customerId, membership_id: membershipId,
      start_date: f.start, end_date: f.end, reason: f.reason, note: f.note.trim() || null,
    });
    if (error) return toast.error(friendlyError(error));
    toast.success(`המנוי הוקפא ל-${days} ימים, והתוקף הוארך בהתאם`);
    setOpen(false);
    onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Snowflake className="size-4" /> הקפאת מנוי</Button></DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle>הקפאת מנוי</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>מתאריך</Label><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>עד תאריך</Label><Input type="date" min={f.start} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>סיבה</Label>
            <Select value={f.reason} onValueChange={(v) => setF({ ...f, reason: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(FREEZE_REASON).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>הערה (לא חובה)</Label><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          {days > 0 && <p className="text-sm text-muted-foreground">תוקף המנוי יוארך ב-<span className="num">{days}</span> ימים. בזמן ההקפאה הכניסה חסומה.</p>}
        </div>
        <DialogFooter className="gap-2"><Button onClick={save}>הקפא</Button><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
