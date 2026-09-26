const MAP: Record<string, string> = {
  LOSS_REASON_REQUIRED: "יש לבחור סיבת אובדן לפני סימון הליד כלא רלוונטי.",
  NEGATIVE_STOCK: "הפעולה תגרום למלאי שלילי ולכן נחסמה.",
  OVERRIDE_NOT_ALLOWED: "אין לך הרשאה לאשר חריגת מלאי.",
  OVERRIDE_REASON_REQUIRED: "חובה לציין סיבה לחריגה.",
  PRODUCT_INACTIVE: "הפריט אינו פעיל.",
  INVALID_QUANTITY: "הכמות שהוזנה אינה תקינה.",
  FORBIDDEN: "אין לך הרשאה לבצע פעולה זו.",
  "row-level security": "אין לך הרשאה לבצע פעולה זו.",
};

export function errorCode(e: unknown): string | undefined {
  const msg = (e as { message?: string })?.message ?? "";
  return Object.keys(MAP).find((k) => msg.includes(k));
}

export function friendlyError(e: unknown) {
  const code = errorCode(e);
  if (code) return MAP[code];
  console.error(e);
  return "הפעולה לא הושלמה. נסה שוב.";
}
