import { formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from "date-fns";
import { he } from "date-fns/locale";

const TZ = "Asia/Jerusalem";

export function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: TZ }).format(new Date(d));
}
export function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ,
  }).format(new Date(d));
}
export function fmtTime(d: string) {
  return new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(d));
}
/** "היום", "מחר 12:00", "לפני 4 ימים" */
export function fmtRelative(d?: string | null, withTime = false) {
  if (!d) return "—";
  const date = new Date(d);
  const t = withTime ? " " + fmtTime(d) : "";
  if (isToday(date)) return "היום" + t;
  if (isTomorrow(date)) return "מחר" + t;
  if (isYesterday(date)) return "אתמול" + t;
  const dist = formatDistanceToNowStrict(date, { locale: he });
  return date.getTime() < Date.now() ? `לפני ${dist}` : `בעוד ${dist}`;
}
export function fmtMoney(n?: number | null) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(Number(n ?? 0));
}
export function fmtNum(n?: number | null) {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 }).format(Number(n ?? 0));
}
export function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: TZ }).format(new Date()));
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}
export function isValidIsraeliPhone(p: string) {
  const d = p.replace(/\D/g, "");
  return /^0(5\d{8}|[2-489]\d{7}|7\d{8})$/.test(d) || /^972(5\d{8}|[2-489]\d{7}|7\d{8})$/.test(d);
}

export const LEAD_STATUS: Record<string, string> = {
  NEW: "חדש", CONTACT_ATTEMPT: "ניסיון יצירת קשר", FOLLOW_UP: "מעקב", TRIAL: "אימון ניסיון", WON: "נמכר", LOST: "לא רלוונטי",
};
export const LEAD_SOURCE: Record<string, string> = {
  FACEBOOK: "פייסבוק", INSTAGRAM: "אינסטגרם", WEBSITE: "אתר", REFERRAL: "חבר מביא חבר", WALK_IN: "הגיע למועדון", GOOGLE: "גוגל", OTHER: "אחר",
};
export const LOSS_REASON: Record<string, string> = {
  PRICE: "מחיר", NOT_INTERESTED: "לא מעוניין", COMPETITOR: "עבר למתחרה", LOCATION: "מיקום", NO_CONTACT: "לא הצלחנו ליצור קשר", CHANGED_MIND: "חזר בו", OTHER: "אחר",
};
export const CUSTOMER_STATUS: Record<string, string> = { PENDING: "בהקמה", ACTIVE: "פעיל", INACTIVE: "לא פעיל", ARCHIVED: "בארכיון" };
export const MEMBERSHIP_STATUS: Record<string, string> = { PENDING: "ממתין", ACTIVE: "מנוי פעיל", FROZEN: "מוקפא", CANCELLED: "בוטל", EXPIRED: "פג תוקף" };
export const PAYMENT_STATUS: Record<string, string> = { PENDING: "ממתין", PAID: "שולם", FAILED: "נכשל", CANCELLED: "בוטל", REFUNDED: "הוחזר" };
export const COMPLIANCE_STATUS: Record<string, string> = { MISSING: "חסר", PENDING: "ממתין", VALID: "תקין", EXPIRED: "פג תוקף", NOT_REQUIRED: "לא נדרש" };
export const TASK_STATUS: Record<string, string> = { OPEN: "פתוחה", IN_PROGRESS: "בטיפול", COMPLETED: "הושלמה", CANCELLED: "בוטלה" };
export const TASK_PRIORITY: Record<string, string> = { LOW: "נמוכה", NORMAL: "רגילה", HIGH: "גבוהה", URGENT: "דחופה" };
export const ROLE: Record<string, string> = { EMPLOYEE: "עובד", BRANCH_MANAGER: "מנהל סניף", HQ: "מטה" };
export const MEMBER_STATUS: Record<string, string> = { INVITED: "הוזמן", ACTIVE: "פעיל", SUSPENDED: "מושעה", REMOVED: "הוסר" };
export const TX_TYPE: Record<string, string> = {
  RECEIPT: "קבלת סחורה", SALE: "מכירה", RETURN_TO_SUPPLIER: "החזרה לספק", MANUAL_ADJUSTMENT: "תיקון ידני",
  PHYSICAL_COUNT: "ספירת מלאי", TRANSFER_IN: "העברה נכנסת", TRANSFER_OUT: "העברה יוצאת",
  CUSTOMER_RETURN: "החזרה מלקוח", WRITE_OFF: "גריעה (נזק / פחת / תפוגה)",
};
export const ACTIVITY_LABEL: Record<string, string> = {
  LEAD_CREATED: "ליד נוצר", CALL: "שיחה", WHATSAPP: "הודעת וואטסאפ", MEETING: "פגישה", TRIAL: "אימון ניסיון", NOTE: "הערה",
  STATUS_CHANGED: "שינוי סטטוס", TASK_CREATED: "משימה נוצרה", TASK_COMPLETED: "משימה הושלמה", LOST_REASON: "סומן כלא רלוונטי",
  CONVERTED: "הומר ללקוח", ASSIGNED: "שויך לעובד", CUSTOMER_CREATED: "כרטיס לקוח נפתח", PAYMENT: "תשלום", DOCUMENT: "מסמך",
};
