import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Paperclip, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInvalidateAll } from "@/lib/queries";
import { errorCode, friendlyError } from "@/lib/errors";
import { fmtDate, fmtNum } from "@/lib/format";
import { MOVE_TYPES, moveAllowed, moveProblem, type MoveType } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const ERR: Record<string, string> = {
  REASON_REQUIRED: "יש לציין סיבה",
  LOT_QUANTITY_EXCEEDED: "הכמות גדולה מהכמות שנותרה באצווה",
  RETURN_WINDOW_CLOSED: "חלון ההחזרה לספק של האצווה הזו נסגר",
  LOT_NOT_FOUND: "האצווה לא נמצאה",
  SAME_BRANCH: "יש לבחור סניף יעד אחר",
  FORBIDDEN: "אין לך הרשאה לפעולה זו",
};

export function StockDialog({ trigger, productId, productName, defaultType = "RECEIPT", defaultBranch, onReplacement }: {
  trigger: ReactNode; productId: string; productName: string; defaultType?: string; defaultBranch?: string | null;
  onReplacement?: (id: string) => void;
}) {
  const { org, branches, branchId, isManager } = useOrg();
  const invalidate = useInvalidateAll();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MoveType>(defaultType as MoveType);
  const [branch, setBranch] = useState(defaultBranch ?? branchId ?? branches[0]?.id ?? "");
  const [toBranch, setToBranch] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [expiry, setExpiry] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [lotId, setLotId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [idem, setIdem] = useState(() => crypto.randomUUID());
  const [needOverride, setNeedOverride] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [inactive, setInactive] = useState<{ replacement?: { id: string; name: string } } | null>(null);
  const [busy, setBusy] = useState(false);

  const refs = useQuery({
    enabled: open,
    queryKey: ["stock-refs", productId, branch],
    queryFn: async () => {
      const [s, l] = await Promise.all([
        supabase.from("suppliers").select("id,name").eq("organization_id", org.id).eq("active", true).order("name"),
        supabase.from("inventory_lots").select("id,lot_number,quantity,expiry_date,return_deadline").eq("product_id", productId).eq("branch_id", branch).gt("quantity", 0).order("expiry_date"),
      ]);
      return { suppliers: s.data ?? [], lots: l.data ?? [] };
    },
  });
  const today = new Date().toISOString().slice(0, 10);
  const returnableLots = (refs.data?.lots ?? []).filter((l) => !l.return_deadline || l.return_deadline >= today);
  const types = MOVE_TYPES.filter((t) => moveAllowed(t.value, isManager));
  const def = MOVE_TYPES.find((t) => t.value === type) ?? MOVE_TYPES[0];

  function reset() {
    setQty(""); setReason(""); setReference(""); setExpiry(""); setLotNo(""); setLotId(""); setFile(null);
    setOverrideReason(""); setNeedOverride(null); setInactive(null); setIdem(crypto.randomUUID());
  }

  async function submit(override = false) {
    const n = Number(qty);
    const problem = moveProblem({ type, qty, reason, toBranch, branch, lotRequired: type === "RETURN_TO_SUPPLIER" && returnableLots.length > 0, lotId });
    if (problem) return toast.error(problem);
    setBusy(true);
    let docPath: string | undefined;
    if (file) {
      docPath = `${org.id}/${branch}/${idem}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const up = await supabase.storage.from("inventory-docs").upload(docPath, file, { contentType: file.type, upsert: true });
      if (up.error) { setBusy(false); return toast.error("העלאת האסמכתה נכשלה"); }
    }
    const { data, error } = type === "TRANSFER_OUT"
      ? await supabase.rpc("transfer_stock", { _from: branch, _to: toBranch, _product: productId, _quantity: n, _note: reason || undefined, _idempotency_key: idem })
      : await supabase.rpc("apply_inventory_transaction", {
          _branch: branch, _product: productId, _type: type, _quantity: n, _notes: undefined, _reference: reference || undefined,
          _override: override, _override_reason: override ? overrideReason : undefined, _expiry_date: expiry || undefined, _lot_number: lotNo || undefined,
          _reason: reason || undefined, _document_path: docPath, _idempotency_key: idem, _lot_id: lotId || undefined, _supplier: supplier || undefined,
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
      return toast.error(ERR[code ?? ""] ?? friendlyError(error));
    }
    const res = (type === "TRANSFER_OUT" ? (data as { out: unknown }).out : data) as { stock_before: number; stock_after: number; duplicate?: boolean };
    toast.success(res.duplicate ? "הפעולה כבר נרשמה — לא נוספה תנועה כפולה" : `עודכן: ${res.stock_before} ← ${res.stock_after}`);
    setOpen(false); reset();
    invalidate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { reset(); setType(defaultType as MoveType); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
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
                <div className="space-y-1.5"><Label>סיבת חריגה (חובה)</Label><Textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={2} /></div>
                <p className="text-xs text-muted-foreground">החריגה תירשם ביומן הפעולות עם שמך.</p>
                <DialogFooter className="gap-2">
                  <Button variant="destructive" disabled={!overrideReason.trim() || busy} onClick={() => submit(true)}>אשר חריגה</Button>
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
                <div className="space-y-1.5"><Label>פעולה</Label>
                  <Select value={type} onValueChange={(v) => setType(v as MoveType)}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{types.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>{type === "TRANSFER_OUT" ? "מסניף" : "סניף"}</Label>
                  <Select value={branch} onValueChange={(v) => { setBranch(v); setLotId(""); }}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <p className="text-xs text-muted-foreground">{def.hint}</p>

              {type === "TRANSFER_OUT" && (
                <div className="space-y-1.5"><Label>לסניף *</Label>
                  <Select value={toBranch} onValueChange={setToBranch}><SelectTrigger><SelectValue placeholder="בחר סניף יעד" /></SelectTrigger>
                    <SelectContent>{branches.filter((b) => b.id !== branch).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
              )}

              {type === "RETURN_TO_SUPPLIER" && (
                <div className="space-y-1.5"><Label>אצווה להחזרה {returnableLots.length ? "*" : ""}</Label>
                  {returnableLots.length ? (
                    <Select value={lotId} onValueChange={setLotId}><SelectTrigger><SelectValue placeholder="בחר אצווה" /></SelectTrigger>
                      <SelectContent>{returnableLots.map((l) => <SelectItem key={l.id} value={l.id}>{l.lot_number ?? "ללא מספר"} · {fmtNum(l.quantity)} יח׳{l.expiry_date ? ` · תוקף ${fmtDate(l.expiry_date)}` : ""}{l.return_deadline ? ` · החזרה עד ${fmtDate(l.return_deadline)}` : ""}</SelectItem>)}</SelectContent></Select>
                  ) : <p className="text-xs text-muted-foreground">אין אצוות פתוחות להחזרה בסניף זה — ההחזרה תירשם על המלאי הכללי.</p>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{type === "PHYSICAL_COUNT" ? "כמות שנספרה" : type === "MANUAL_ADJUSTMENT" ? "שינוי (+/−)" : "כמות"} *</Label>
                  <Input type="number" className="num" value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
                {def.reference && <div className="space-y-1.5"><Label>אסמכתה (מס׳ תעודה)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>}
              </div>

              {type === "RECEIPT" && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>ספק</Label>
                    <Select value={supplier || "default"} onValueChange={(v) => setSupplier(v === "default" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="default">ספק ברירת מחדל</SelectItem>{(refs.data?.suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>מס׳ אצווה</Label><Input value={lotNo} onChange={(e) => setLotNo(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>תוקף</Label><Input type="date" lang="he-IL" className="num" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
                </div>
              )}

              <div className="space-y-1.5"><Label>{def.reasonRequired ? "סיבה *" : "הערה / סיבה"}</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={def.reasonPlaceholder} /></div>

              {def.reference && (
                <div className="space-y-1.5">
                  <Label>קובץ אסמכתה (תמונה / PDF)</Label>
                  {file ? (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs">
                      <span className="truncate">{file.name}</span>
                      <button type="button" aria-label="הסרת קובץ" onClick={() => setFile(null)} className="ms-auto text-muted-foreground hover:text-critical"><X className="size-3.5" /></button>
                    </div>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                      <Paperclip className="size-4" /> צירוף קובץ
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0]; e.target.value = "";
                        if (f && f.size > 10 * 1024 * 1024) return toast.error("הקובץ גדול מ־10MB");
                        if (f) setFile(f);
                      }} />
                    </label>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button onClick={() => submit(false)} disabled={busy}>{busy ? "שומר…" : "שמור תנועה"}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
