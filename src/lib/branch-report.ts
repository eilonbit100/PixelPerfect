import type { Col } from "./reports";

/** Shape returned by the branch_management_report database function */
export type BmKpis = Record<string, number | null>;
export type BmResult = {
  branches: string[]; from: string; to: string; prev_from: string; prev_to: string;
  current: BmKpis; previous: BmKpis; by_branch: (BmKpis & { branch_id: string; branch: string })[] | null;
  details: Record<DetailKey, Record<string, unknown>[]>; export: boolean;
};
export type DetailKey = "sales" | "cancellations" | "requests" | "movement" | "payments" | "debts";

/** Percent change vs. previous period; null when the base is 0 or missing (no reliable %) */
export function pctChange(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

export type KpiDef = { key: string; label: string; type?: "money" | "number" | "percent"; detail?: DetailKey; hint: string; sub?: (k: BmKpis) => string };

export const KPIS: KpiDef[] = [
  { key: "sold_count", label: "מנויים שנמכרו", detail: "sales", hint: "מנויים שנרכשו בתקופה, לפי תאריך הרכישה (לא תאריך התחלה)", sub: (k) => `₪${Number(k.sold_amount ?? 0).toLocaleString("he-IL")}` },
  { key: "sold_amount", label: "סכום מכירות", type: "money", detail: "sales", hint: "סך מחירי המנויים שנרכשו בתקופה" },
  { key: "collected", label: "תקבולים", type: "money", detail: "payments", hint: "תשלומים ששולמו בפועל בתקופה, לפי תאריך התשלום", sub: (k) => `${k.collected_count ?? 0} תשלומים` },
  { key: "debt", label: "חובות פתוחים", type: "money", detail: "debts", hint: "תשלומים שנכשלו או ממתינים, שמועד החיוב שלהם עד סוף התקופה", sub: (k) => `${k.debt_count ?? 0} חיובים` },
  { key: "cancelled", label: "ביטולים בפועל", detail: "cancellations", hint: "מנויים שבוטלו, לפי תאריך הביטול בפועל" },
  { key: "req_total", label: "בקשות ביטול", detail: "requests", hint: "בקשות שהוגשו בתקופה", sub: (k) => `פתוחות ${k.req_open ?? 0} · טופלו ${k.req_handled ?? 0} · הושלמו ${k.req_completed ?? 0}` },
  { key: "joins", label: "מנויים חדשים", detail: "movement", hint: "לקוחות שהתחילו מנוי ראשון ברשת בתקופה, לפי תאריך התחלה. כל לקוח נספר פעם אחת" },
  { key: "active_end", label: "לקוחות פעילים", detail: "movement", hint: "לקוחות ייחודיים עם מנוי בתוקף בסוף התקופה (כולל מוקפאים)", sub: (k) => `בתחילת התקופה ${k.active_start ?? 0}` },
  { key: "net", label: "שינוי נטו", detail: "movement", hint: "הצטרפויות פחות עזיבות בפועל. חידושים, הקפאות ומעברים בין סניפים מוצגים בנפרד" },
  { key: "growth_pct", label: "צמיחה במנויים פעילים", type: "percent", detail: "movement", hint: "(פעילים בסוף − פעילים בתחילה) ÷ פעילים בתחילה" },
];

/** Secondary movement metrics, shown separately so they don't distort net change */
export const MOVEMENT: { key: string; label: string }[] = [
  { key: "joins", label: "הצטרפויות" }, { key: "leavers", label: "עזיבות" }, { key: "renewals", label: "חידושים" },
  { key: "transfers_in", label: "מעברים מסניף אחר" }, { key: "transfers_out", label: "מעברים לסניף אחר" },
  { key: "freezes_started", label: "הקפאות שהתחילו" }, { key: "frozen_end", label: "מוקפאים בסוף התקופה" },
];

export const DETAILS: { key: DetailKey; label: string; cols: Col[] }[] = [
  { key: "sales", label: "מכירות", cols: [{ key: "full_name", label: "לקוח" }, { key: "purchased", label: "תאריך רכישה", type: "date" }, { key: "start_date", label: "תאריך התחלה", type: "date" }, { key: "plan", label: "מנוי" }, { key: "price", label: "מחיר", type: "money" }, { key: "status", label: "סטטוס", map: { ACTIVE: "פעיל", FROZEN: "מוקפא", CANCELLED: "בוטל", EXPIRED: "פג", PENDING: "ממתין" } }, { key: "branch", label: "סניף" }] },
  { key: "cancellations", label: "ביטולים", cols: [{ key: "full_name", label: "לקוח" }, { key: "plan", label: "מנוי" }, { key: "cancelled_on", label: "תאריך ביטול", type: "date" }, { key: "end_date", label: "סיום", type: "date" }, { key: "reason", label: "סיבה" }, { key: "branch", label: "סניף" }] },
  { key: "requests", label: "בקשות ביטול", cols: [{ key: "full_name", label: "לקוח" }, { key: "requested", label: "הוגשה", type: "date" }, { key: "status", label: "סטטוס" }, { key: "handled", label: "טופלה", type: "date" }, { key: "reason", label: "סיבה" }, { key: "branch", label: "סניף" }] },
  { key: "movement", label: "תנועת מנויים", cols: [{ key: "full_name", label: "לקוח" }, { key: "kind", label: "סוג תנועה" }, { key: "on_date", label: "תאריך", type: "date" }, { key: "plan", label: "מנוי" }, { key: "branch", label: "סניף" }] },
  { key: "payments", label: "תקבולים", cols: [{ key: "full_name", label: "לקוח" }, { key: "paid_on", label: "תאריך תשלום", type: "date" }, { key: "item", label: "עבור" }, { key: "amount", label: "סכום", type: "money" }, { key: "branch", label: "סניף" }] },
  { key: "debts", label: "חובות", cols: [{ key: "full_name", label: "לקוח" }, { key: "due_on", label: "מועד חיוב", type: "date" }, { key: "amount", label: "סכום", type: "money" }, { key: "status", label: "סטטוס", map: { FAILED: "נכשל", PENDING: "ממתין" } }, { key: "failure_reason", label: "סיבה" }, { key: "branch", label: "סניף" }] },
];

export function fmtKpi(v: number | null | undefined, type?: KpiDef["type"]): string {
  if (v == null) return "—";
  if (type === "money") return `₪${Number(v).toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
  if (type === "percent") return `${v > 0 ? "+" : ""}${v}%`;
  return Number(v).toLocaleString("he-IL");
}

/** Data-quality warnings: metrics that can't be computed reliably from the source data */
export function bmWarnings(k: BmKpis): string[] {
  const w: string[] = [];
  if (Number(k.cancelled_no_date) > 0) w.push(`${k.cancelled_no_date} מנויים מבוטלים ללא תאריך ביטול בפועל — לא נכללו בספירת הביטולים והעזיבות.`);
  return w;
}
