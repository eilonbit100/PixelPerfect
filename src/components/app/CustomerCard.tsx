import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, FileX, History, Pencil, Repeat, Snowflake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { friendlyError } from "@/lib/errors";
import { MEMBERSHIP_STATUS, fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { CATEGORY_LABEL, SEVERITY_LABEL, type HealthCategory, type HealthIssue } from "@/lib/card-health";
import { SeverityBadge, StatusBadge } from "@/components/app/badges";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const REQUEST_STATUS: Record<string, string> = { OPEN: "ממתינה לטיפול", IN_PROGRESS: "בטיפול", HANDLED: "הושלמה", REJECTED: "נדחתה / בוטלה" };
export const BILLING: Record<string, string> = { MONTHLY: "חודשי", YEARLY: "שנתי", PUNCH_CARD: "כרטיסייה" };
const today = () => new Date().toISOString().slice(0, 10);

type Membership = { id: string; display_name: string; status: string; start_date: string; end_date: string | null; price: number; branch_id: string | null; membership_plan_id: string | null; cancelled_at: string | null; cancel_reason: string | null; cancel_note: string | null; cancel_performed_at: string | null; cancelled_by: string | null; cancellation_request_id: string | null; scheduled_cancel_date?: string | null; cancel_override_reason?: string | null };
type Plan = { id: string; name: string; price: number; billing_period: string };
type Req = { id: string; membership_id: string | null; status: string; reason: string | null; note: string | null; requested_at: string; handled_at: string | null; effective_date?: string | null; assigned_member_id: string | null; created_by: string | null };

const live = (s: string) => ["ACTIVE", "FROZEN", "PENDING"].includes(s);
const cancellable = (m: Membership) => live(m.status) && !m.scheduled_cancel_date;
export const NOTICE_LABEL = (p?: { unit?: string; value?: number } | null) =>
  !p ? "" : p.unit === "IMMEDIATE" ? "ביטול מיידי" : p.unit === "DAYS" ? `${p.value} ימים` : p.value === 1 ? "חודש קלנדרי אחד" : `${p.value} חודשים`;

function usePreview(m: string, date: string) {
  const [v, setV] = useState<{ effective_date: string; unit: string; value: number } | null>(null);
  useEffect(() => {
    if (!m || !date) return setV(null);
    let on = true;
    supabase.rpc("preview_cancellation_date", { _membership: m, _requested: date }).then(({ data }) => { if (on) setV(data as never); });
    return () => { on = false; };
  }, [m, date]);
  return v;
}

/* ---------- Personal details ---------- */
type Cust = { id: string; full_name: string; phone: string | null; email: string | null; national_id: string | null; address: string | null; birth_date: string | null; home_branch_id: string | null; affiliation_id: string | null; affiliation_other: string | null };

export function useAffiliations() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["affiliations", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("affiliations").select("*").eq("organization_id", org.id).eq("active", true).order("sort");
      if (error) throw error;
      return data;
    },
  });
}

export function affiliationLabel(list: { id: string; name: string; is_other: boolean }[] | undefined, c: { affiliation_id: string | null; affiliation_other: string | null }) {
  const a = list?.find((x) => x.id === c.affiliation_id);
  if (!a) return null;
  return a.is_other && c.affiliation_other ? `${a.name}: ${c.affiliation_other}` : a.name;
}

