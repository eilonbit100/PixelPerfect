import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { errorCode, friendlyError } from "@/lib/errors";
import { TX_TYPE } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function StockDialog({ trigger, productId, productName, defaultType = "RECEIPT", defaultBranch, onReplacement }: {
  trigger: ReactNode; productId: string; productName: string; defaultType?: string; defaultBranch?: string | null;
  onReplacement?: (id: string) => void;
}) {
  const { branches, branchId, isManager } = useOrg();
  const invalidate = useInvalidateAll();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(defaultType);
  const [branch, setBranch] = useState(defaultBranch ?? branchId ?? branches[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [expiry, setExpiry] = useState("");
  const [needOverride, setNeedOverride] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [inactive, setInactive] = useState<{ replacement?: { id: string; name: string } } | null>(null);
  const [busy, setBusy] = useState(false);

  const types = Object.entries(TX_TYPE).filter(([k]) => isManager || k !== "MANUAL_ADJUSTMENT");

  async function submit(override = false) {
    const n = Number(qty);
    if (qty === "" || Number.isNaN(n)) return toast.error("יש להזין כמות");
    setBusy(true);
    const { data, error } = await supabase.rpc("apply_inventory_transaction", {
      _branch: branch, _product: productId, _type: type, _quantity: n, _notes: notes || undefined,
      _override: override, _override_reason: override ? reason : undefined, _expiry_date: expiry || undefined,
    });
    setBusy(false);
    if (error) {
      const code = errorCode(error);
      if (code === "NEGATIVE_STOCK") return setNeedOverride(error.details ?? "0");
      if (code === "PRODUCT_INACTIVE") {
        const rid = error.details;
        if (rid) {
          const { data: r } = await supabase.from("inventory_products").select("id,name").eq("id", rid).maybeSingle();
          return setInactive({ replacement: r ?? undefined });
        }
        return setInactive({});
      }
      return toast.error(friendlyError(error));
    }
    const res = data as { stock_before: number; stock_after: number };
    toast.success(`עודכן: ${res.stock_before} ← ${res.stock_after}`);
    setOpen(false); setQty(""); setNotes(""); setReason(""); setNeedOverride(null); setExpiry("");
    invalidate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setNeedOverride(null); setInactive(null); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle>תנועת מלאי · {productName}</DialogTitle></DialogHeader>
        {inactive ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-md bg-critical-soft p-3 text-critical">
              הפריט אינו פעיל.{inactive.replacement && <> האם התכוונת ל־<strong>{inactive.replacement.name}</strong>?</>}
            </p>
            <DialogFooter className="gap-2">
              {inactive.replacement && onReplacement && <Button onClick={() => { setOpen(false); onReplacement(inactive.replacement!.id); }}>עבור ל{inactive.replacement.name}</Button>}
              <Button variant="ghost" onClick={() => setOpen(false)}>סגור</Button>
            </DialogFooter>
          </div>
        ) : needOverride !== null ? (
          <div className="space-y-3">
            <div className="rounded-md bg-warning-soft p-3 text-sm text-warning">
              הפעולה תגרום למלאי שלילי (במלאי כרגע: <span className="num">{needOverride}</span>). ברירת המחדל היא חסימה.
            </div>
            {isManager ? (
              <>
                <div className="space-y-1.5"><Label>סיבת חריגה (חובה)</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
                <p className="text-xs text-muted-foreground">החריגה תירשם ביומן הפעולות עם שמך.</p>
                <DialogFooter className="gap-2">
                  <Button variant="destructive" disabled={!reason.trim() || busy} onClick={() => submit(true)}>אשר חריגה</Button>
                  <Button variant="ghost" onClick={() => setNeedOverride(null)}>חזרה</Button>
                </DialogFooter>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">רק מנהל יכול לאשר חריגת מלאי. פנה למנהל הסניף.</p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>סוג תנועה</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{types.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>סניף</Label>
                  <Select value={branch} onValueChange={setBranch}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{type === "PHYSICAL_COUNT" ? "כמות שנספרה" : type === "MANUAL_ADJUSTMENT" ? "שינוי (+/−)" : "כמות"}</Label>
                  <Input type="number" className="num" value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
                {type === "RECEIPT" && <div className="space-y-1.5"><Label>תוקף (אופציונלי)</Label><Input type="date" className="num" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>}
              </div>
              <div className="space-y-1.5"><Label>הערה</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
            <DialogFooter className="gap-2">
              <Button onClick={() => submit(false)} disabled={busy}>שמור תנועה</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
