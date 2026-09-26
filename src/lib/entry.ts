export const ENTRY_REASON: Record<string, string> = {
  FROZEN: "המנוי מוקפא",
  NO_MEMBERSHIP: "אין מנוי בתוקף",
  HEALTH_MISSING: "חסרה הצהרת בריאות",
  HEALTH_PENDING: "הצהרת בריאות ממתינה לאישור",
  HEALTH_EXPIRED: "הצהרת הבריאות פגה",
  PAYMENT_FAILED: "תשלום שנכשל",
};

export const FREEZE_REASON: Record<string, string> = {
  ABROAD: "חו״ל", ILLNESS: "מחלה", RESERVE_DUTY: "מילואים", OTHER: "אחר",
};

export const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** Local YYYY-MM-DD */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
