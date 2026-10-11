import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ProductRow = {
  id: string; name: string; sku: string | null; barcode: string | null; category: string | null; subcategory: string | null; brand: string | null;
  variant: string | null; kind: string; status: string; cost: number | null; price: number | null; track_expiry: boolean; returnable: boolean;
  default_supplier_id: string | null; import_code: string | null; return_window_days: number | null;
};

/** Catalog editing — HQ only (enforced by database policy). */
export function ProductEditDialog({ p, trigger }: { p?: ProductRow; trigger: ReactNode }) {
  const { org } = useOrg();
  const invalidate = useInvalidateAll();
  const [open, setOpen] = useState(false);
  const init = () => ({
    name: p?.name ?? "", sku: p?.sku ?? "", barcode: p?.barcode ?? "", category: p?.category ?? "", subcategory: p?.subcategory ?? "", brand: p?.brand ?? "",
    variant: p?.variant ?? "", kind: p?.kind ?? "SHELF", status: p?.status ?? "ACTIVE", cost: p?.cost?.toString() ?? "", price: p?.price?.toString() ?? "",
    track_expiry: p?.track_expiry ?? false, returnable: p?.returnable ?? false, supplier: p?.default_supplier_id ?? "",
    return_window_days: p?.return_window_days?.toString() ?? "",
  });
  const [f, setF] = useState(init);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const sup = useQuery({ enabled: open, queryKey: ["suppliers-min", org.id], queryFn: async () => (await supabase.from("suppliers").select("id,name").eq("organization_id", org.id).order("name")).data ?? [] });
  async function save() {
    if (!f.name.trim()) return toast.error("יש להזין שם מוצר");
    if (f.cost && Number(f.cost) < 0) return toast.error("עלות לא יכולה להיות שלילית");
    if (f.price && Number(f.price) < 0) return toast.error("מחיר לא יכול להיות שלילי");
    if (f.return_window_days && (!Number.isInteger(Number(f.return_window_days)) || Number(f.return_window_days) < 0)) return toast.error("חלון החזרה חייב להיות מספר ימים שלם, 0 ומעלה");
    const row = {
      name: f.name.trim(), sku: f.sku || null, barcode: f.barcode || null, category: f.category || null, subcategory: f.subcategory || null, brand: f.brand || null,
      variant: f.variant || null, kind: f.kind, status: f.status, cost: f.cost === "" ? null : Number(f.cost), price: f.price === "" ? null : Number(f.price),
      track_expiry: f.track_expiry, returnable: f.returnable, default_supplier_id: f.supplier || null,
      return_window_days: f.return_window_days === "" ? null : Number(f.return_window_days),
    };
    const { error } = p ? await supabase.from("inventory_products").update(row).eq("id", p.id) : await supabase.from("inventory_products").insert({ ...row, organization_id: org.id });
    if (error) return toast.error(friendlyError(error));
    toast.success("המוצר נשמר"); setOpen(false); invalidate();
  }
  const T = (k: "name" | "sku" | "barcode" | "category" | "subcategory" | "brand" | "variant" | "cost" | "price" | "return_window_days", label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5"><Label>{label}</Label><Input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} /></div>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(init()); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{p ? "עריכת מוצר" : "מוצר חדש"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">{T("name", "שם מוצר *")}</div>
          <div className="space-y-1.5"><Label>סוג</Label>
            <Select value={f.kind} onValueChange={(v) => set("kind", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="SHELF">מוצר מדף (למכירה)</SelectItem><SelectItem value="EQUIPMENT">ציוד קבוע</SelectItem></SelectContent></Select></div>
          {T("brand", "מותג")}{T("category", "קטגוריה")}{T("subcategory", "תת־קטגוריה")}
          {T("variant", "טעם / משקל / נפח")}{T("sku", "מק״ט פנימי", { dir: "ltr" })}{T("barcode", "ברקוד", { dir: "ltr" })}
          {T("cost", "עלות רכישה (₪)", { type: "number", min: 0, dir: "ltr" })}{T("price", "מחיר מכירה (₪)", { type: "number", min: 0, dir: "ltr" })}
          <div className="space-y-1.5"><Label>ספק ברירת מחדל</Label>
            <Select value={f.supplier || "none"} onValueChange={(v) => set("supplier", v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">ללא</SelectItem>{(sup.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5">
            {T("return_window_days", "חלון החזרה (ימים)", { type: "number", min: 0, step: 1, dir: "ltr", placeholder: "לפי ברירת המחדל של הספק", disabled: !f.returnable })}
            <p className="text-xs text-muted-foreground">ערך ריק משתמש בחלון ההחזרה של הספק. חל על קליטות חדשות.</p>
          </div>
          <div className="space-y-1.5"><Label>סטטוס</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ACTIVE">פעיל</SelectItem><SelectItem value="INACTIVE">לא פעיל</SelectItem></SelectContent></Select></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.track_expiry} onCheckedChange={(v) => set("track_expiry", v)} /> ניהול תוקף לפי אצוות</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.returnable} onCheckedChange={(v) => set("returnable", v)} /> ניתן להחזרה לספק</label>
          {p?.import_code && <p className="text-xs text-muted-foreground sm:col-span-3">קוד פריט מיובא: <span className="num">{p.import_code}</span></p>}
        </div>
        <DialogFooter className="gap-2"><Button onClick={save}>שמירה</Button><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
