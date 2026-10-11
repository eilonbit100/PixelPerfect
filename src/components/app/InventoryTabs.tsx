import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { friendlyError, errorCode } from "@/lib/errors";
import { TX_TYPE, fmtDateTime, fmtNum } from "@/lib/format";
import { StatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const COUNT_STATUS: Record<string, { label: string; tone: "primary" | "ok" | "neutral" }> = {
  OPEN: { label: "פתוחה", tone: "primary" }, APPROVED: { label: "אושרה", tone: "ok" }, CANCELLED: { label: "בוטלה", tone: "neutral" },
};

export function CountsTab() {
  const { org, branchId, branches, branchName, memberName } = useOrg();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [branch, setBranch] = useState(branchId ?? branches[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["stock-counts", org.id, branchId],
    queryFn: async () => {
      let r = supabase.from("stock_counts").select("*, stock_count_lines(counted_qty, system_qty)").eq("organization_id", org.id).order("opened_at", { ascending: false }).limit(100);
      if (branchId) r = r.eq("branch_id", branchId);
      const { data, error } = await r; if (error) throw error; return data;
    },
  });
  async function create() {
    setBusy(true);
    const { data, error } = await supabase.rpc("open_stock_count", { _branch: branch, _note: note || undefined });
    setBusy(false);
    if (error) return toast.error(errorCode(error) === "COUNT_ALREADY_OPEN" ? "כבר קיימת ספירה פתוחה בסניף הזה" : friendlyError(error));
    setOpen(false);
    navigate({ to: "/inventory/counts/$id", params: { id: data as string } });
  }
  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">ספירות מלאי</span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="size-4" /> פתיחת ספירה</Button></DialogTrigger>
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader><DialogTitle>פתיחת ספירת מלאי</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>סניף</Label>
                <Select value={branch} onValueChange={setBranch}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>הערה</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="לדוגמה: ספירה חודשית" /></div>
              <p className="text-xs text-muted-foreground">כל מוצרי המדף הפעילים ייכנסו לספירה עם הכמות שבמערכת ברגע הפתיחה. היתרה לא תשתנה עד שמנהל יאשר.</p>
            </div>
            <DialogFooter className="gap-2"><Button disabled={busy || !branch} onClick={create}>פתח ספירה</Button><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {q.isLoading ? <TableSkeleton cols={6} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="אין ספירות עדיין" text="פתח ספירה כדי להשוות כמות בפועל למערכת." /> : (
        <table className="data-table">
          <thead><tr><th>נפתחה</th><th>סניף</th><th>סטטוס</th><th className="text-end">נספרו</th><th className="text-end">פערים</th><th>אישר</th></tr></thead>
          <tbody>{q.data.map((c) => {
            const lines = c.stock_count_lines ?? [];
            const counted = lines.filter((l) => l.counted_qty != null);
            const gaps = counted.filter((l) => Number(l.counted_qty) !== Number(l.system_qty)).length;
            return (
              <tr key={c.id} className="cursor-pointer" onClick={() => navigate({ to: "/inventory/counts/$id", params: { id: c.id } })}>
                <td className="num"><Link to="/inventory/counts/$id" params={{ id: c.id }} onClick={(e) => e.stopPropagation()}>{fmtDateTime(c.opened_at)}</Link>{c.note && <span className="block text-xs text-muted-foreground">{c.note}</span>}</td>
                <td>{branchName(c.branch_id)}</td>
                <td><StatusBadge tone={COUNT_STATUS[c.status]?.tone}>{COUNT_STATUS[c.status]?.label}</StatusBadge></td>
                <td className="num text-end">{counted.length} / {lines.length}</td>
                <td className={"num text-end " + (gaps ? "text-warning" : "")}>{gaps}</td>
                <td className="text-muted-foreground">{c.approved_by ? memberName(c.approved_by) : "—"}</td>
              </tr>);
          })}</tbody>
        </table>
      )}
    </div>
  );
}

