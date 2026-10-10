import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Download, Eye, FileUp, Lock, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { friendlyError } from "@/lib/errors";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { EVENT_LABEL, TICKET_PRIORITY, TICKET_STATUS, TICKET_TYPE, isOverdue } from "@/lib/tickets";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { StatusBadge } from "@/components/app/badges";
import { uploadTicketFiles } from "@/components/app/TicketDialog";
import { LinkPicker } from "@/components/app/TicketLinks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_shell/tickets/$id")({
  head: () => ({ meta: [
    { title: "פרטי קריאה — Pulse" }, { name: "description", content: "פרטי קריאה, קבצים, הערות והיסטוריית טיפול." },
    { property: "og:title", content: "פרטי קריאה — Pulse" }, { property: "og:description", content: "פרטי קריאה והיסטוריית טיפול." },
  ] }),
  component: TicketPage,
});

function TicketPage() {
  const { id } = Route.useParams();
  const { org, me, members, memberName, branchName, isManager, isAdmin } = useOrg();
  const qc = useQueryClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState("");
  const [ask, setAsk] = useState<null | "reject" | "close">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [editLinks, setEditLinks] = useState(false);

  const q = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const [t, ev, fl] = await Promise.all([
        supabase.from("approval_requests").select("*").eq("id", id).maybeSingle(),
        supabase.from("ticket_events").select("*").eq("ticket_id", id).order("created_at", { ascending: false }),
        supabase.from("ticket_files").select("*").eq("ticket_id", id).order("created_at"),
      ]);
      for (const r of [t, ev, fl]) if (r.error) throw r.error;
      let supplier: string | null = null, product: string | null = null;
      if (t.data?.supplier_id) supplier = (await supabase.from("suppliers").select("name").eq("id", t.data.supplier_id).maybeSingle()).data?.name ?? null;
      if (t.data?.product_id) product = (await supabase.from("inventory_products").select("name").eq("id", t.data.product_id).maybeSingle()).data?.name ?? null;
      let customer: string | null = null, task: string | null = null;
      if (t.data?.customer_id) customer = (await supabase.from("customers").select("full_name").eq("id", t.data.customer_id).maybeSingle()).data?.full_name ?? null;
      if (t.data?.task_id) task = (await supabase.from("tasks").select("title").eq("id", t.data.task_id).maybeSingle()).data?.title ?? null;
      return { t: t.data, ev: ev.data!, fl: fl.data!, supplier, product, customer, task };
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["ticket", id] }); qc.invalidateQueries({ queryKey: ["tickets"] }); qc.invalidateQueries({ queryKey: ["approvals-pending"] }); };

  if (q.isLoading) return <TableSkeleton rows={6} cols={2} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  const { t, ev, fl, supplier, product, customer, task } = q.data!;
  if (!t) return <EmptyState title="הקריאה לא נמצאה או שאין לך הרשאה לצפות בה" action={<Link to="/tickets" className="text-primary">חזרה לקריאות</Link>} />;

  const closed = t.status === "CLOSED";
  const mine = t.assigned_member_id === me.id;
  const canManage = isAdmin || isManager;
  const canDecide = t.status === "PENDING_APPROVAL" && (t.approver_level === "HQ" ? isAdmin : canManage) && (isAdmin || t.requested_by !== me.id);
  const late = isOverdue(t);
  const statusOptions = canManage ? ["OPEN", "IN_PROGRESS", "PENDING_APPROVAL", "COMPLETED"] : mine ? ["IN_PROGRESS", "COMPLETED"] : [];

  async function rpc(name: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { error } = await supabase.rpc(name as never, args as never);
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return false; }
    toast.success(ok);
    refresh();
    return true;
  }
  const update = (field: string, value: string, ok: string) => rpc("ticket_update", { _t: id, _field: field, _value: value }, ok);
  async function openFile(path: string, download: boolean) {
    const { data, error } = await supabase.storage.from("ticket-files").createSignedUrl(path, 120, download ? { download: true } : undefined);
    if (error) return toast.error("לא ניתן לפתוח את הקובץ");
    window.open(data.signedUrl, "_blank");
  }
  async function submitAsk() {
    if (!reason.trim()) return toast.error(ask === "reject" ? "חובה לציין סיבת דחייה" : "חובה להזין סיכום טיפול");
    const ok = ask === "reject"
      ? await rpc("ticket_decide", { _t: id, _approve: false, _reason: reason }, "הבקשה נדחתה")
      : await rpc("ticket_close", { _t: id, _summary: reason }, "הקריאה נסגרה");
    if (ok) { setAsk(null); setReason(""); }
  }
  const who = (mid: string | null) => (mid ? memberName(mid) : "מערכת");
  const evDetail = (e: (typeof ev)[number]) => {
    const m = (e.metadata ?? {}) as Record<string, string | null>;
    if (e.event_type === "STATUS" || e.event_type === "REOPENED") return `${TICKET_STATUS[m.from ?? ""]?.label ?? m.from} ← ${TICKET_STATUS[m.to ?? ""]?.label ?? m.to}`;
    if (e.event_type === "PRIORITY") return `${TICKET_PRIORITY[m.from ?? ""]} ← ${TICKET_PRIORITY[m.to ?? ""]}`;
    if (e.event_type === "ASSIGNED") return `${m.from ? memberName(m.from) : "לא שויך"} ← ${m.to ? memberName(m.to) : "לא שויך"}`;
    if (e.event_type === "LINKED") return `${({ customer: "לקוח", task: "משימה", product: "ציוד / מלאי" } as Record<string, string>)[m.kind ?? ""] ?? ""}: ${m.to ? "קושר" : "הקישור הוסר"}`;
    if (e.event_type === "DUE") return `${m.from ? fmtDate(m.from) : "—"} ← ${m.to ? fmtDate(m.to) : "—"}`;
    return e.body ?? "";
  };
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>;

  return (
    <div>
      <button onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/tickets" }))} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> חזרה</button>
      <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={async (e) => {
        const files = Array.from(e.target.files ?? []); e.target.value = "";
        if (!files.length) return;
        setBusy(true); const n = await uploadTicketFiles(org.id, id, files); setBusy(false);
        if (n) { toast.success(`${n} קבצים נוספו`); refresh(); }
      }} />

      <div className="panel mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="num text-muted-foreground">#{t.ticket_no}</span>
              <h1 className="text-xl font-semibold">{t.title}</h1>
              <StatusBadge tone={TICKET_STATUS[t.status]?.tone}>{TICKET_STATUS[t.status]?.label}</StatusBadge>
              {late && <StatusBadge tone="critical">באיחור</StatusBadge>}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{t.details}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canDecide && <>
              <Button disabled={busy} onClick={() => rpc("ticket_decide", { _t: id, _approve: true, _reason: "" }, "הבקשה אושרה")}><Check className="size-4" /> אישור</Button>
              <Button disabled={busy} variant="outline" onClick={() => { setReason(""); setAsk("reject"); }}><X className="size-4" /> דחייה</Button>
            </>}
            {t.status === "PENDING_APPROVAL" && !canDecide && <span className="text-xs text-muted-foreground">ממתינה לאישור {t.approver_level === "HQ" ? "המטה" : "מנהל הסניף"}</span>}
            {canManage && !closed && t.status !== "PENDING_APPROVAL" && <Button disabled={busy} variant="outline" onClick={() => { setReason(""); setAsk("close"); }}><Lock className="size-4" /> סגירת קריאה</Button>}
            {canManage && closed && <Button disabled={busy} variant="outline" onClick={() => update("status", "OPEN", "הקריאה נפתחה מחדש")}>פתיחה מחדש</Button>}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <Row k="סוג" v={TICKET_TYPE[t.ticket_type]} />
          <Row k="סניף" v={branchName(t.branch_id)} />
          <Row k="נפתחה ע״י" v={<>{memberName(t.requested_by)} · <span className="num">{fmtDateTime(t.submitted_at ?? t.created_at)}</span></>} />
          <Row k="גורם מאשר" v={t.ticket_type === "FAULT" ? "לא נדרש" : t.approver_level === "HQ" ? "מטה" : "מנהל סניף"} />
          <Row k="אחראי לטיפול" v={canManage && !closed ? (
            <Select value={t.assigned_member_id ?? "none"} onValueChange={(v) => update("assigned", v === "none" ? "" : v, "האחראי עודכן")}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">לא שויך</SelectItem>{members.filter((m) => m.status === "ACTIVE").map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name ?? m.username}</SelectItem>)}</SelectContent>
            </Select>) : t.assigned_member_id ? memberName(t.assigned_member_id) : "לא שויך"} />
          <Row k="עדיפות" v={canManage && !closed ? (
            <Select value={t.priority} onValueChange={(v) => update("priority", v, "העדיפות עודכנה")}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TICKET_PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>) : TICKET_PRIORITY[t.priority]} />
          <Row k="מועד יעד" v={canManage && !closed ? (
            <Input type="date" className="h-8" defaultValue={t.due_at?.slice(0, 10) ?? ""} onBlur={(e) => { const v = e.target.value; if (v !== (t.due_at?.slice(0, 10) ?? "")) update("due", v ? new Date(v + "T23:59:00").toISOString() : "", "מועד היעד עודכן"); }} />
          ) : <span className={late ? "text-critical" : ""}>{t.due_at ? fmtDate(t.due_at) : "—"}</span>} />
          <Row k="סטטוס" v={statusOptions.length && !closed && !["APPROVED", "REJECTED"].includes(t.status) || (canManage && ["APPROVED", "REJECTED"].includes(t.status)) ? (
            <Select value={statusOptions.includes(t.status) ? t.status : undefined} onValueChange={(v) => update("status", v, "הסטטוס עודכן")}>
              <SelectTrigger className="h-8"><SelectValue placeholder={TICKET_STATUS[t.status]?.label} /></SelectTrigger>
              <SelectContent>{statusOptions.map((k) => <SelectItem key={k} value={k}>{TICKET_STATUS[k].label}</SelectItem>)}</SelectContent>
            </Select>) : TICKET_STATUS[t.status]?.label} />
          {t.amount != null && <Row k="סכום" v={<span className="num">{fmtMoney(t.amount)}</span>} />}
          {(supplier || t.supplier_name) && <Row k="ספק" v={supplier ?? t.supplier_name} />}
          {t.equipment && <Row k={t.ticket_type === "PURCHASE" ? "פריט מבוקש" : "מכשיר / ציוד"} v={t.equipment} />}
          {t.quantity != null && <Row k="כמות" v={<span className="num">{t.quantity}</span>} />}
          {t.location && <Row k="מיקום" v={t.location} />}
          <Row k="אחראי לטיפול / מאשר" v={<span className="text-xs text-muted-foreground">הטיפול והאישור נפרדים — אישור אינו סוגר את הקריאה</span>} />
          {t.approval_kind && <Row k="סוג האישור" v={t.approval_kind} />}
          {t.approved_by && <Row k={t.status === "REJECTED" ? "נדחתה ע״י" : "החלטה ע״י"} v={<>{memberName(t.approved_by)} · <span className="num">{fmtDateTime(t.approved_at)}</span></>} />}
          {t.rejection_reason && <Row k="סיבת דחייה" v={<span className="text-critical">{t.rejection_reason}</span>} />}
        </dl>
        <div className="mt-4 border-t pt-3">
          <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">קישורים</span>
            {!closed && (canManage || mine || t.requested_by === me.id) && <Button size="sm" variant="ghost" onClick={() => setEditLinks((x) => !x)}>{editLinks ? "סיום" : "עריכת קישורים"}</Button>}</div>
          {editLinks ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1"><Label>כרטיס לקוח</Label><LinkPicker kind="customer" value={t.customer_id ?? ""} onChange={(v) => update("customer", v, "הקישור עודכן")} /></div>
              <div className="space-y-1"><Label>משימה</Label><LinkPicker kind="task" value={t.task_id ?? ""} onChange={(v) => update("task", v, "הקישור עודכן")} /></div>
              <div className="space-y-1"><Label>ציוד / מלאי</Label><LinkPicker kind="product" value={t.product_id ?? ""} onChange={(v) => update("product", v, "הקישור עודכן")} /></div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span><span className="text-muted-foreground">לקוח: </span>{customer ? <Link to="/customers/$id" params={{ id: t.customer_id! }} className="text-primary hover:underline">{customer}</Link> : "—"}</span>
              <span><span className="text-muted-foreground">משימה: </span>{task ? <Link to="/tasks" className="text-primary hover:underline">{task}</Link> : "—"}</span>
              <span><span className="text-muted-foreground">ציוד / מלאי: </span>{product ? <Link to="/inventory/$id" params={{ id: t.product_id! }} className="text-primary hover:underline">{product}</Link> : "—"}</span>
            </div>
          )}
        </div>
        {closed && <div className="mt-4 rounded-md bg-muted/60 p-3 text-sm"><div className="text-xs text-muted-foreground">סיכום טיפול · {t.closed_by ? memberName(t.closed_by) : ""} · <span className="num">{fmtDateTime(t.closed_at)}</span></div>{t.close_summary}</div>}
        {t.status === "APPROVED" && <p className="mt-3 text-xs text-muted-foreground">האישור אינו מבצע רכישה, תשלום או תנועת מלאי. יש לעדכן את הסטטוס ולסגור את הקריאה לאחר ביצוע העבודה בפועל.</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="panel">
            <div className="flex items-center justify-between border-b px-4 py-3"><span className="text-sm font-medium">קבצים מצורפים</span>
              {!closed && <Button size="sm" variant="ghost" disabled={busy} onClick={() => fileRef.current?.click()}><FileUp className="size-4" /> העלאת קובץ</Button>}</div>
            {!fl.length ? <p className="px-4 py-3 text-sm text-muted-foreground">אין קבצים.</p> : (
              <ul className="divide-y">{fl.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="truncate">{f.file_name}<span className="block text-xs text-muted-foreground">{memberName(f.uploaded_by)} · <span className="num">{fmtDateTime(f.created_at)}</span> · {(f.size_bytes / 1024).toFixed(0)}KB</span></span>
                  <span className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openFile(f.storage_path, false)}><Eye className="size-4" /> צפייה</Button>
                    <Button size="sm" variant="ghost" onClick={() => openFile(f.storage_path, true)}><Download className="size-4" /> הורדה</Button>
                  </span>
                </li>))}</ul>
            )}
          </div>
          {!closed && (
            <div className="panel space-y-2 p-4">
              <Label>הוספת הערה</Label>
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
              <Button size="sm" disabled={busy || !comment.trim()} onClick={async () => { if (await rpc("ticket_comment", { _t: id, _body: comment }, "ההערה נוספה")) setComment(""); }}>הוסף הערה</Button>
            </div>
          )}
        </div>
        <div className="panel">
          <div className="border-b px-4 py-3 text-sm font-medium">היסטוריית טיפול</div>
          <ol className="divide-y">{ev.map((e) => (
            <li key={e.id} className="px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{EVENT_LABEL[e.event_type] ?? e.event_type}</span><span className="num text-xs text-muted-foreground">{fmtDateTime(e.created_at)}</span></div>
              {evDetail(e) && <div className="whitespace-pre-wrap text-muted-foreground">{evDetail(e)}</div>}
              <div className="text-xs text-muted-foreground">{who(e.performed_by)}</div>
            </li>))}</ol>
        </div>
      </div>

      <Dialog open={!!ask} onOpenChange={(o) => !o && setAsk(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader><DialogTitle>{ask === "reject" ? "דחיית בקשה" : "סגירת קריאה"}</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label>{ask === "reject" ? "סיבת הדחייה *" : "סיכום טיפול *"}</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter className="gap-2"><Button disabled={busy} onClick={submitAsk}>{ask === "reject" ? "דחה" : "סגור קריאה"}</Button><Button variant="ghost" onClick={() => setAsk(null)}>ביטול</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
