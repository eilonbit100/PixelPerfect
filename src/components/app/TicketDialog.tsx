import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { friendlyError } from "@/lib/errors";
import { TICKET_PRIORITY, TICKET_TYPE, fileProblem, ticketFormErrors, TYPE_FIELDS } from "@/lib/tickets";
import { LinkPicker } from "@/components/app/TicketLinks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export async function uploadTicketFiles(orgId: string, ticketId: string, files: File[]) {
  let ok = 0;
  for (const f of files) {
    const bad = fileProblem(f);
    if (bad) { toast.error(`${f.name}: ${bad}`); continue; }
    const path = `${orgId}/${ticketId}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
    const up = await supabase.storage.from("ticket-files").upload(path, f, { contentType: f.type });
    if (up.error) { toast.error(`${f.name}: ההעלאה נכשלה`); continue; }
    const { error } = await supabase.rpc("ticket_add_file", { _t: ticketId, _path: path, _name: f.name, _mime: f.type, _size: f.size });
    if (error) { toast.error(friendlyError(error)); continue; }
    ok++;
  }
  return ok;
}

const blank = (branch: string) => ({ type: "FAULT", title: "", details: "", branch, priority: "MEDIUM", assigned: "", due: "", amount: "", supplier_id: "", supplier_name: "", product_id: "", location: "", equipment: "", quantity: "", approval_kind: "", approver_level: "MANAGER", customer_id: "", task_id: "" });
type Form = ReturnType<typeof blank>;

function Field({ err, label, children, wide }: { err?: string; label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={"space-y-1.5" + (wide ? " sm:col-span-2" : "")}>
      <Label>{label}</Label>{children}
      {err && <p className="text-xs text-critical">{err}</p>}
    </div>
  );
}

export function TicketDialog({ trigger, preset }: { trigger: ReactNode; preset?: Partial<Form> }) {
  const { org, branches, branchId, members } = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [f, setF] = useState<Form>(() => ({ ...blank(branchId ?? branches[0]?.id ?? ""), ...preset }));
  const set = (k: keyof Form, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const show = TYPE_FIELDS[f.type] ?? [];
  const has = (k: string) => show.includes(k);
  const refs = useQuery({
    enabled: open,
    queryKey: ["ticket-refs", org.id],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id,name").eq("organization_id", org.id).eq("active", true).order("name");
      return { suppliers: data ?? [] };
    },
  });

  async function save() {
    const e = ticketFormErrors(f);
    setErrs(e);
    if (Object.keys(e).length) return toast.error("יש להשלים את השדות המסומנים");
    for (const file of files) { const bad = fileProblem(file); if (bad) return toast.error(`${file.name}: ${bad}`); }
    // Only send fields relevant to the chosen type.
    const pick = (k: keyof Form) => (has(k) ? f[k] : "");
    setBusy(true);
    const { data, error } = await supabase.rpc("create_ticket", {
      _org: org.id, _branch: f.branch, _type: f.type, _title: f.title, _details: f.details, _priority: f.priority,
      _data: {
        assigned_member_id: f.assigned, due_at: f.due ? new Date(f.due + "T23:59:00").toISOString() : "", amount: pick("amount"),
        supplier_id: pick("supplier_id"), supplier_name: pick("supplier_id") ? "" : pick("supplier_name"), product_id: f.product_id, location: pick("location"),
        equipment: pick("equipment"), quantity: pick("quantity"), approval_kind: pick("approval_kind"), approver_level: f.approver_level,
        customer_id: f.customer_id, task_id: f.task_id,
      },
    });
    if (error) { setBusy(false); return toast.error(friendlyError(error)); }
    const id = data as string;
    if (files.length) await uploadTicketFiles(org.id, id, files);
    setBusy(false);
    toast.success("הקריאה נפתחה");
    qc.invalidateQueries({ queryKey: ["tickets"] });
    setOpen(false);
    navigate({ to: "/tickets/$id", params: { id } });
  }

  const inp = (k: keyof Form, props: Record<string, unknown> = {}) => (
    <Input value={f[k]} aria-invalid={!!errs[k]} onChange={(e) => set(k, e.target.value)} {...props} />
  );
  const otherEquip = has("equipment") && f.type === "FAULT";

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setF({ ...blank(branchId ?? branches[0]?.id ?? ""), ...preset }); setFiles([]); setErrs({}); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>קריאה חדשה</DialogTitle></DialogHeader>

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="סוג קריאה">
          {Object.entries(TICKET_TYPE).map(([k, v]) => (
            <button key={k} type="button" role="radio" aria-checked={f.type === k} onClick={() => set("type", k)}
              className={"rounded-md border px-3 py-1.5 text-sm transition-colors " + (f.type === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{v}</button>
          ))}
        </div>

        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <Field err={errs.title} label="נושא *" wide>{inp("title")}</Field>
          <Field err={errs.details} label="תיאור *" wide><Textarea rows={2} value={f.details} aria-invalid={!!errs.details} onChange={(e) => set("details", e.target.value)} /></Field>
          <Field err={errs.branch} label="סניף *">
            <Select value={f.branch} onValueChange={(v) => set("branch", v)}><SelectTrigger><SelectValue placeholder="בחר סניף" /></SelectTrigger>
              <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="עדיפות *">
            <Select value={f.priority} onValueChange={(v) => set("priority", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TICKET_PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="אחראי לטיפול">
            <Select value={f.assigned || "none"} onValueChange={(v) => set("assigned", v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">לא שויך</SelectItem>{members.filter((m) => m.status === "ACTIVE").map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name ?? m.username}</SelectItem>)}</SelectContent></Select></Field>
          <Field err={errs.due} label="מועד יעד">{inp("due", { type: "date", lang: "he-IL", dir: "rtl" })}</Field>

          {has("location") && <Field label="מיקום התקלה">{inp("location", { placeholder: "לדוגמה: אולם משקולות" })}</Field>}
          {has("product") && <Field label={f.type === "FAULT" ? "מכשיר / ציוד רשום" : "פריט מהמלאי"}><LinkPicker kind="product" value={f.product_id} onChange={(v) => set("product_id", v)} /></Field>}
          {otherEquip && <Field label="ציוד שאינו רשום" wide>{inp("equipment", { placeholder: "תיאור הציוד, אם אינו ברשימה" })}</Field>}
          {f.type === "PURCHASE" && <Field err={errs.equipment} label="פריט מבוקש *">{inp("equipment")}</Field>}
          {has("quantity") && <Field err={errs.quantity} label="כמות">{inp("quantity", { type: "number", min: 1, dir: "ltr" })}</Field>}
          {has("supplier_id") && <Field label="ספק">
            <Select value={f.supplier_id || "other"} onValueChange={(v) => set("supplier_id", v === "other" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="other">ספק אחר / לא רשום</SelectItem>{(refs.data?.suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></Field>}
          {has("supplier_id") && !f.supplier_id && <Field err={errs.supplier_name} label="שם ספק">{inp("supplier_name")}</Field>}
          {has("amount") && <Field err={errs.amount} label={f.type === "QUOTE" ? "סכום ההצעה (₪) *" : f.type === "PURCHASE" ? "עלות משוערת (₪)" : "סכום (אם רלוונטי)"}>{inp("amount", { type: "number", min: 0, dir: "ltr" })}</Field>}
          {has("approval_kind") && <Field err={errs.approval_kind} label="סוג האישור *">{inp("approval_kind", { placeholder: "לדוגמה: חריגה ממדיניות" })}</Field>}
          {has("approver") && <Field label="גורם מאשר">
            <Select value={f.approver_level} onValueChange={(v) => set("approver_level", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="MANAGER">מנהל סניף</SelectItem><SelectItem value="HQ">מטה</SelectItem></SelectContent></Select></Field>}

          <Field label="קישור לכרטיס לקוח"><LinkPicker kind="customer" value={f.customer_id} onChange={(v) => set("customer_id", v)} /></Field>
          <Field label="קישור למשימה"><LinkPicker kind="task" value={f.task_id} onChange={(v) => set("task_id", v)} /></Field>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{f.type === "QUOTE" ? "מסמך הצעת מחיר וקבצים" : f.type === "APPROVAL" ? "מסמכים תומכים" : "קבצים מצורפים"}</Label>
            <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => {
              const add = Array.from(e.target.files ?? []); e.target.value = "";
              for (const x of add) { const bad = fileProblem(x); if (bad) toast.error(`${x.name}: ${bad}`); }
              setFiles((cur) => [...cur, ...add.filter((x) => !fileProblem(x))]);
            }} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Paperclip className="size-4" /> בחירת קבצים</Button>
            <span className="ms-2 text-xs text-muted-foreground">תמונה או PDF, עד 10MB לקובץ</span>
            {!!files.length && <ul className="mt-2 flex flex-wrap gap-2">{files.map((x, i) => (
              <li key={i} className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs">
                {x.type === "application/pdf" ? <FileText className="size-3.5" /> : <ImageIcon className="size-3.5" />}
                <span className="max-w-40 truncate">{x.name}</span><span className="num text-muted-foreground">{(x.size / 1024).toFixed(0)}KB</span>
                <button type="button" aria-label={`הסרת ${x.name}`} onClick={() => setFiles((c) => c.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-critical"><X className="size-3.5" /></button>
              </li>))}</ul>}
          </div>
        </div>
        {has("approver") && <p className="text-xs text-muted-foreground">הקריאה תישלח לאישור. האישור אינו סוגר את הקריאה ואינו מבצע רכישה, תשלום או תנועת מלאי.</p>}
        <DialogFooter className="gap-2"><Button onClick={save} disabled={busy}>{busy ? "שומר…" : "פתח קריאה"}</Button><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
