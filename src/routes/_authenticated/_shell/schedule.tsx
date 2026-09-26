import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { friendlyError } from "@/lib/errors";
import { WEEKDAYS, isoDay } from "@/lib/entry";
import { fmtDate } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/app/states";
import { CustomerPhoto } from "@/components/app/CustomerPhoto";
import { StatusBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_shell/schedule")({
  head: () => ({
    meta: [
      { title: "מערכת שעות — Pulse" },
      { name: "description", content: "לוח שיעורים שבועי, תפוסה, רשימת המתנה ונוכחות." },
      { property: "og:title", content: "מערכת שעות — Pulse" },
      { property: "og:description", content: "לוח שיעורים שבועי, תפוסה, רשימת המתנה ונוכחות." },
    ],
  }),
  component: Schedule,
});

const weekStart = (offset: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay() + offset * 7); return d; };

function Schedule() {
  const { org, branches, branchId, isManager, members, memberName } = useOrg();
  const [branch, setBranch] = useState(branchId ?? branches[0]?.id ?? "");
  const [week, setWeek] = useState(0);
  const [open, setOpen] = useState<{ id: string; date: string } | null>(null);
  const start = weekStart(week);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });

  const q = useQuery({
    queryKey: ["schedule", branch, isoDay(start)],
    enabled: !!branch,
    queryFn: async () => {
      const [rooms, tpl, bk] = await Promise.all([
        supabase.from("class_rooms").select("*").eq("branch_id", branch).eq("active", true).order("name"),
        supabase.from("class_templates").select("*").eq("branch_id", branch).eq("active", true).order("start_time"),
        supabase.from("class_bookings").select("template_id,session_date,status").eq("branch_id", branch).gte("session_date", isoDay(days[0])).lte("session_date", isoDay(days[6])).neq("status", "CANCELLED"),
      ]);
      for (const r of [rooms, tpl, bk]) if (r.error) throw r.error;
      return { rooms: rooms.data!, tpl: tpl.data!, bk: bk.data! };
    },
  });
  const count = (t: string, d: string, s: string) => q.data?.bk.filter((b) => b.template_id === t && b.session_date === d && b.status === s).length ?? 0;
  const roomName = (id: string) => q.data?.rooms.find((r) => r.id === id)?.name ?? "";
  const instructors = members.filter((m) => m.status !== "REMOVED");

  return (
    <div>
      <PageHeader title="מערכת שעות" subtitle="שיעורים קבועים בכל שבוע"
        actions={<div className="flex gap-2">
          {branches.length > 1 && (
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {isManager && q.data && <NewClass orgId={org.id} branch={branch} rooms={q.data.rooms} instructors={instructors} />}
        </div>} />
      <div className="mb-3 flex items-center gap-2">
        <Button size="icon" variant="outline" onClick={() => setWeek(week - 1)} aria-label="שבוע קודם"><ChevronRight className="size-4" /></Button>
        <span className="num text-sm font-medium">{fmtDate(days[0].toISOString())} – {fmtDate(days[6].toISOString())}</span>
        <Button size="icon" variant="outline" onClick={() => setWeek(week + 1)} aria-label="שבוע הבא"><ChevronLeft className="size-4" /></Button>
        {week !== 0 && <Button size="sm" variant="ghost" onClick={() => setWeek(0)}>השבוע</Button>}
      </div>
      {q.isLoading ? <TableSkeleton /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.tpl.length ? (
        <div className="panel"><EmptyState title="אין עדיין שיעורים בסניף" text={isManager ? "הוסף שיעור קבוע כדי להתחיל." : "מנהל הסניף יוסיף שיעורים."} /></div>
      ) : (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-7">
          {days.map((d, wd) => {
            const ds = isoDay(d);
            const isToday = ds === isoDay(new Date());
            return (
              <div key={ds} className={`panel min-w-36 ${isToday ? "ring-2 ring-primary" : ""}`}>
                <div className="border-b px-3 py-2 text-sm font-medium">{WEEKDAYS[wd]} <span className="num text-xs text-muted-foreground">{d.getDate()}/{d.getMonth() + 1}</span></div>
                <div className="space-y-2 p-2">
                  {q.data.tpl.filter((t) => t.weekday === wd).map((t) => {
                    const n = count(t.id, ds, "BOOKED"), w = count(t.id, ds, "WAITLIST");
                    const full = n >= t.capacity;
                    return (
                      <button key={t.id} onClick={() => setOpen({ id: t.id, date: ds })} className="w-full rounded-md border bg-background p-2 text-start text-xs hover:border-primary">
                        <div className="num font-semibold">{t.start_time.slice(0, 5)}</div>
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="text-muted-foreground">{roomName(t.room_id)}</div>
                        <div className="truncate text-muted-foreground">{memberName(t.instructor_member_id)}</div>
                        <div className={`mt-1 num ${full ? "text-critical font-medium" : ""}`}>{n}/{t.capacity}{w > 0 && <span className="text-muted-foreground"> · המתנה {w}</span>}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {open && q.data && (() => {
        const t = q.data.tpl.find((x) => x.id === open.id)!;
        return <SessionDialog t={t} date={open.date} roomName={roomName(t.room_id)} instructor={memberName(t.instructor_member_id)} orgId={org.id} onClose={() => setOpen(null)} />;
      })()}
    </div>
  );
}

function NewClass({ orgId, branch, rooms, instructors }: { orgId: string; branch: string; rooms: { id: string; name: string }[]; instructors: { id: string; display_name: string | null }[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", room: rooms[0]?.id ?? "", newRoom: "", instructor: "", weekday: "0", time: "18:00", duration: "50", capacity: "20" });
  async function save() {
    if (!f.name.trim()) return toast.error("יש להזין שם שיעור");
    let room = f.room;
    if (f.newRoom.trim()) {
      const r = await supabase.from("class_rooms").insert({ organization_id: orgId, branch_id: branch, name: f.newRoom.trim() }).select("id").single();
      if (r.error) return toast.error(friendlyError(r.error));
      room = r.data.id;
    }
    if (!room) return toast.error("יש לבחור חדר או להוסיף חדר חדש");
    const { error } = await supabase.from("class_templates").insert({
      organization_id: orgId, branch_id: branch, room_id: room, name: f.name.trim(), instructor_member_id: f.instructor || null,
      weekday: Number(f.weekday), start_time: f.time, duration_min: Number(f.duration) || 50, capacity: Number(f.capacity) || 20,
    });
    if (error) return toast.error(friendlyError(error));
    toast.success("השיעור נוסף למערכת השעות");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["schedule"] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> שיעור חדש</Button></DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle>שיעור קבוע חדש</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>שם השיעור</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>חדר</Label>
              <Select value={f.room} onValueChange={(v) => setF({ ...f, room: v })}>
                <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                <SelectContent>{rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>או חדר חדש</Label><Input value={f.newRoom} onChange={(e) => setF({ ...f, newRoom: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>מדריך</Label>
            <Select value={f.instructor} onValueChange={(v) => setF({ ...f, instructor: v })}>
              <SelectTrigger><SelectValue placeholder="בחר מהצוות" /></SelectTrigger>
              <SelectContent>{instructors.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name ?? "—"}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>יום</Label>
              <Select value={f.weekday} onValueChange={(v) => setF({ ...f, weekday: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>שעה</Label><Input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>משך (דקות)</Label><Input type="number" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>מקסימום משתתפים</Label><Input type="number" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter className="gap-2"><Button onClick={save}>הוסף</Button><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionDialog({ t, date, roomName, instructor, orgId, onClose }: {
  t: { id: string; name: string; capacity: number; start_time: string }; date: string; roomName: string; instructor: string; orgId: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [s, setS] = useState("");
  const q = useQuery({
    queryKey: ["session", t.id, date],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_bookings").select("id,status,attended,created_at,customer:customers(id,full_name,photo_path)")
        .eq("template_id", t.id).eq("session_date", date).neq("status", "CANCELLED").order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const found = useQuery({
    queryKey: ["session-search", orgId, s],
    enabled: s.trim().length >= 2,
    queryFn: async () => {
      const d = s.replace(/\D/g, "");
      let qq = supabase.from("customers").select("id,full_name,phone").eq("organization_id", orgId).is("deleted_at", null).limit(8);
      qq = d.length >= 4 ? qq.or(`national_id.like.%${d},normalized_phone.like.%${d}`) : qq.ilike("full_name", `%${s.trim()}%`);
      const { data, error } = await qq;
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["session", t.id, date] }); qc.invalidateQueries({ queryKey: ["schedule"] }); };
  async function book(cid: string) {
    const { data, error } = await supabase.rpc("book_class", { _template: t.id, _date: date, _customer: cid });
    if (error) return toast.error(friendlyError(error));
    toast.success(data === "WAITLIST" ? "השיעור מלא — נוסף לרשימת ההמתנה" : "נרשם לשיעור");
    setS(""); refresh();
  }
  async function cancel(id: string) {
    const { error } = await supabase.rpc("cancel_booking", { _booking: id });
    if (error) return toast.error(friendlyError(error));
    refresh();
  }
  async function attend(id: string, v: boolean) {
    const { error } = await supabase.from("class_bookings").update({ attended: v }).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    refresh();
  }
  const booked = (q.data ?? []).filter((b) => b.status === "BOOKED");
  const wait = (q.data ?? []).filter((b) => b.status === "WAITLIST");
  const past = date < isoDay(new Date());
  const Row = ({ b }: { b: (typeof booked)[number] }) => {
    const c = b.customer as { id: string; full_name: string; photo_path: string | null } | null;
    return (
      <li className="flex items-center gap-2 py-2 text-sm">
        {b.status === "BOOKED" && <Checkbox checked={b.attended} onCheckedChange={(v) => attend(b.id, !!v)} aria-label="נוכחות" />}
        <CustomerPhoto name={c?.full_name ?? ""} path={c?.photo_MAYBE ?? c?.photo_path} size={28} />
        <span className="flex-1 truncate">{c?.full_name}</span>
        {b.attended && <StatusBadge tone="ok">הגיע</StatusBadge>}
        {!past && <button onClick={() => cancel(b.id)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="ביטול רישום"><X className="size-3.5" /></button>}
      </li>
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t.name} · <span className="num">{t.start_time.slice(0, 5)}</span></DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{WEEKDAYS[new Date(date).getDay()]} <span className="num">{fmtDate(date)}</span> · {roomName} · {instructor}</p>
        <p className="text-sm">תפוסה: <span className="num font-medium">{booked.length}/{t.capacity}</span>{wait.length > 0 && <> · רשימת המתנה <span className="num">{wait.length}</span></>}</p>
        {!past && (
          <div className="relative">
            <Input value={s} onChange={(e) => setS(e.target.value)} placeholder="רישום לקוח — שם, טלפון או ת״ז" />
            {!!found.data?.length && s.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow">
                {found.data.map((c) => <button key={c.id} onClick={() => book(c.id)} className="flex w-full justify-between px-3 py-2 text-start text-sm hover:bg-muted"><span>{c.full_name}</span><span className="num text-muted-foreground" dir="ltr">{c.phone ?? ""}</span></button>)}
              </div>
            )}
          </div>
        )}
        <div className="max-h-80 overflow-y-auto">
          {q.isLoading ? <TableSkeleton rows={3} cols={2} /> : !booked.length && !wait.length ? <p className="py-4 text-center text-sm text-muted-foreground">אין נרשמים עדיין</p> : (
            <>
              <ul className="divide-y">{booked.map((b) => <Row key={b.id} b={b} />)}</ul>
              {wait.length > 0 && <><div className="mt-3 text-xs font-medium text-muted-foreground">רשימת המתנה</div><ul className="divide-y">{wait.map((b) => <Row key={b.id} b={b} />)}</ul></>}
            </>
          )}
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>סגור</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
