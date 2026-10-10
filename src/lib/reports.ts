import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./org";
import { ENTRY_REASON } from "./entry";

export type ColType = "text" | "date" | "datetime" | "money" | "number" | "percent";
export type Col = { key: string; label: string; type?: ColType; map?: Record<string, string> };
export type Category = "members" | "finance" | "sales" | "staff" | "cards" | "entry" | "classes";

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "members", label: "מנויים ולקוחות" },
  { value: "finance", label: "כספים ותקבולים" },
  { value: "sales", label: "מכירות ולידים" },
  { value: "staff", label: "עובדים ומשימות" },
  { value: "cards", label: "תקינות כרטיסים" },
  { value: "entry", label: "כניסות" },
  { value: "classes", label: "שיעורים וטיפולים" },
];

const MS: Record<string, string> = { ACTIVE: "פעיל", FROZEN: "מוקפא", CANCELLED: "בוטל", EXPIRED: "פג", PENDING: "ממתין" };
const LS: Record<string, string> = { NEW: "חדש", CONTACT_ATTEMPT: "ניסיון קשר", FOLLOW_UP: "במעקב", TRIAL: "אימון ניסיון", WON: "נמכר", LOST: "לא רלוונטי" };
const ACT: Record<string, string> = { CALL: "שיחה", WHATSAPP: "וואטסאפ", MEETING: "פגישה", NOTE: "הערה", STATUS_CHANGE: "שינוי סטטוס", CREATED: "נוצר" };
const SRC: Record<string, string> = { WEBSITE: "אתר", FACEBOOK: "פייסבוק", INSTAGRAM: "אינסטגרם", WALK_IN: "הגיע למועדון", REFERRAL: "המלצה", PHONE: "טלפון", OTHER: "אחר" };
const PM: Record<string, string> = { CREDIT_CARD: "כרטיס אשראי", STANDING_ORDER: "הוראת קבע", CASH: "מזומן", BIT: "ביט", BANK_TRANSFER: "העברה בנקאית", CHECK: "צ׳ק" };

export type ReportDef = {
  key: string; number?: string; name: string; desc: string; category: Category;
  dateMeaning: string; cols: Col[]; link?: "customer" | "lead"; financial?: boolean; unavailable?: string; note?: string;
};

