import type { TablesUpdate } from "@/integrations/supabase/types";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { TASK_PRIORITY, TASK_STATUS, fmtRelative } from "@/lib/format";
import { TASK_OUTCOME, isOpen, isOverdue } from "@/lib/tasks";
import { useTaskTypes } from "@/components/app/TaskDialog";
import { StatusBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

const pad = (n: number) => String(n).padStart(2, "0");
const local = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const EVENT: Record<string, string> = {
  TASK_CREATED: "המשימה נוצרה", TASK_STATUS: "שינוי סטטוס", TASK_ASSIGNED: "העברה לעובד", TASK_DUE: "שינוי מועד יעד",
  TASK_OUTCOME: "תוצאת טיפול", TASK_NOTE: "הערה",
};

export function TaskDetail({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { org, members, memberName, branchName } = useOrg();
  const invalidate = useInvalidateAll();
  const types = useTaskTypes();
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["task-detail", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data: t, error } = await supabase.from("tasks").select("*").eq("id", taskId!).maybeSingle();
      if (error) throw error;
      if (!t) return null;
      const [h, tk, person] = await Promise.all([
        supabase.from("activities").select("*").eq("organization_id", org.id).eq("entity_type", "task").eq("entity_id", t.id).order("created_at", { ascending: false }),
        t.entity_type === "ticket" && t.entity_id
          ? supabase.from("approval_requests").select("id,ticket_no,title").or(`task_id.eq.${t.id},id.eq.${t.entity_id}`)
          : supabase.from("approval_requests").select("id,ticket_no,title").eq("task_id", t.id),
        t.entity_type === "lead" && t.entity_id ? supabase.from("leads").select("full_name,stage").eq("id", t.entity_id).maybeSingle()
          : t.entity_type === "customer" && t.entity_id ? supabase.from("customers").select("full_name").eq("id", t.entity_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return { t, history: h.data ?? [], tickets: tk.data ?? [], person: person.data as { full_name: string; stage?: string } | null };
    },
  });

  async function update(patch: TablesUpdate<"tasks">, msg: string) {
    setBusy(true);
    const { error } = await supabase.from("tasks").update(patch).eq("id", taskId!);
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(msg);
    invalidate(); q.refetch();
  }
  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("task_comment", { _task: taskId!, _body: note });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    setNote(""); toast.success("ההערה נשמרה"); q.refetch();
  }

  const d = q.data;
  const t = d?.t;
  const type = types.data?.find((x) => x.key === t?.task_type);
  const sales = type?.category === "SALES";

  return (
    <Sheet open={!!taskId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{t?.title ?? "משימה"}</SheetTitle></SheetHeader>
        {q.isLoading ? <p className="p-4 text-sm text-muted-foreground">טוען…</p> : !t ? <p className="p-4 text-sm">המשימה לא נמצאה או שאין לך הרשאה לצפות בה.</p> : (
          <div className="space-y-5 p-4 pt-2 text-sm">
            <div className="flex flex-wrap gap-2">
              {isOverdue(t) ? <StatusBadge tone="critical">באיחור</StatusBadge> : <StatusBadge tone={t.status === "COMPLETED" ? "ok" : "neutral"}>{TASK_STATUS[t.status]}</StatusBadge>}
              <StatusBadge tone={t.priority === "URGENT" || t.priority === "HIGH" ? "warning" : "neutral"}>{TASK_PRIORITY[t.priority]}</StatusBadge>
              {type && <StatusBadge tone="neutral">{type.label}</StatusBadge>}
              {t.outcome && <StatusBadge tone="neutral">{TASK_OUTCOME[t.outcome]}</StatusBadge>}
            </div>
            {t.description && <p className="whitespace-pre-wrap">{t.description}</p>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">אחראי</dt><dd>{memberName(t.assigned_member_id)}</dd>
              <dt className="text-muted-foreground">יעד</dt><dd className="num">{fmtRelative(t.due_at, true)}</dd>
              <dt className="text-muted-foreground">סניף</dt><dd>{branchName(t.branch_id)}</dd>
              <dt className="text-muted-foreground">נוצרה</dt><dd className="num">{fmtRelative(t.created_at, true)}</dd>
              {t.popup && <><dt className="text-muted-foreground">התראה</dt><dd className="num">{t.reminder_at ? fmtRelative(t.reminder_at, true) : "—"}</dd></>}
            </dl>
            <div className="flex flex-wrap gap-2">
              {t.entity_type === "lead" && t.entity_id && <Button asChild size="sm" variant="outline"><Link to="/leads/$id" params={{ id: t.entity_id }}>{d.person?.stage === "PROSPECT" ? "מתעניין" : "ליד"} · {d.person?.full_name}</Link></Button>}
              {t.entity_type === "customer" && t.entity_id && <Button asChild size="sm" variant="outline"><Link to="/customers/$id" params={{ id: t.entity_id }}>כרטיס לקוח · {d.person?.full_name}</Link></Button>}
              {t.entity_type === "cancellation_request" && <span className="text-xs text-muted-foreground">מקושר לבקשת ביטול</span>}
              {d.tickets.map((k) => <Button key={k.id} asChild size="sm" variant="outline"><Link to="/tickets/$id" params={{ id: k.id }}>קריאה #{k.ticket_no}</Link></Button>)}
            </div>

            {type?.requires_link && <p className="rounded-md bg-muted/40 px-3 py-2 text-xs">משימה זו היא תזכורת בלבד. האישור או הדחייה מתבצעים בקריאה המקושרת — סימון המשימה כבוצעה אינו מאשר את הבקשה.</p>}
            <section className="space-y-3 rounded-md border p-3">
              <h3 className="font-medium">טיפול</h3>
              {isOpen(t) ? (
                <>
                  {t.status === "OPEN" && <Button size="sm" variant="outline" disabled={busy} onClick={() => update({ status: "IN_PROGRESS" }, "הטיפול התחיל")}>התחלת טיפול</Button>}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>העברה לעובד</Label>
                      <Select value={t.assigned_member_id ?? ""} onValueChange={(v) => update({ assigned_member_id: v }, "המשימה הועברה")}>
                        <SelectTrigger aria-label="העברה לעובד"><SelectValue placeholder="בחירה" /></SelectTrigger>
                        <SelectContent>{members.filter((m) => m.status === "ACTIVE").map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>שינוי מועד יעד</Label>
                      <Input key={t.due_at} type="datetime-local" className="num" defaultValue={local(t.due_at)} aria-label="שינוי מועד יעד"
                        onBlur={(e) => { if (e.target.value && new Date(e.target.value).toISOString() !== new Date(t.due_at).toISOString()) update({ due_at: new Date(e.target.value).toISOString() }, "מועד היעד עודכן"); }} />
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    {sales && (
                      <div className="flex-1 space-y-1.5">
                        <Label>תוצאת הטיפול</Label>
                        <Select value={outcome} onValueChange={setOutcome}>
                          <SelectTrigger aria-label="תוצאת הטיפול"><SelectValue placeholder="בחירה" /></SelectTrigger>
                          <SelectContent>{Object.entries(TASK_OUTCOME).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button size="sm" disabled={busy || (sales && !outcome)} onClick={() => update({ status: "COMPLETED", ...(sales ? { outcome } : {}) }, "המשימה סומנה כבוצעה")}>סמן כבוצעה</Button>
                  </div>
                  {sales && outcome === "SALE" && <p className="text-xs text-muted-foreground">מכירה תיספר בדוחות רק לפי מנוי שנרכש בפועל, לא לפי סימון המשימה.</p>}
                </>
              ) : (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => update({ status: "OPEN" }, "המשימה נפתחה מחדש")}>פתיחה מחדש</Button>
              )}
              <div className="space-y-1.5">
                <Label>הוספת הערה</Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={addNote}>שמור הערה</Button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 font-medium">היסטוריה</h3>
              {!d.history.length ? <p className="text-muted-foreground">אין עדיין פעולות מתועדות.</p> : (
                <ul className="space-y-2">
                  {d.history.map((h) => {
                    const m = h.metadata as Record<string, string | null>;
                    const detail = h.activity_type === "TASK_STATUS" ? `${TASK_STATUS[m.from ?? ""] ?? m.from} ← ${TASK_STATUS[m.to ?? ""] ?? m.to}`
                      : h.activity_type === "TASK_ASSIGNED" ? `${memberName(m.from)} ← ${memberName(m.to)}`
                      : h.activity_type === "TASK_DUE" ? `${m.from ? fmtRelative(m.from, true) : ""} ← ${m.to ? fmtRelative(m.to, true) : ""}`
                      : h.activity_type === "TASK_OUTCOME" ? TASK_OUTCOME[h.description ?? ""] ?? h.description
                      : h.activity_type === "TASK_NOTE" ? h.description : null;
                    const who = members.find((x) => x.user_id === h.performed_by)?.display_name ?? "המערכת";
                    return (
                      <li key={h.id} className="rounded-md bg-muted/40 px-3 py-2">
                        <div className="flex justify-between gap-2"><span className="font-medium">{EVENT[h.activity_type] ?? h.activity_type}</span><span className="num text-xs text-muted-foreground">{fmtRelative(h.created_at, true)}</span></div>
                        {detail && <div className="whitespace-pre-wrap">{detail}</div>}
                        <div className="text-xs text-muted-foreground">{who}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
