import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { TASK_PRIORITY, fmtRelative } from "@/lib/format";
import { snoozeUntil } from "@/lib/tasks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Reminder = { id: string; title: string; priority: string; due_at: string; entity_type: string | null; entity_id: string | null; related?: string };

/** Claims due reminders atomically on the server, so each one shows in exactly one window, once. */
export function TaskReminders() {
  const { org } = useOrg();
  const navigate = useNavigate();
  const invalidate = useInvalidateAll();
  const [queue, setQueue] = useState<Reminder[]>([]);
  const [snooze, setSnooze] = useState("15");

  const poll = useCallback(async () => {
    const { data, error } = await supabase.rpc("claim_task_reminders", { _org: org.id });
    if (error || !data?.length) return;
    const leadIds = data.filter((t) => t.entity_type === "lead").map((t) => t.entity_id!);
    const custIds = data.filter((t) => t.entity_type === "customer").map((t) => t.entity_id!);
    const [l, c] = await Promise.all([
      leadIds.length ? supabase.from("leads").select("id,full_name").in("id", leadIds) : Promise.resolve({ data: [] }),
      custIds.length ? supabase.from("customers").select("id,full_name").in("id", custIds) : Promise.resolve({ data: [] }),
    ]);
    const names = new Map([...(l.data ?? []), ...(c.data ?? [])].map((x: { id: string; full_name: string }) => [x.id, x.full_name]));
    setQueue((q) => [...q, ...data.filter((t) => !q.some((x) => x.id === t.id)).map((t) => ({ ...t, related: t.entity_id ? names.get(t.entity_id) : undefined }))]);
  }, [org.id]);

  useEffect(() => {
    poll();
    const i = setInterval(poll, 30_000);
    const vis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(i); document.removeEventListener("visibilitychange", vis); };
  }, [poll]);

  const cur = queue[0];
  const next = () => setQueue((q) => q.slice(1));

  async function complete() {
    const { error } = await supabase.from("tasks").update({ status: "COMPLETED" }).eq("id", cur.id);
    if (error) return toast.error(friendlyError(error));
    toast.success("המשימה סומנה כבוצעה"); invalidate(); next();
  }
  async function doSnooze() {
    const { error } = await supabase.from("tasks").update({ reminder_at: snoozeUntil(Number(snooze)), reminder_state: "SNOOZED" }).eq("id", cur.id);
    if (error) return toast.error(friendlyError(error));
    toast.success("ההתראה נדחתה"); next();
  }

  if (!cur) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && next()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BellRing className="size-5 text-primary" /> תזכורת משימה</DialogTitle>
          <DialogDescription>{cur.title}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted-foreground">קשור ל</dt><dd>{cur.related ?? "כללי"}</dd>
          <dt className="text-muted-foreground">דחיפות</dt><dd>{TASK_PRIORITY[cur.priority]}</dd>
          <dt className="text-muted-foreground">מועד ביצוע</dt><dd className="num">{fmtRelative(cur.due_at, true)}</dd>
        </dl>
        {queue.length > 1 && <p className="text-xs text-muted-foreground">ועוד {queue.length - 1} תזכורות</p>}
        <div className="flex items-center gap-2">
          <Select value={snooze} onValueChange={setSnooze}>
            <SelectTrigger className="w-32" aria-label="משך דחייה"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="15">15 דקות</SelectItem><SelectItem value="60">שעה</SelectItem><SelectItem value="1440">מחר</SelectItem></SelectContent>
          </Select>
          <Button variant="outline" onClick={doSnooze}>דחה התראה</Button>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={() => { navigate({ to: "/tasks", search: { task: cur.id } }); next(); }}>פתח משימה</Button>
          <Button variant="outline" onClick={complete}>סמן כבוצעה</Button>
          <Button variant="ghost" onClick={next}>סגור חלונית</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
