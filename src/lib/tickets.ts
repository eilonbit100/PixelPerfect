export const TICKET_TYPE: Record<string, string> = { FAULT: "תקלה", PURCHASE: "בקשת רכש", QUOTE: "הצעת מחיר", APPROVAL: "בקשת אישור" };
export const TICKET_STATUS: Record<string, { label: string; tone: "neutral" | "primary" | "warning" | "ok" | "critical" | "attention" }> = {
  OPEN: { label: "פתוחה", tone: "primary" },
  IN_PROGRESS: { label: "בטיפול", tone: "attention" },
  PENDING_APPROVAL: { label: "ממתינה לאישור", tone: "warning" },
  APPROVED: { label: "אושרה", tone: "ok" },
  REJECTED: { label: "נדחתה", tone: "critical" },
  COMPLETED: { label: "הושלמה", tone: "ok" },
  CLOSED: { label: "נסגרה", tone: "neutral" },
};
export const TICKET_PRIORITY: Record<string, string> = { HIGH: "גבוהה", MEDIUM: "בינונית", LOW: "נמוכה" };
export const EVENT_LABEL: Record<string, string> = {
  CREATED: "פתיחת קריאה", ASSIGNED: "שינוי אחראי", PRIORITY: "שינוי עדיפות", DUE: "שינוי מועד יעד", STATUS: "שינוי סטטוס",
  FILE: "הוספת קובץ", LINKED: "עדכון קישור", COMMENT: "הערה", APPROVED: "אושרה", REJECTED: "נדחתה", CLOSED: "סגירת קריאה", REOPENED: "פתיחה מחדש",
};
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const DONE = ["CLOSED", "COMPLETED", "REJECTED"];
/** Overdue = past due date and not yet finished. */
export function isOverdue(t: { due_at: string | null; status: string }, now = new Date()) {
  return !!t.due_at && new Date(t.due_at) < now && !DONE.includes(t.status);
}
export function fileProblem(f: { type: string; size: number }) {
  if (!ALLOWED_MIME.includes(f.type)) return "ניתן להעלות תמונה או PDF בלבד";
  if (f.size > MAX_FILE_BYTES) return "הקובץ גדול מ־10MB";
  return null;
}

/** Type-specific fields shown in the new-ticket form (base fields are always shown). */
export const TYPE_FIELDS: Record<string, string[]> = {
  FAULT: ["location", "product", "equipment"],
  PURCHASE: ["product", "equipment", "quantity", "supplier_id", "amount", "approver"],
  QUOTE: ["supplier_id", "amount", "approver"],
  APPROVAL: ["approval_kind", "amount", "approver"],
};
export function ticketFormErrors(f: { type: string; title: string; details: string; branch: string; amount: string; equipment: string; approval_kind: string; quantity: string }) {
  const e: Record<string, string> = {};
  if (!f.title.trim()) e.title = "יש להזין נושא";
  if (!f.details.trim()) e.details = "יש להזין תיאור";
  if (!f.branch) e.branch = "יש לבחור סניף";
  if (f.type === "QUOTE" && !f.amount) e.amount = "בהצעת מחיר יש להזין סכום";
  if (f.amount && Number(f.amount) < 0) e.amount = "הסכום אינו יכול להיות שלילי";
  if (f.type === "PURCHASE" && !f.equipment.trim()) e.equipment = "יש לציין את הפריט המבוקש";
  if (f.type === "PURCHASE" && f.quantity && Number(f.quantity) <= 0) e.quantity = "כמות חייבת להיות גדולה מ־0";
  if (f.type === "APPROVAL" && !f.approval_kind.trim()) e.approval_kind = "יש לציין את סוג האישור";
  return e;
}
