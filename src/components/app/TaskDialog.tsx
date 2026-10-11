import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { TASK_PRIORITY } from "@/lib/format";
import { TASK_CATEGORY } from "@/lib/tasks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
function defaultDue() { const d = new Date(Date.now() + 24 * 3600 * 1000); d.setHours(12, 0, 0, 0); return local(d); }

export function useTaskTypes() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["task-types", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("task_types").select("key,label,category,sort").eq("organization_id", org.id).eq("active", true).order("sort");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

type Link = { type: string; id: string; title: string };

export function TaskDialog({
  trigger, entityType, entityId, branchId, defaultTitle, defaultAssignee, defaultType,
}: {
  trigger: ReactNode; entityType?: string; entityId?: string; branchId?: string | null; defaultTitle?: string; defaultAssignee?: string | null; defaultType?: string;
}) {
  const { org, members, me, branches, branchId: selBranch } = useOrg();
  const invalidate = useInvalidateAll();
  const types = useTaskTypes();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [desc, setDesc] = useState("");
  const [due, setDue] = useState(defaultDue());
  const [priority, setPriority] = useState("NORMAL");
  const [type, setType] = useState(defaultType ?? (entityType === "lead" ? "LEAD_CONTACT" : "GENERAL"));
  const [assignee, setAssignee] = useState<string>(defaultAssignee ?? me.id);
  const [branch, setBranch] = useState<string>(branchId ?? selBranch ?? branches[0]?.id ?? "");
  const [popup, setPopup] = useState(false);
  const [remind, setRemind] = useState(defaultDue());
  const [link, setLink] = useState<Link | null>(null);
  const [lq, setLq] = useState("");
  const [saving, setSaving] = useState(false);

  const cat = types.data?.find((t) => t.key === type)?.category ?? "GENERAL";
  const canLink = !entityId && (cat === "SALES" || cat === "SERVICE" || cat === "GENERAL");
  useEffect(() => { if (!canLink) setLink(null); }, [canLink]);

  const results = useQuery({
    queryKey: ["task-link-search", lq],
    enabled: lq.trim().length >= 2,
    queryFn: async () => (await supabase.rpc("search_entities", { _q: lq.trim(), _limit: 6 })).data ?? [],
  });

  async function save() {
    if (!title.trim()) return toast.error("יש להזין כותרת למשימה");
    if (popup && !remind) return toast.error("יש לבחור מועד להצגת ההתראה");
    setSaving(true);
    const { error } = await supabase.from("tasks").insert({
      organization_id: org.id, branch_id: branchId ?? branch, title: title.trim(), description: desc || null,
      due_at: new Date(due).toISOString(), priority, assigned_member_id: assignee || null, task_type: type,
      entity_type: entityType ?? link?.type ?? null, entity_id: entityId ?? link?.id ?? null, source: "MANUAL",
      popup, reminder_at: popup ? new Date(remind).toISOString() : null,
    });
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("המשימה נוצרה");
    setOpen(false);
    setTitle(defaultTitle ?? ""); setDesc(""); setDue(defaultDue()); setPopup(false); setLink(null); setLq("");
    invalidate();
  }

  const assignable = members.filter((m) => m.status === "ACTIVE" || m.status === "INVITED");
  const groups = Object.keys(TASK_CATEGORY).map((c) => ({ c, items: (types.data ?? []).filter((t) => t.category === c) })).filter((g) => g.items.length);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader><DialogTitle>משימה חדשה</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>כותרת</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>סוג משימה</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger aria-label="סוג משימה"><SelectValue placeholder="בחירה" /></SelectTrigger>
                <SelectContent>{groups.map((g) => (
                  <SelectGroup key={g.c}><SelectLabel>{TASK_CATEGORY[g.c]}</SelectLabel>{g.items.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectGroup>
                ))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>עדיפות</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TASK_PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>תאריך ושעת יעד</Label><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="num" /></div>
            <div className="space-y-1.5">
              <Label>עובד אחראי</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{assignable.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
          {canLink && (
            <div className="space-y-1.5">
              <Label>קישור ללקוח, ליד או מתעניין {cat === "GENERAL" && <span className="text-muted-foreground">(לא חובה)</span>}</Label>
              {link ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{link.type === "lead" ? "ליד/מתעניין" : "לקוח"} · {link.title}</span>
                  <Button size="icon" variant="ghost" aria-label="הסר קישור" onClick={() => setLink(null)}><X className="size-4" /></Button>
                </div>
              ) : (
                <>
                  <Input placeholder="חיפוש לפי שם או טלפון" value={lq} onChange={(e) => setLq(e.target.value)} />
                  {(results.data ?? []).length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-md border">
                      {results.data!.map((r) => (
                        <button key={r.id} type="button" className="block w-full px-3 py-1.5 text-start text-sm hover:bg-muted"
                          onClick={() => { setLink({ type: r.entity_type, id: r.id, title: r.title }); setLq(""); }}>
                          {r.entity_type === "lead" ? "ליד/מתעניין" : "לקוח"} · {r.title} <span className="num text-muted-foreground">{r.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div className="space-y-1.5"><Label>תיאור</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
          <div className="rounded-md border p-3">
            <label className="flex items-center justify-between gap-2 text-sm font-medium">
              הצג משימה בחלונית קופצת
              <Switch checked={popup} onCheckedChange={setPopup} aria-label="הצג משימה בחלונית קופצת" />
            </label>
            {popup && (
              <div className="mt-2 space-y-1.5"><Label>מועד ההתראה</Label><Input type="datetime-local" value={remind} onChange={(e) => setRemind(e.target.value)} className="num" aria-label="מועד ההתראה" /></div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={save} disabled={saving}>{saving ? "שומר…" : "צור משימה"}</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