export const REPORTS: ReportDef[] = [
  { key: "cancellations", number: "113", name: "ביטולים", category: "members", desc: "מנויים שבוטלו, סיבה ותאריך כניסה לתוקף", dateMeaning: "לפי מועד הביטול", link: "customer",
    cols: [{ key: "full_name", label: "לקוח" }, { key: "phone", label: "טלפון" }, { key: "plan", label: "סוג מנוי" }, { key: "requested", label: "בקשת ביטול", type: "date" }, { key: "effective", label: "בתוקף מ", type: "date" }, { key: "reason", label: "סיבה" }, { key: "branch", label: "סניף" }] },
  { key: "purchases", number: "120", name: "לקוחות לפי מועד רכישה", category: "members", desc: "מי רכש מנוי או מוצר בתקופה, סכום ואיש מכירות", dateMeaning: "לפי מועד התשלום", link: "customer",
    cols: [{ key: "full_name", label: "לקוח" }, { key: "phone", label: "טלפון" }, { key: "paid_on", label: "תאריך רכישה", type: "date" }, { key: "item", label: "מנוי / מוצר" }, { key: "amount", label: "סכום", type: "money" }, { key: "seller", label: "איש מכירות" }, { key: "branch", label: "סניף" }] },
  { key: "active", number: "134", name: "לקוחות פעילים", category: "members", desc: "מנויים פעילים נכון לתאריך הסיום שנבחר", dateMeaning: "סטטוס נכון לתאריך הסיום בטווח", link: "customer",
    cols: [{ key: "full_name", label: "לקוח" }, { key: "phone", label: "טלפון" }, { key: "plan", label: "סוג מנוי" }, { key: "start_date", label: "התחלה", type: "date" }, { key: "end_date", label: "סיום", type: "date" }, { key: "status", label: "סטטוס", map: MS }, { key: "branch", label: "סניף" }] },
  { key: "new_members", name: "מנויים חדשים בתקופה", category: "members", desc: "מנויים שהתחילו בתקופה, לפי סוג וסניף", dateMeaning: "לפי תאריך תחילת המנוי", link: "customer",
    cols: [{ key: "full_name", label: "לקוח" }, { key: "phone", label: "טלפון" }, { key: "plan", label: "סוג מנוי" }, { key: "start_date", label: "הצטרפות", type: "date" }, { key: "price", label: "מחיר", type: "money" }, { key: "branch", label: "סניף" }] },
  { key: "cancel_requests", name: "בקשות ביטול מנוי", category: "members", desc: "בקשות שהתקבלו, פתוחות וטופלו", dateMeaning: "לפי מועד הבקשה", link: "customer",
    cols: [{ key: "full_name", label: "לקוח" }, { key: "phone", label: "טלפון" }, { key: "requested", label: "תאריך בקשה", type: "date" }, { key: "reason", label: "סיבה" }, { key: "status", label: "סטטוס טיפול" }, { key: "handled", label: "טופל ב", type: "date" }, { key: "branch", label: "סניף" }] },
  { key: "debtors", number: "401", name: "חייבים", category: "finance", financial: true, desc: "תשלומים שנכשלו או שלא שולמו במועד", dateMeaning: "לפי מועד החיוב", link: "customer",
    cols: [{ key: "full_name", label: "לקוח" }, { key: "phone", label: "טלפון" }, { key: "amount", label: "סכום חוב", type: "money" }, { key: "due_on", label: "תאריך חיוב", type: "date" }, { key: "status", label: "סטטוס" }, { key: "reason", label: "סיבה" }, { key: "branch", label: "סניף" }] },
  { key: "receipts", number: "402", name: "סיכום קבלות תקופתי", category: "finance", financial: true, desc: "תשלומים ששולמו בתקופה ואמצעי התשלום", dateMeaning: "לפי מועד התשלום", link: "customer",
    note: "אין עדיין מערכת קבלות מחוברת — מספר קבלה יופיע כשתחובר.",
    cols: [{ key: "paid_on", label: "תאריך", type: "date" }, { key: "receipt_no", label: "מספר קבלה" }, { key: "full_name", label: "לקוח" }, { key: "amount", label: "סכום", type: "money" }, { key: "method", label: "אמצעי תשלום", map: PM }, { key: "branch", label: "סניף" }] },
  { key: "sales_by_item", number: "409", name: "מכירות ותקבולים לפי סעיף", category: "finance", financial: true, desc: "כמה נמכר מול כמה נגבה בפועל, לפי סוג מנוי או מוצר", dateMeaning: "לפי מועד יצירת החיוב",
    cols: [{ key: "item", label: "סעיף" }, { key: "sales_count", label: "מכירות", type: "number" }, { key: "sold", label: "סכום מכירה", type: "money" }, { key: "collected", label: "נגבה בפועל", type: "money" }, { key: "open_amount", label: "טרם נגבה", type: "money" }] },
  { key: "lead_followup", number: "701", name: "איש מכירות ומעקב מתעניין", category: "sales", desc: "סטטוס כל מתעניין, מעקב אחרון והבא", dateMeaning: "לפי מועד קליטת הליד", link: "lead",
    cols: [{ key: "seller", label: "איש מכירות" }, { key: "full_name", label: "מתעניין" }, { key: "phone", label: "טלפון" }, { key: "status", label: "סטטוס", map: LS }, { key: "last_contact", label: "מעקב אחרון", type: "date" }, { key: "next_followup", label: "מעקב הבא", type: "date" }, { key: "last_result", label: "פעולה אחרונה", map: ACT }] },
  { key: "leads_no_task", name: "לידים ללא משימת מעקב", category: "sales", desc: "לידים פתוחים שלא נוצרה להם משימה", dateMeaning: "לפי מועד קליטת הליד", link: "lead",
    cols: [{ key: "full_name", label: "ליד" }, { key: "phone", label: "טלפון" }, { key: "created_on", label: "נקלט", type: "date" }, { key: "source", label: "מקור", map: SRC }, { key: "status", label: "סטטוס", map: LS }, { key: "branch", label: "סניף" }] },
  { key: "duplicate_leads", name: "לידים כפולים", category: "sales", desc: "לידים עם אותו מספר טלפון — לבדיקה, בלי מיזוג אוטומטי", dateMeaning: "כפילויות שאחת מהן נקלטה בתקופה", link: "lead",
    cols: [{ key: "dup_key", label: "טלפון מנורמל" }, { key: "dup_count", label: "רשומות", type: "number" }, { key: "full_name", label: "שם" }, { key: "created_on", label: "נוצר", type: "date" }, { key: "status", label: "סטטוס", map: LS }, { key: "branch", label: "סניף" }] },
  { key: "lead_conversion", name: "המרות לידים", category: "sales", desc: "לידים ייחודיים (לפי טלפון), כמה הפכו ללקוחות ואחוז המרה", dateMeaning: "לפי מועד קליטת הליד",
    cols: [{ key: "branch", label: "סניף" }, { key: "unique_leads", label: "לידים ייחודיים", type: "number" }, { key: "converted", label: "הפכו ללקוחות", type: "number" }, { key: "rate", label: "המרה", type: "percent" }] },
  { key: "staff_performance", name: "ביצועי עובדים", category: "staff", desc: "משימות, מכירות, אינטראקציות ואנשים ייחודיים — בנפרד", dateMeaning: "לפי מועד הפעולה",
    cols: [{ key: "employee", label: "עובד" }, { key: "tasks_handled", label: "משימות", type: "number" }, { key: "tasks_done", label: "הושלמו", type: "number" }, { key: "non_sales_tasks", label: "לא מכירה", type: "number" }, { key: "sales", label: "מכירות", type: "number" }, { key: "conversion", label: "המרה", type: "percent" }, { key: "interactions", label: "אינטראקציות", type: "number" }, { key: "unique_contacts", label: "אנשים ייחודיים", type: "number" }] },
  { key: "tasks_done", name: "משימות שבוצעו", category: "staff", desc: "משימות שהושלמו, מי ביצע ומתי", dateMeaning: "לפי מועד הביצוע",
    cols: [{ key: "employee", label: "עובד" }, { key: "title", label: "משימה" }, { key: "task_type", label: "סוג" }, { key: "created_on", label: "נוצרה", type: "date" }, { key: "done_on", label: "בוצעה", type: "date" }, { key: "branch", label: "סניף" }] },
  { key: "invalid_cards", name: "כרטיסי לקוח לא תקינים", category: "cards", desc: "הצהרות, טפסים, תשלומים שנכשלו ופרטים חסרים", dateMeaning: "מצב נוכחי (התאריכים לא משפיעים)", link: "customer",
    cols: [{ key: "full_name", label: "לקוח" }, { key: "phone", label: "טלפון" }, { key: "problems", label: "בעיות" }, { key: "branch", label: "סניף" }] },
  { key: "checkins", name: "כניסות וחריגות כניסה", category: "entry", desc: "כל ניסיונות הכניסה, מאושרות ונדחות, עם הסיבה", dateMeaning: "לפי מועד הכניסה", link: "customer",
    cols: [{ key: "at_time", label: "תאריך ושעה", type: "datetime" }, { key: "full_name", label: "לקוח" }, { key: "branch", label: "סניף" }, { key: "result", label: "תוצאה" }, { key: "reasons", label: "סיבת דחייה" }, { key: "method", label: "אמצעי זיהוי" }] },
  { key: "class_attendance", name: "השתתפות בשיעורים", category: "classes", desc: "נרשמים מול משתתפים בפועל, ביטולים ואי-הגעה", dateMeaning: "לפי תאריך השיעור",
    cols: [{ key: "session_date", label: "תאריך", type: "date" }, { key: "class_name", label: "שיעור" }, { key: "instructor", label: "מדריך" }, { key: "booked", label: "נרשמו", type: "number" }, { key: "attended", label: "הגיעו", type: "number" }, { key: "cancelled", label: "ביטלו", type: "number" }, { key: "no_show", label: "לא הגיעו", type: "number" }, { key: "waitlist", label: "המתנה", type: "number" }, { key: "branch", label: "סניף" }] },
  { key: "treatments", name: "אימונים אישיים וטיפולים", category: "classes", desc: "מדריך, לקוח, סוג פעילות וסטטוס", dateMeaning: "לפי תאריך הפעילות",
    unavailable: "המערכת עדיין לא מנהלת אימונים אישיים וטיפולים, ולכן אין נתונים להציג.",
    cols: [{ key: "instructor", label: "מדריך" }, { key: "customer", label: "לקוח" }, { key: "kind", label: "סוג" }, { key: "date", label: "תאריך", type: "date" }, { key: "status", label: "סטטוס" }, { key: "branch", label: "סניף" }] },
];

