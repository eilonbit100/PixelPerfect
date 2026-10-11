/** Stock movement types offered in the movement dialog. TRANSFER_OUT here means a full branch-to-branch transfer. */
export type MoveType = "RECEIPT" | "SALE" | "CUSTOMER_RETURN" | "RETURN_TO_SUPPLIER" | "WRITE_OFF" | "TRANSFER_OUT" | "PHYSICAL_COUNT" | "MANUAL_ADJUSTMENT";

export const MOVE_TYPES: { value: MoveType; label: string; hint: string; manager: boolean; reasonRequired: boolean; reference: boolean; reasonPlaceholder?: string }[] = [
  { value: "RECEIPT", label: "קליטה מספק", hint: "סחורה שהתקבלה מספק. נוצרת אצווה עם תוקף ומועד החזרה לפי תנאי הספק.", manager: false, reasonRequired: false, reference: true },
  { value: "SALE", label: "מכירה", hint: "מכירת מוצר ללקוח. נחסם אם אין מספיק מלאי.", manager: false, reasonRequired: false, reference: false },
  { value: "CUSTOMER_RETURN", label: "החזרה מלקוח", hint: "מוצר שלקוח החזיר ומוחזר למדף.", manager: false, reasonRequired: true, reference: false, reasonPlaceholder: "סיבת ההחזרה" },
  { value: "RETURN_TO_SUPPLIER", label: "החזרה לספק", hint: "רק אצוות שמועד ההחזרה שלהן לא עבר.", manager: true, reasonRequired: false, reference: true },
  { value: "WRITE_OFF", label: "גריעה (נזק / פחת / תפוגה)", hint: "הוצאה מהמלאי בלי מכירה. חובה לציין סיבה.", manager: true, reasonRequired: true, reference: true, reasonPlaceholder: "נזק / פחת / פג תוקף" },
  { value: "TRANSFER_OUT", label: "העברה בין סניפים", hint: "יציאה מסניף אחד וכניסה לסניף השני בפעולה אחת.", manager: true, reasonRequired: false, reference: false },
  { value: "PHYSICAL_COUNT", label: "ספירה מהירה (מוצר בודד)", hint: "לספירה מלאה עם אישור — מסך ספירות.", manager: true, reasonRequired: false, reference: false },
  { value: "MANUAL_ADJUSTMENT", label: "תיקון ידני", hint: "תיקון חריג של יתרה. חובה לציין סיבה.", manager: true, reasonRequired: true, reference: false },
];

export function moveAllowed(t: MoveType, isManager: boolean) {
  const d = MOVE_TYPES.find((x) => x.value === t);
  return !!d && (!d.manager || isManager);
}

/** Client-side validation that mirrors the server rules (server re-checks everything). */
export function moveProblem(f: { type: MoveType; qty: string; reason: string; branch: string; toBranch: string; lotRequired: boolean; lotId: string }): string | null {
  const d = MOVE_TYPES.find((x) => x.value === f.type);
  if (!d) return "סוג פעולה לא תקין";
  if (f.qty.trim() === "" || Number.isNaN(Number(f.qty))) return "יש להזין כמות";
  const n = Number(f.qty);
  if (f.type === "PHYSICAL_COUNT" ? n < 0 : f.type !== "MANUAL_ADJUSTMENT" && n <= 0) return "הכמות חייבת להיות גדולה מ־0";
  if (d.reasonRequired && !f.reason.trim()) return "יש לציין סיבה";
  if (f.type === "TRANSFER_OUT" && (!f.toBranch || f.toBranch === f.branch)) return "יש לבחור סניף יעד אחר";
  if (f.lotRequired && !f.lotId) return "יש לבחור אצווה להחזרה";
  return null;
}

/** Gap for a count line; null when the product was not counted (never treated as zero). */
export function countGap(line: { system_qty: number; counted_qty: number | null }) {
  return line.counted_qty == null ? null : Number(line.counted_qty) - Number(line.system_qty);
}

/** A product override wins; an empty override inherits the supplier's return window. */
export function returnWindowDays(productDays: number | null, supplierDays: number | null) {
  return productDays ?? supplierDays;
}

export const KPI_RULES = [
  { rule: "LOW_STOCK", label: "מלאי נמוך" },
  { rule: "OUT_OF_STOCK", label: "אזל" },
  { rule: "NEAR_EXPIRY", label: "תוקף קרוב" },
  { rule: "COUNT_DISCREPANCY", label: "פער ספירה" },
  { rule: "RETURN_WINDOW", label: "חלון החזרה נסגר" },
] as const;
