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
  FILE: "הוספת קובץ", COMMENT: "הערה", APPROVED: "אושרה", REJECTED: "נדחתה", CLOSED: "סגירת קריאה", REOPENED: "פתיחה מחדש",
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