export const reportByKey = (k: string) => REPORTS.find((r) => r.key === k);

/** Custom-builder sources and approved fields (mirrors run_custom_report whitelist) */
export const SOURCES: { key: string; label: string; financial?: boolean; status?: Record<string, string>; cols: Col[] }[] = [
  { key: "customers", label: "לקוחות", status: { ACTIVE: "פעיל", INACTIVE: "לא פעיל", PENDING: "בהקמה" }, cols: [{ key: "full_name", label: "שם" }, { key: "phone", label: "טלפון" }, { key: "email", label: "אימייל" }, { key: "status", label: "סטטוס" }, { key: "joined_at", label: "הצטרפות", type: "date" }, { key: "payment_method", label: "אמצעי תשלום", map: PM }] },
  { key: "leads", label: "לידים ומתעניינים", status: LS, cols: [{ key: "full_name", label: "שם" }, { key: "phone", label: "טלפון" }, { key: "source", label: "מקור", map: SRC }, { key: "status", label: "סטטוס", map: LS }, { key: "created_at", label: "נקלט", type: "date" }, { key: "loss_reason", label: "סיבת אובדן" }] },
  { key: "memberships", label: "מנויים", status: MS, cols: [{ key: "customer_name", label: "לקוח" }, { key: "display_name", label: "סוג מנוי" }, { key: "price", label: "מחיר", type: "money" }, { key: "start_date", label: "התחלה", type: "date" }, { key: "end_date", label: "סיום", type: "date" }, { key: "status", label: "סטטוס", map: MS }] },
  { key: "payments", label: "תשלומים ומכירות", financial: true, status: { PAID: "שולם", PENDING: "ממתין", FAILED: "נכשל", CANCELLED: "בוטל", REFUNDED: "הוחזר" }, cols: [{ key: "customer_name", label: "לקוח" }, { key: "amount", label: "סכום", type: "money" }, { key: "status", label: "סטטוס" }, { key: "paid_at", label: "שולם", type: "date" }, { key: "due_at", label: "מועד חיוב", type: "date" }, { key: "failure_reason", label: "סיבת כישלון" }] },
  { key: "tasks", label: "משימות", status: { OPEN: "פתוחה", IN_PROGRESS: "בטיפול", COMPLETED: "הושלמה", CANCELLED: "בוטלה" }, cols: [{ key: "title", label: "משימה" }, { key: "assignee", label: "עובד" }, { key: "status", label: "סטטוס" }, { key: "priority", label: "עדיפות" }, { key: "due_at", label: "יעד", type: "date" }, { key: "completed_at", label: "הושלמה", type: "date" }] },
  { key: "check_ins", label: "כניסות", cols: [{ key: "customer_name", label: "לקוח" }, { key: "created_at", label: "מועד", type: "datetime" }, { key: "allowed", label: "אושרה" }, { key: "reasons", label: "סיבות" }] },
];