export function MovementsTab() {
  const { org, branchId, branchName } = useOrg();
  const [type, setType] = useState("all");
  const q = useQuery({
    queryKey: ["inv-movements", org.id, branchId, type],
    queryFn: async () => {
      let r = supabase.from("inventory_transactions").select("*, inventory_products(name)").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(200);
      if (branchId) r = r.eq("branch_id", branchId);
      if (type !== "all") r = r.eq("transaction_type", type);
      const { data, error } = await r; if (error) throw error; return data;
    },
  });
  async function openDoc(path: string) {
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("inventory-docs").createSignedUrl(path, 120);
    if (error || !data) { w?.close(); return toast.error("לא ניתן לפתוח את הקובץ"); }
    if (w) w.location.href = data.signedUrl; else window.location.assign(data.signedUrl);
  }
  return (
    <div className="panel overflow-x-auto">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <span className="text-sm font-medium">תנועות אחרונות</span>
        <Select value={type} onValueChange={setType}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל הסוגים</SelectItem>{Object.entries(TX_TYPE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      </div>
      {q.isLoading ? <TableSkeleton cols={8} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="אין תנועות" /> : (
        <table className="data-table">
          <thead><tr><th>מועד</th><th>מוצר</th><th>סוג</th><th>סניף</th><th className="text-end">שינוי</th><th className="text-end">אחרי</th><th>סיבה</th><th>אסמכתה</th></tr></thead>
          <tbody>{q.data.map((x) => (
            <tr key={x.id}>
              <td className="num text-muted-foreground">{fmtDateTime(x.created_at)}</td>
              <td><Link to="/inventory/$id" params={{ id: x.product_id }} className="hover:underline">{x.inventory_products?.name}</Link></td>
              <td>{TX_TYPE[x.transaction_type]}</td>
              <td>{branchName(x.branch_id)}</td>
              <td className={"num text-end " + (x.quantity_delta < 0 ? "text-critical" : "text-ok")}>{x.quantity_delta > 0 ? "+" : ""}{fmtNum(x.quantity_delta)}</td>
              <td className="num text-end">{fmtNum(x.stock_after)}</td>
              <td className="text-muted-foreground">{x.reason ?? x.override_reason ?? x.notes ?? ""}</td>
              <td>{x.reference}{x.document_path && <Button size="sm" variant="ghost" onClick={() => openDoc(x.document_path!)}><Eye className="size-4" /> קובץ</Button>}</td>
            </tr>))}</tbody>
        </table>
      )}
    </div>
  );
}

type Supplier = { id: string; name: string; phone: string | null; email: string | null; active: boolean; default_return_window_days: number | null; lead_time_days: number | null; expired_return_policy: string | null; notes: string | null };

function SupplierDialog({ s, trigger }: { s?: Supplier; trigger: React.ReactNode }) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(() => ({ name: s?.name ?? "", phone: s?.phone ?? "", email: s?.email ?? "", ret: s?.default_return_window_days?.toString() ?? "", lead: s?.lead_time_days?.toString() ?? "", policy: s?.expired_return_policy ?? "", notes: s?.notes ?? "" }));
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!f.name.trim()) return toast.error("יש להזין שם ספק");
    const row = { name: f.name.trim(), phone: f.phone || null, email: f.email || null, default_return_window_days: f.ret ? Number(f.ret) : null, lead_time_days: f.lead ? Number(f.lead) : null, expired_return_policy: f.policy || null, notes: f.notes || null };
    const { error } = s ? await supabase.from("suppliers").update(row).eq("id", s.id) : await supabase.from("suppliers").insert({ ...row, organization_id: org.id });
    if (error) return toast.error(friendlyError(error));
    toast.success("הספק נשמר"); setOpen(false); qc.invalidateQueries({ queryKey: ["suppliers"] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{s ? "עריכת ספק" : "ספק חדש"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label>שם *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>טלפון</Label><Input dir="ltr" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>דוא״ל</Label><Input dir="ltr" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>ימים מותרים להחזרה</Label><Input type="number" min={0} value={f.ret} onChange={(e) => set("ret", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>זמן אספקה (ימים)</Label><Input type="number" min={0} value={f.lead} onChange={(e) => set("lead", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>מדיניות מוצרים שפג תוקפם / מתקרבים לתפוגה</Label><Textarea rows={2} value={f.policy} onChange={(e) => set("policy", e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>הערות</Label><Input value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2"><Button onClick={save}>שמירה</Button><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SuppliersTab() {
  const { org, isAdmin } = useOrg();
  const q = useQuery({
    queryKey: ["suppliers", org.id],
    queryFn: async () => {
      const [s, p, r] = await Promise.all([
        supabase.from("suppliers").select("*").eq("organization_id", org.id).order("name"),
        supabase.from("inventory_products").select("default_supplier_id").eq("organization_id", org.id).is("deleted_at", null),
        supabase.from("inventory_transactions").select("metadata").eq("organization_id", org.id).eq("transaction_type", "RETURN_TO_SUPPLIER"),
      ]);
      if (s.error) throw s.error;
      const prods = new Map<string, number>(); (p.data ?? []).forEach((x) => x.default_supplier_id && prods.set(x.default_supplier_id, (prods.get(x.default_supplier_id) ?? 0) + 1));
      const rets = new Map<string, number>(); (r.data ?? []).forEach((x) => { const id = (x.metadata as Record<string, string> | null)?.supplier_id; if (id) rets.set(id, (rets.get(id) ?? 0) + 1); });
      return { suppliers: s.data as Supplier[], prods, rets };
    },
  });
  return (
    <div className="panel overflow-x-auto">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">ספקים ותנאי החזרה</span>
        {isAdmin && <SupplierDialog trigger={<Button size="sm"><Plus className="size-4" /> ספק חדש</Button>} />}
      </div>
      {q.isLoading ? <TableSkeleton cols={6} /> : q.error ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.suppliers.length ? <EmptyState title="אין ספקים" /> : (
        <table className="data-table">
          <thead><tr><th>ספק</th><th>קשר</th><th className="text-end">ימי החזרה</th><th className="text-end">זמן אספקה</th><th>מדיניות תפוגה</th><th className="text-end">מוצרים</th><th className="text-end">החזרות</th><th /></tr></thead>
          <tbody>{q.data.suppliers.map((s) => (
            <tr key={s.id}>
              <td className="font-medium">{s.name}{!s.active && <StatusBadge className="ms-2">לא פעיל</StatusBadge>}</td>
              <td className="num text-muted-foreground" dir="ltr">{[s.phone, s.email].filter(Boolean).join(" · ") || "—"}</td>
              <td className="num text-end">{s.default_return_window_days ?? "—"}</td>
              <td className="num text-end">{s.lead_time_days != null ? `${s.lead_time_days} ימים` : "—"}</td>
              <td className="max-w-56 truncate text-muted-foreground">{s.expired_return_policy ?? "—"}</td>
              <td className="num text-end">{q.data.prods.get(s.id) ?? 0}</td>
              <td className="num text-end">{q.data.rets.get(s.id) ?? 0}</td>
              <td className="text-end">{isAdmin && <SupplierDialog s={s} trigger={<Button size="sm" variant="ghost">עריכה</Button>} />}</td>
            </tr>))}</tbody>
        </table>
      )}
    </div>
  );
}
