import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { friendlyError } from "@/lib/errors";
import { TICKET_PRIORITY, TICKET_TYPE, fileProblem } from "@/lib/tickets";
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

const blank = (branch: string) => ({ type: "FAULT", title: "", details: "", branch, priority: "MEDIUM", assigned: "", due: "", amount: "", supplier_id: "", supplier_name: "", product_id: "", location: "", equipment: "", quantity: "", approval_kind: "", approver_level: "MANAGER" });

export function TicketDialog({ trigger }: { trigger: ReactNode }) {
  const { org, branches, branchId, members } = useOrg();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [f, setF] = useState(() => blank(branchId ?? branches[0]?.id ?? ""));
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const refs = useQuery({
    enabled: open,
    queryKey: ["ticket-refs", org.id],
    queryFn: async () => {
      const [s, p] = await Promise.all([
        supabase.from("suppliers").select("id,name").eq("organization_id", org.id).eq("active", true).order("name"),
        supabase.from("inventory_products").select("id,name").eq("organization_id", org.id).is("deleted_at", null).order("name").limit(500),
      ]);
      return { suppliers: s.data ?? [], products: p.data ?? [] };
    },
  });
  const needsApproval = f.type !== "FAULT";

  async function save() {
    if (!f.title.trim() || !f.details.trim()) return toast.error("נושא ותיאור הם שדות חובה");
    if (!f.branch) return toast.error("יש לבחור סניף");
    if (f.type === "QUOTE" && !f.amount) return toast.error("בהצעת מחיר יש להזין סכום");
    if (f.type === "PURCHASE" && !f.equipment.trim()) return toast.error("יש לציין את הפריט המבוקש");
    for (const file of files) { const bad = fileProblem(file); if (bad) return toast.error(`${file.name}: ${bad}`); }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_ticket", {
      _org: org.id, _branch: f.branch, _type: f.type, _title: f.title, _details: f.details, _priority: f.priority,
      _data: {
        assigned_member_id: f.assigned, due_at: f.due ? new Date(f.due + "T23:59:00").toISOString() : "", amount: f.amount,
        supplier_id: f.supplier_id, supplier_name: f.supplier_name, product_id: f.product_id, location: f.location,
        equipment: f.equipment, quantity: f.quantity, approval_kind: f.approval_kind, approver_level: f.approver_level,
      },
    });
    if (error) { setBusy(false); return toast.error(friendlyError(error)); }
    const id = data as string;
    if (files.length) await uploadTicketFiles(org.id, id, files);
    setBusy(false);
    toast.success("הקריאה נפתחה");
    setOpen(false);
    navigate({ to: "/tickets/$id", params: { id } });
  }

  const T = (k: keyof typeof f, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5"><Label>{label}</Label><Input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} /></div>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setF(blank(branchId ?? branches[0]?.id ?? "")); setFiles([]); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>קריאה חדשה</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>סוג קריאה *</Label>
            <Select value={f.type} onValueChange={(v) => set("type", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TICKET_TYPE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>עדיפות *</Label>
            <Select value={f.priority} onValueChange={(v) => set("priority", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TICKET_PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
          <div className="col-span-2">{T("title", "נושא *")}</div>
          <div className="col-span-2 space-y-1.5"><Label>תיאור *</Label><Textarea rows={3} value={f.details} onChange={(e) => set("details", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>סניף *</Label>
            <Select value={f.branch} onValueChange={(v) => set("branch", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>עובד אחראי</Label>
            <Select value={f.assigned} onValueChange={(v) => set("assigned", v)}><SelectTrigger><SelectValue placeholder="לא שויך" /></SelectTrigger>
              <SelectContent>{members.filter((m) => m.status === "ACTIVE").map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name ?? m.username}</SelectItem>)}</SelectContent></Select></div>
          {T("due", "מועד יעד", { type: "date" })}

          {f.type === "FAULT" && <>{T("location", "מיקום התקלה")}<div className="col-span-2">{T("equipment", "מכשיר / ציוד קשור")}</div></>}
          {f.type === "PURCHASE" && <>{T("equipment", "פריט מבוקש *")}{T("quantity", "כמות", { type: "number", dir: "ltr" })}{T("amount", "עלות משוערת (₪)", { type: "number", dir: "ltr" })}</>}
          {f.type === "QUOTE" && <>{T("amount", "סכום ההצעה (₪) *", { type: "number", dir: "ltr" })}</>}
          {f.type === "APPROVAL" && <>{T("approval_kind", "סוג האישור")}{T("amount", "סכום (אם רלוונטי)", { type: "number", dir: "ltr" })}</>}
          {(f.type === "PURCHASE" || f.type === "QUOTE") && (
            <div className="space-y-1.5"><Label>ספק</Label>
              <Select value={f.supplier_id || "other"} onValueChange={(v) => set("supplier_id", v === "other" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="other">ספק אחר / לא ידוע</SelectItem>{(refs.data?.suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          )}
          {(f.type === "PURCHASE" || f.type === "QUOTE") && !f.supplier_id && T("supplier_name", "שם ספק")}
          {(f.type === "FAULT" || f.type === "PURCHASE") && (
            <div className="space-y-1.5"><Label>פריט במלאי (לא חובה)</Label>
              <Select value={f.product_id || "none"} onValueChange={(v) => set("product_id", v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">ללא קישור</SelectItem>{(refs.data?.products ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          )}
          {needsApproval && (
            <div className="space-y-1.5"><Label>גורם מאשר</Label>
              <Select value={f.approver_level} onValueChange={(v) => set("approver_level", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="MANAGER">מנהל סניף</SelectItem><SelectItem value="HQ">מטה</SelectItem></SelectContent></Select></div>
          )}
          <div className="col-span-2 space-y-1.5"><Label>קבצים מצורפים (תמונה / PDF, עד 10MB)</Label>
            <Input type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {!!files.length && <p className="text-xs text-muted-foreground">{files.map((x) => x.name).join(", ")}</p>}</div>
          {needsApproval && <p className="col-span-2 text-xs text-muted-foreground">הקריאה תישלח לאישור. אישור אינו מבצע רכישה, תשלום או תנועת מלאי אוטומטית.</p>}
        </div>
        <DialogFooter className="gap-2"><Button onClick={save} disabled={busy}>{busy ? "שומר…" : "פתח קריאה"}</Button><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