export type Perm = { view: boolean; export: boolean; own: boolean };
export function useReportPerms() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["report-perms", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_report_permissions", { _org: org.id });
      if (error) throw error;
      return (data ?? {}) as Record<string, Perm>;
    },
  });
}

/** Quick date ranges in local time */
export type RangeKey = "today" | "week" | "month" | "prev_month" | "year" | "custom";
export const RANGES: { value: RangeKey; label: string }[] = [
  { value: "today", label: "היום" }, { value: "week", label: "השבוע" }, { value: "month", label: "החודש" },
  { value: "prev_month", label: "החודש הקודם" }, { value: "year", label: "השנה" }, { value: "custom", label: "מותאם" },
];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function rangeDates(r: RangeKey): { from: string; to: string } {
  const n = new Date(); const t = iso(n);
  if (r === "today") return { from: t, to: t };
  if (r === "week") { const s = new Date(n); s.setDate(n.getDate() - n.getDay()); return { from: iso(s), to: t }; }
  if (r === "prev_month") return { from: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: iso(new Date(n.getFullYear(), n.getMonth(), 0)) };
  if (r === "year") return { from: iso(new Date(n.getFullYear(), 0, 1)), to: t };
  return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: t };
}

export function fmtCell(v: unknown, c: Col): string {
  if (v === null || v === undefined || v === "") return "";
  if (c.key === "reasons") return String(v).split(",").filter(Boolean).map((x) => ENTRY_REASON[x] ?? x).join(", ");
  if (c.map) return c.map[String(v)] ?? String(v);
  if (typeof v === "boolean") return v ? "כן" : "לא";
  if (c.type === "date") return new Date(String(v).slice(0, 10) + "T00:00:00").toLocaleDateString("he-IL");
  if (c.type === "datetime") return new Date(String(v)).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
  if (c.type === "money") return `₪${Number(v).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
  if (c.type === "percent") return `${v}%`;
  return String(v);
}