export function EditDetailsDialog({ c, onSaved, trigger }: { c: Cust; onSaved: () => void; trigger: React.ReactNode }) {
  const { branches } = useOrg();
  const aff = useAffiliations();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(c);
  const set = (k: keyof Cust, v: string | null) => setF({ ...f, [k]: v });
  const chosen = aff.data?.find((x) => x.id === f.affiliation_id);
  async function save() {
    if (!f.full_name.trim()) return toast.error("יש להזין שם מלא");
    if (chosen?.is_other && !f.affiliation_other?.trim()) return toast.error("יש לציין את הגוף המאגד");
    const { error } = await supabase.from("customers").update({
      full_name: f.full_name.trim(), phone: f.phone || null, email: f.email || null, national_id: f.national_id || null,
      address: f.address || null, birth_date: f.birth_date || null, home_branch_id: f.home_branch_id,
      affiliation_id: f.affiliation_id, affiliation_other: chosen?.is_other ? f.affiliation_other?.trim() || null : null,
    }).eq("id", c.id);
    if (error) return toast.error(friendlyError(error));
    toast.success("הפרטים נשמרו");
    setOpen(false);
    onSaved();
  }
  const F = ({ k, label, ltr, type }: { k: keyof Cust; label: string; ltr?: boolean; type?: string }) => (
    <div className="space-y-1.5"><Label>{label}</Label><Input type={type} dir={ltr ? "ltr" : "rtl"} value={(f[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} /></div>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(c); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader><DialogTitle>עדכון פרטים אישיים</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">{F({ k: "full_name", label: "שם מלא" })}</div>
          {F({ k: "phone", label: "טלפון", ltr: true })}
          {F({ k: "national_id", label: "תעודת זהות", ltr: true })}
          {F({ k: "email", label: "דוא״ל", ltr: true })}
          {F({ k: "birth_date", label: "תאריך לידה", type: "date" })}
          <div className="col-span-2">{F({ k: "address", label: "כתובת מגורים" })}</div>
          <div className="space-y-1.5">
            <Label>סניף משויך</Label>
            <Select value={f.home_branch_id ?? ""} onValueChange={(v) => set("home_branch_id", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>גוף מאגד / מקור הצטרפות</Label>
            <Select value={f.affiliation_id ?? ""} onValueChange={(v) => set("affiliation_id", v)}>
              <SelectTrigger><SelectValue placeholder="לא נבחר" /></SelectTrigger>
              <SelectContent>{(aff.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {chosen?.is_other && <div className="col-span-2">{F({ k: "affiliation_other", label: "שם הגוף" })}</div>}
        </div>
        <DialogFooter className="gap-2"><Button onClick={save}>שמור</Button><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Cancellation request ---------- */
export function CancelRequestDialog({ memberships, onSaved, trigger }: { memberships: Membership[]; onSaved: () => void; trigger: React.ReactNode }) {
  const { members, me } = useOrg();
  const options = memberships.filter(cancellable);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ m: "", date: today(), reason: "", note: "", assigned: me.id });
  const pv = usePreview(f.m, f.date);
  async function save() {
    if (!f.m) return toast.error("יש לבחור מנוי");
    if (!f.reason.trim()) return toast.error("יש לציין סיבה");
    const { error } = await supabase.rpc("open_cancellation_request", { _membership: f.m, _requested_at: f.date, _reason: f.reason, _note: f.note, _assigned: f.assigned || null as unknown as string });
    if (error) return toast.error(friendlyError(error));
    toast.success("בקשת הביטול נשמרה");
    setOpen(false);
    onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF({ m: options[0]?.id ?? "", date: today(), reason: "", note: "", assigned: me.id }); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle>בקשת ביטול מנוי</DialogTitle></DialogHeader>
        {!options.length ? <p className="text-sm text-muted-foreground">אין ללקוח מנוי פעיל שאפשר לבקש את ביטולו.</p> : (
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>מנוי</Label>
              <Select value={f.m} onValueChange={(v) => setF({ ...f, m: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{options.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name} · מ־{fmtDate(m.start_date)}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>תאריך קבלת הבקשה</Label><Input type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>עובד מטפל</Label>
                <Select value={f.assigned} onValueChange={(v) => setF({ ...f, assigned: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{members.filter((m) => m.status === "ACTIVE").map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name ?? m.username}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-1.5"><Label>סיבת הבקשה</Label><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>הערה (לא חובה)</Label><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            {pv && <div className="rounded-md bg-muted/60 p-2 text-sm">תקופת הודעה מוקדמת: {NOTICE_LABEL(pv)} · הביטול ייכנס לתוקף ב־<span className="num font-semibold">{fmtDate(pv.effective_date)}</span></div>}
            <p className="text-xs text-muted-foreground">הבקשה נפתחת בסטטוס "ממתינה לטיפול". המנוי נשאר פעיל עד שמנהל יאשר את הביטול ועד תאריך כניסתו לתוקף.</p>
          </div>
        )}
        <DialogFooter className="gap-2">{!!options.length && <Button onClick={save}>שמור בקשה</Button>}<Button variant="ghost" onClick={() => setOpen(false)}>סגור</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Actual cancellation (manager) ---------- */
export function CancelMembershipDialog({ memberships, requests, onSaved, trigger, preset }: { memberships: Membership[]; requests: Req[]; onSaved: () => void; trigger: React.ReactNode; preset?: { m?: string; req?: string } }) {
  const options = memberships.filter(cancellable);
  const [open, setOpen] = useState(false);
  const init = () => {
    const m = preset?.m ?? options[0]?.id ?? "";
    const req = preset?.req ?? requests.find((r) => r.membership_id === m && ["OPEN", "IN_PROGRESS"].includes(r.status))?.id ?? "none";
    return { m, req, effective: "", reason: requests.find((r) => r.id === req)?.reason ?? "", note: "", override: "" };
  };
  const [f, setF] = useState(init);
  const linked = requests.find((r) => r.id === f.req);
  const pv = usePreview(f.m, linked ? linked.requested_at.slice(0, 10) : today());
  const minimum = linked?.effective_date ?? pv?.effective_date ?? "";
  useEffect(() => { if (open && minimum && !f.effective) setF((x) => ({ ...x, effective: minimum })); }, [open, minimum]); // eslint-disable-line react-hooks/exhaustive-deps
  const early = !!minimum && !!f.effective && f.effective < minimum;
  const reqs = requests.filter((r) => r.membership_id === f.m && ["OPEN", "IN_PROGRESS"].includes(r.status));
  async function save() {
    if (!f.m) return toast.error("יש לבחור מנוי");
    if (!f.effective) return toast.error("חובה לבחור תאריך כניסת הביטול לתוקף");
    if (!f.reason.trim()) return toast.error("יש לציין סיבת ביטול");
    if (early && !f.override.trim()) return toast.error("התאריך מוקדם מתקופת ההודעה — יש לציין סיבת חריגה");
    const { data, error } = await supabase.rpc("cancel_membership", { _membership: f.m, _effective: f.effective, _reason: f.reason, _note: f.note, _request: f.req === "none" ? null as unknown as string : f.req, _override_reason: early ? f.override : undefined });
    if (error) return toast.error(friendlyError(error));
    toast.success((data as { immediate?: boolean })?.immediate ? "המנוי בוטל" : `הביטול אושר ויכנס לתוקף ב־${fmtDate(f.effective)}`);
    setOpen(false);
    onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(init()); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle>אישור ביטול מנוי</DialogTitle></DialogHeader>
        {!options.length ? <p className="text-sm text-muted-foreground">אין מנוי פעיל לביטול.</p> : (
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>מנוי</Label>
              <Select value={f.m} onValueChange={(v) => setF({ ...f, m: v, req: "none", effective: "" })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{options.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name} · מ־{fmtDate(m.start_date)}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>תאריך ביצוע</Label><Input value={fmtDate(today())} disabled /></div>
              <div className="space-y-1.5"><Label>ביטול בתוקף מתאריך *</Label><Input type="date" value={f.effective} onChange={(e) => setF({ ...f, effective: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>קישור לבקשת ביטול</Label>
              <Select value={f.req} onValueChange={(v) => setF({ ...f, req: v, effective: "", reason: requests.find((r) => r.id === v)?.reason ?? f.reason })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">ללא בקשה</SelectItem>{reqs.map((r) => <SelectItem key={r.id} value={r.id}>בקשה מ־{fmtDate(r.requested_at)} · {REQUEST_STATUS[r.status]}</SelectItem>)}</SelectContent></Select></div>
            {minimum && <p className="text-xs text-muted-foreground">לפי מדיניות ההודעה המוקדמת{pv ? ` (${NOTICE_LABEL(pv)})` : ""}, התאריך המוקדם ביותר: <span className="num font-medium">{fmtDate(minimum)}</span>{linked ? " — מחושב מתאריך קבלת הבקשה" : " — מחושב מהיום"}</p>}
            {early && <div className="space-y-1.5 rounded-md border border-attention/50 bg-attention-soft p-2"><Label>חריגה מתקופת ההודעה — סיבה *</Label><Input value={f.override} onChange={(e) => setF({ ...f, override: e.target.value })} /><p className="text-xs text-muted-foreground">החריגה תתועד עם שמך, התאריך והשעה בהיסטוריית הלקוח.</p></div>}
            <div className="space-y-1.5"><Label>סיבת הביטול *</Label><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>הערה</Label><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              המנוי יישאר פעיל, כולל כניסה וחיובים לפי המסלול, עד תאריך הביטול, ואז יבוטל אוטומטית. אין עדיין חיבור לספק חיובים — לא יבוצע החזר כספי ולא תופסק הוראת קבע אוטומטית; יש לטפל בכך ידנית.
            </p>
          </div>
        )}
        <DialogFooter className="gap-2">{!!options.length && <Button variant="destructive" onClick={save}>אשר ביטול</Button>}<Button variant="ghost" onClick={() => setOpen(false)}>סגור</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Change plan (manager) ---------- */
function ChangePlanDialog({ m, plans, onSaved }: { m: Membership; plans: Plan[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState("");
  async function save() {
    if (!p) return toast.error("יש לבחור מסלול");
    const { error } = await supabase.rpc("change_membership_plan", { _membership: m.id, _plan: p });
    if (error) return toast.error(friendlyError(error));
    toast.success("המסלול עודכן");
    setOpen(false);
    onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost"><Repeat className="size-4" /> שינוי מסלול</Button></DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-sm">
        <DialogHeader><DialogTitle>שינוי מסלול — {m.display_name}</DialogTitle></DialogHeader>
        <Select value={p} onValueChange={setP}><SelectTrigger><SelectValue placeholder="בחר מסלול" /></SelectTrigger>
          <SelectContent>{plans.filter((x) => x.id !== m.membership_plan_id).map((x) => <SelectItem key={x.id} value={x.id}>{x.name} · {fmtMoney(x.price)} · {BILLING[x.billing_period] ?? x.billing_period}</SelectItem>)}</SelectContent></Select>
        <p className="text-xs text-muted-foreground">המחיר יתעדכן למחיר המסלול החדש. תאריכי המנוי לא משתנים, ולא מבוצע חיוב או זיכוי.</p>
        <DialogFooter className="gap-2"><Button onClick={save}>עדכן</Button><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Membership history ---------- */
function MembershipHistory({ customerId, m }: { customerId: string; m: Membership }) {
  const { memberName, members } = useOrg();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    enabled: open,
    queryKey: ["membership-history", m.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("activities").select("*").eq("entity_type", "customer").eq("entity_id", customerId)
        .contains("metadata", { membership_id: m.id }).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const who = (uid: string | null) => members.find((x) => x.user_id === uid)?.display_name ?? memberName(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost"><History className="size-4" /> היסטוריה</Button></DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle>היסטוריית שינויים — {m.display_name}</DialogTitle></DialogHeader>
        <ul className="space-y-2 text-sm">
          <li className="rounded-md border p-2">נפתח · <span className="num">{fmtDate(m.start_date)}</span></li>
          {(q.data ?? []).map((a) => <li key={a.id} className="rounded-md border p-2">{a.description}<div className="text-xs text-muted-foreground">{who(a.performed_by)} · <span className="num">{fmtDateTime(a.created_at)}</span></div></li>)}
          {q.data && !q.data.length && <li className="text-muted-foreground">לא בוצעו שינויים מתועדים במנוי זה.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Memberships tab ---------- */
export function MembershipsPanel({ customerId, orgId, memberships, plans, requests, freezes, failedByMembership, onSaved, FreezeButton }: {
  customerId: string; orgId: string; memberships: Membership[]; plans: Plan[]; requests: Req[];
  freezes: { id: string; membership_id: string; start_date: string; end_date: string }[];
  failedByMembership: Set<string>; onSaved: () => void; FreezeButton: (p: { membershipId: string }) => React.ReactNode;
}) {
  const { branchName, isManager } = useOrg();
  const todayS = today();
  async function endFreeze(id: string) {
    const { error } = await supabase.rpc("end_freeze", { _freeze: id });
    if (error) return toast.error(friendlyError(error));
    toast.success("ההקפאה הסתיימה");
    onSaved();
  }
  if (!memberships.length) return <EmptyState title="אין מנויים" text="מנוי שיירכש יופיע כאן עם כל ההיסטוריה." />;
  return (
    <div className="space-y-3">
      {memberships.map((m) => {
        const plan = plans.find((p) => p.id === m.membership_plan_id);
        const openReq = requests.find((r) => r.membership_id === m.id && ["OPEN", "IN_PROGRESS"].includes(r.status));
        const freeze = freezes.find((f) => f.membership_id === m.id && f.start_date <= todayS && f.end_date >= todayS);
        const scheduled = m.status !== "CANCELLED" && m.scheduled_cancel_date;
        const status = m.status === "CANCELLED" ? "בוטל" : scheduled ? `ביטול מתוכנן · ${fmtDate(m.scheduled_cancel_date)}` : m.status === "EXPIRED" || (m.end_date && m.end_date < todayS && m.status !== "FROZEN") ? "הסתיים" : openReq ? "בקשת ביטול" : MEMBERSHIP_STATUS[m.status];
        const tone = scheduled ? "attention" : m.status === "ACTIVE" && !openReq ? "ok" : m.status === "CANCELLED" ? "critical" : openReq || m.status === "FROZEN" ? "attention" : "neutral";
        const isLive = live(m.status);
        return (
          <div key={m.id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{m.display_name}</span>
                <StatusBadge tone={tone}>{status}</StatusBadge>
                {failedByMembership.has(m.id) && <StatusBadge tone="critical">חיוב נכשל</StatusBadge>}
              </div>
              <div className="flex flex-wrap gap-1">
                {isLive && !freeze && m.status === "ACTIVE" && <FreezeButton membershipId={m.id} />}
                {freeze && <Button size="sm" variant="ghost" onClick={() => endFreeze(freeze.id)}><Snowflake className="size-4" /> סיום הקפאה</Button>}
                {isLive && isManager && <ChangePlanDialog m={m} plans={plans} onSaved={onSaved} />}
                {isLive && !openReq && !scheduled && <CancelRequestDialog memberships={[m]} onSaved={onSaved} trigger={<Button size="sm" variant="ghost"><FileX className="size-4" /> בקשת ביטול</Button>} />}
                {isLive && isManager && !scheduled && <CancelMembershipDialog memberships={[m]} requests={requests} preset={{ m: m.id }} onSaved={onSaved} trigger={<Button size="sm" variant="ghost" className="text-critical"><Ban className="size-4" /> ביטול מנוי</Button>} />}
                <MembershipHistory customerId={customerId} m={m} />
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-muted-foreground">תאריך תחילה</dt><dd className="num">{fmtDate(m.start_date)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">תאריך סיום</dt><dd className="num">{m.end_date ? fmtDate(m.end_date) : "ללא תאריך סיום"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">מסלול</dt><dd>{plan?.name ?? m.display_name} · {fmtMoney(m.price)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">תדירות חיוב</dt><dd>{plan ? BILLING[plan.billing_period] ?? plan.billing_period : "לא ידוע"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">סניף מורשה</dt><dd>{branchName(m.branch_id)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">יתרות וזכאויות</dt><dd className="text-muted-foreground">אין נתוני זכאות במערכת</dd></div>
              {freeze && <div><dt className="text-xs text-muted-foreground">הקפאה</dt><dd className="num">{fmtDate(freeze.start_date)} – {fmtDate(freeze.end_date)}</dd></div>}
              {scheduled && <div className="col-span-2"><dt className="text-xs text-muted-foreground">ביטול מתוכנן</dt><dd>
                המנוי פעיל עד <span className="num">{fmtDate(m.scheduled_cancel_date)}</span>{m.cancel_reason && <> · {m.cancel_reason}</>}
                {m.cancel_override_reason && <span className="block text-xs text-attention">חריגה מתקופת ההודעה: {m.cancel_override_reason}</span>}
              </dd></div>}
              {m.status === "CANCELLED" && <div className="col-span-2"><dt className="text-xs text-muted-foreground">ביטול</dt><dd>
                {m.cancelled_at ? <>בתוקף מ־<span className="num">{fmtDate(m.cancelled_at)}</span></> : <span className="text-attention">חסר תאריך ביטול</span>}
                {m.cancel_reason && <> · {m.cancel_reason}</>}{m.cancel_performed_at && <span className="text-xs text-muted-foreground"> · בוצע <span className="num">{fmtDate(m.cancel_performed_at)}</span></span>}
              </dd></div>}
            </dl>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">{orgId && "חיוב שנכשל מוצג כסטטוס פיננסי נפרד ואינו משנה את סטטוס המנוי."}</p>
    </div>
  );
}

/* ---------- Cancellation requests list ---------- */
export function CancelRequestsPanel({ requests, memberships, onSaved }: { requests: Req[]; memberships: Membership[]; onSaved: () => void }) {
  const { isManager, members, memberName } = useOrg();
  async function setStatus(r: Req, status: string) {
    const { error } = await supabase.rpc("update_cancellation_request", { _request: r.id, _status: status, _assigned: r.assigned_member_id as string, _note: "" });
    if (error) return toast.error(friendlyError(error));
    toast.success("סטטוס הבקשה עודכן");
    onSaved();
  }
  if (!requests.length) return null;
  return (
    <div className="panel">
      <div className="border-b px-4 py-3 text-sm font-medium">בקשות ביטול</div>
      <table className="data-table">
        <thead><tr><th>מנוי</th><th>התקבלה</th><th>בתוקף מ־</th><th>סיבה</th><th>מטפל</th><th>סטטוס</th><th /></tr></thead>
        <tbody>{requests.map((r) => {
          const m = memberships.find((x) => x.id === r.membership_id);
          const openR = ["OPEN", "IN_PROGRESS"].includes(r.status);
          return (
            <tr key={r.id}>
              <td>{m?.display_name ?? "—"}</td>
              <td className="num">{fmtDate(r.requested_at)}</td>
              <td className="num">{r.effective_date ? fmtDate(r.effective_date) : "—"}</td>
              <td>{r.reason}{r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}</td>
              <td>{r.assigned_member_id ? memberName(r.assigned_member_id) : members.find((x) => x.user_id === r.created_by)?.display_name ?? "—"}</td>
              <td><StatusBadge tone={openR ? "attention" : r.status === "HANDLED" ? "ok" : "neutral"}>{REQUEST_STATUS[r.status]}</StatusBadge></td>
              <td className="text-end">{isManager && openR && (
                <Select value={r.status} onValueChange={(v) => setStatus(r, v)}>
                  <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(REQUEST_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              )}</td>
            </tr>
          );
        })}</tbody>
      </table>
      {!isManager && <p className="px-4 py-2 text-xs text-muted-foreground">עדכון סטטוס בקשה וביצוע ביטול — למנהל סניף ומעלה.</p>}
    </div>
  );
}

/* ---------- Card health ---------- */
export function CardHealthPanel({ issues, tasks, onFix }: { issues: HealthIssue[]; tasks: { title: string; status: string; assigned_member_id: string | null; rule_key: string | null }[]; onFix: (i: HealthIssue) => React.ReactNode }) {
  const { memberName } = useOrg();
  const cats = Object.keys(CATEGORY_LABEL) as HealthCategory[];
  const sev = (s: string) => (s === "BLOCKS_ENTRY" ? "CRITICAL" : s === "URGENT" ? "HIGH" : "ATTENTION") as "HIGH";
  const RULE: Record<HealthCategory, string[]> = { HEALTH: ["MISSING_COMPLIANCE", "HEALTH_EXPIRED"], DOCS: ["MISSING_COMPLIANCE"], FAILED_PAYMENT: ["FAILED_PAYMENT"], PAYMENT_METHOD: ["MISSING_COMPLIANCE"], PERSONAL: [] };
  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">תקינות כרטיס</span>
        {issues.length ? <SeverityBadge severity="HIGH" label={`${issues.length} ליקויים`} /> : <SeverityBadge severity="OK" label="הכרטיס תקין" />}
      </div>
      <ul className="divide-y">
        {cats.map((cat) => {
          const list = issues.filter((i) => i.category === cat);
          return (
            <li key={cat} className="px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between"><span className="font-medium">{CATEGORY_LABEL[cat]}</span>{!list.length && <SeverityBadge severity="OK" />}</div>
              {list.map((i) => {
                const t = tasks.find((x) => ["OPEN", "IN_PROGRESS"].includes(x.status) && x.rule_key && RULE[cat].includes(x.rule_key));
                return (
                  <div key={i.key} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
                    <SeverityBadge severity={sev(i.severity)} label={SEVERITY_LABEL[i.severity]} />
                    <span className="flex-1">{i.title}
                      <span className="block text-xs text-muted-foreground">
                        זוהה: {i.detectedAt ? <span className="num">{fmtDate(i.detectedAt)}</span> : "בבדיקה הנוכחית"} · אחראי: {t?.assigned_member_id ? memberName(t.assigned_member_id) : "לא שויך"} · סטטוס: {t ? "בטיפול" : "פתוח"}
                      </span>
                    </span>
                    {onFix(i)}
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- Classes ---------- */
export function ClassesPanel({ customerId }: { customerId: string }) {
  const q = useQuery({
    queryKey: ["customer-bookings", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_bookings").select("*, template:class_templates(name,start_time)").eq("customer_id", customerId).order("session_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  const ST: Record<string, string> = { BOOKED: "רשום", WAITLIST: "רשימת המתנה", CANCELLED: "בוטל" };
  return (
    <div className="space-y-3">
      <div className="panel">
        {!q.data?.length ? <EmptyState title="אין הרשמות לשיעורים" text="הרשמה לשיעור נעשית ממסך מערכת השעות." /> : (
          <table className="data-table">
            <thead><tr><th>שיעור</th><th>תאריך</th><th>סטטוס</th><th>נוכחות</th></tr></thead>
            <tbody>{q.data.map((b) => { const t = b.template as { name: string; start_time: string } | null; return (
              <tr key={b.id}><td>{t?.name}</td><td className="num">{fmtDate(b.session_date)} · {t?.start_time?.slice(0, 5)}</td><td>{ST[b.status] ?? b.status}</td><td>{b.attended ? "הגיע" : "—"}</td></tr>); })}</tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">אימונים אישיים ושירותים נוספים: ממתין למודול אימונים אישיים — אין עדיין נתונים במערכת.</p>
    </div>
  );
}

export { Pencil };
