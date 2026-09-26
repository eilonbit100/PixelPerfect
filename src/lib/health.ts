export const PAYMENT_METHOD: Record<string, string> = {
  CREDIT_CARD: "כרטיס אשראי", STANDING_ORDER: "הוראת קבע", CASH: "מזומן", BIT: "ביט", BANK_TRANSFER: "העברה בנקאית", CHECK: "צ׳ק",
};

export type HealthState = "VALID" | "EXPIRING" | "EXPIRED" | "PENDING" | "MISSING";
export const HEALTH_LABEL: Record<HealthState, string> = {
  VALID: "בתוקף", EXPIRING: "פג בקרוב", EXPIRED: "פג תוקף", PENDING: "ממתין לאישור", MISSING: "חסר",
};

/** Health declaration state from its compliance item */
export function healthState(item?: { status: string; expires_at: string | null } | null): HealthState {
  if (!item || item.status === "MISSING") return "MISSING";
  if (item.status === "PENDING") return "PENDING";
  if (item.status === "EXPIRED") return "EXPIRED";
  if (item.status !== "VALID") return "MISSING";
  if (!item.expires_at) return "VALID";
  const t = new Date(item.expires_at).getTime();
  if (t < Date.now()) return "EXPIRED";
  if (t < Date.now() + 30 * 864e5) return "EXPIRING";
  return "VALID";
}

export const healthSeverity = (s: HealthState) =>
  s === "VALID" ? "OK" : s === "EXPIRING" || s === "PENDING" ? "ATTENTION" : "HIGH";

/** Active member without a valid declaration may not enter until re-signed and approved */
export const entryBlocked = (s: HealthState, activeMember: boolean) => activeMember && (s === "EXPIRED" || s === "MISSING" || s === "PENDING");
