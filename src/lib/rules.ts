export type Severity = "INFO" | "ATTENTION" | "WARNING" | "HIGH" | "CRITICAL";
export type Module = "leads" | "tasks" | "customers" | "inventory";

export interface Insight {
  id: string;
  organization_id: string;
  branch_id: string | null;
  rule_key: string;
  entity_type: string;
  entity_id: string;
  severity: Severity;
  title: string;
  explanation: string | null;
  recommended_action: string | null;
  status: string;
  detected_at: string;
  metadata: Record<string, unknown>;
}

export const RULES: Record<string, { group: (n: number) => string; cta: string; module: Module; description: string }> = {
  INVALID_FOLLOW_UP: { group: (n) => `${n} לידים במעקב לא תקין`, cta: "טפל עכשיו", module: "leads", description: "לידים בסטטוס מעקב ללא משימה עתידית" },
  INACTIVE_LEAD: { group: (n) => `${n} לידים לא מטופלים`, cta: "פתח רשימה", module: "leads", description: "לידים פתוחים ללא פעילות מעבר לסף שהוגדר" },
  MISSING_LOST_REASON: { group: (n) => `${n} לידים ללא תיעוד סיבת אובדן`, cta: "השלם תיעוד", module: "leads", description: "לידים שסומנו כלא רלוונטיים ללא סיבה מובנית" },
  OVERDUE_TASK: { group: (n) => `${n} משימות באיחור`, cta: "פתח משימות", module: "tasks", description: "משימות פתוחות שמועד היעד שלהן עבר" },
  MISSING_COMPLIANCE: { group: (n) => `${n} לקוחות עם מסמכים חסרים`, cta: "פתח לקוחות", module: "customers", description: "לקוחות פעילים ללא מסמך חובה" },
  FAILED_PAYMENT: { group: (n) => `${n} חיובים שנכשלו`, cta: "בדוק חיובים", module: "customers", description: "תשלומים בסטטוס נכשל" },
  INCOMPLETE_ONBOARDING: { group: (n) => `${n} כרטיסי לקוח לא הושלמו`, cta: "השלם פתיחה", module: "customers", description: "לקוחות ללא מנוי פעיל או ממתין" },
  OUT_OF_STOCK: { group: (n) => `${n} מוצרים אזלו מהמלאי`, cta: "בדוק", module: "inventory", description: "מלאי אפס בסניף" },
  LOW_STOCK: { group: (n) => `${n} מוצרים במלאי נמוך`, cta: "פתח מלאי", module: "inventory", description: "מלאי מתחת למינימום שהוגדר" },
  NEAR_EXPIRY: { group: (n) => `${n} אצוות עם תוקף קרוב`, cta: "טפל", module: "inventory", description: "אצוות שתוקפן קרוב או עבר" },
  COUNT_DISCREPANCY: { group: (n) => `${n} פערי ספירת מלאי`, cta: "בדוק פער", module: "inventory", description: "ספירה פיזית שונה מהכמות במערכת" },
};

export const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "WARNING", "ATTENTION", "INFO"];
export const sevRank = (s: string) => SEVERITY_ORDER.indexOf(s as Severity);
export function worst(list: { severity: string }[]): Severity | null {
  if (!list.length) return null;
  return [...list].sort((a, b) => sevRank(a.severity) - sevRank(b.severity))[0].severity as Severity;
}

/** The record an insight should open in its module list */
export function insightTargetId(i: Insight): string {
  if (i.rule_key === "FAILED_PAYMENT") return String(i.metadata?.customer_id ?? i.entity_id);
  if (i.entity_type.startsWith("inventory_")) return String(i.metadata?.product_id ?? i.entity_id);
  return i.entity_id;
}

/** Short operational health label per rule, used in list "תקינות" columns */
export function healthLabel(i: Insight): string {
  switch (i.rule_key) {
    case "INVALID_FOLLOW_UP":
      return i.metadata?.reason === "OVERDUE_TASK" ? "משימה באיחור" : "אין משימה";
    case "MISSING_LOST_REASON": return "חסר תיעוד";
    case "INACTIVE_LEAD": return "לא מטופל";
    case "MISSING_COMPLIANCE": return "מסמכים חסרים";
    case "FAILED_PAYMENT": return "בעיית תשלום";
    case "INCOMPLETE_ONBOARDING": return "פתיחה לא הושלמה";
    case "OUT_OF_STOCK": return "אזל מהמלאי";
    case "LOW_STOCK": return "מלאי נמוך";
    case "NEAR_EXPIRY": return i.title;
    case "COUNT_DISCREPANCY": return "פער מלאי";
    default: return i.title;
  }
}
