// Card health = a read view over existing sources (compliance items, payments, memberships, customer fields).
// It never creates its own records, so fixing a source closes the issue everywhere.

export type HealthCategory = "HEALTH" | "DOCS" | "FAILED_PAYMENT" | "PAYMENT_METHOD" | "PERSONAL";
export type HealthSeverity = "BLOCKS_ENTRY" | "URGENT" | "INFO";

export const CATEGORY_LABEL: Record<HealthCategory, string> = {
  HEALTH: "הצהרות בריאות",
  DOCS: "תקנונים וטפסים",
  FAILED_PAYMENT: "תשלומים שנכשלו",
  PAYMENT_METHOD: "הוראת קבע / אמצעי תשלום",
  PERSONAL: "פרטים אישיים חסרים",
};
export const SEVERITY_LABEL: Record<HealthSeverity, string> = {
  BLOCKS_ENTRY: "חוסם כניסה",
  URGENT: "דורש טיפול דחוף",
  INFO: "השלמת מידע",
};

/** Plans billed recurrently need a standing payment method; punch cards / yearly paid upfront do not. */
export const RECURRING_BILLING = ["MONTHLY"];
/** Required personal fields for any person with a membership. */
export const REQUIRED_FIELDS: { key: "phone" | "national_id" | "birth_date" | "address"; label: string }[] = [
  { key: "phone", label: "טלפון" },
  { key: "national_id", label: "תעודת זהות" },
  { key: "birth_date", label: "תאריך לידה" },
];

export type HealthIssue = {
  key: string;
  category: HealthCategory;
  severity: HealthSeverity;
  title: string;
  detectedAt: string | null;
  refId?: string;
};

type Item = { id: string; status: string; expires_at: string | null; updated_at: string; requirement: { key: string; name: string; required?: boolean; active?: boolean } | null };
type Pay = { id: string; status: string; amount: number; due_at: string | null; created_at: string; failure_reason?: string | null };
type Mem = { status: string; billing_period?: string | null };
type Cust = { phone: string | null; national_id: string | null; birth_date: string | null; address: string | null; payment_method: string | null; created_at: string };

export function cardHealth(c: Cust, items: Item[], payments: Pay[], memberships: Mem[], now = new Date()): HealthIssue[] {
  const out: HealthIssue[] = [];
  const live = memberships.filter((m) => ["ACTIVE", "FROZEN", "PENDING"].includes(m.status));
  const hasActive = live.some((m) => m.status === "ACTIVE");

  for (const it of items) {
    const r = it.requirement;
    if (!r || r.active === false || it.status === "NOT_REQUIRED" || r.key === "PAYMENT_METHOD") continue;
    const expired = it.status === "EXPIRED" || (it.status === "VALID" && it.expires_at && new Date(it.expires_at) < now);
    const bad = expired || it.status === "MISSING" || it.status === "PENDING";
    if (!bad) continue;
    const state = expired ? "פג תוקף" : it.status === "PENDING" ? "ממתין לאישור" : "חסר";
    if (r.key === "HEALTH_DECLARATION") {
      out.push({ key: it.id, category: "HEALTH", severity: hasActive && it.status !== "PENDING" ? "BLOCKS_ENTRY" : "URGENT", title: `${r.name}: ${state}`, detectedAt: it.updated_at, refId: it.id });
    } else {
      out.push({ key: it.id, category: "DOCS", severity: "URGENT", title: `${r.name}: ${state}`, detectedAt: it.updated_at, refId: it.id });
    }
  }

  for (const p of payments) {
    if (p.status === "FAILED") out.push({ key: p.id, category: "FAILED_PAYMENT", severity: "URGENT", title: `חיוב שנכשל${p.failure_reason ? ` (${p.failure_reason})` : ""}`, detectedAt: p.due_at ?? p.created_at, refId: p.id });
  }

  if (live.some((m) => m.billing_period && RECURRING_BILLING.includes(m.billing_period)) && !c.payment_method) {
    out.push({ key: "pm", category: "PAYMENT_METHOD", severity: "URGENT", title: "חסר אמצעי תשלום למסלול חודשי", detectedAt: null });
  }

  if (live.length) {
    const missing = REQUIRED_FIELDS.filter((f) => !c[f.key]);
    if (missing.length) out.push({ key: "personal", category: "PERSONAL", severity: "INFO", title: `חסר: ${missing.map((f) => f.label).join(", ")}`, detectedAt: null });
  }
  return out;
}

/** Customers with any open issue — each counted once. */
export function countUnhealthy(issuesByCustomer: Map<string, HealthIssue[]>) {
  let n = 0;
  issuesByCustomer.forEach((v) => { if (v.length) n++; });
  return n;
}
