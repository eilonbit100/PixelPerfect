import { describe, expect, it } from "vitest";
import { cardHealth, countUnhealthy } from "./card-health";

const base = { phone: "050", national_id: "1", birth_date: "1990-01-01", address: null, payment_method: "CREDIT", created_at: "2026-01-01" };
const now = new Date("2026-10-10");
const health = (status: string, expires_at: string | null = null) => ({ id: "h", status, expires_at, updated_at: "2026-10-01", requirement: { key: "HEALTH_DECLARATION", name: "הצהרת בריאות" } });

describe("card health", () => {
  it("missing health declaration blocks entry for an active member", () => {
    const r = cardHealth(base, [health("MISSING")], [], [{ status: "ACTIVE" }], now);
    expect(r[0].severity).toBe("BLOCKS_ENTRY");
  });
  it("expired-by-date declaration is detected", () => {
    expect(cardHealth(base, [health("VALID", "2026-09-01")], [], [{ status: "ACTIVE" }], now)).toHaveLength(1);
  });
  it("payment method is required only for monthly plans", () => {
    const c = { ...base, payment_method: null };
    expect(cardHealth(c, [], [], [{ status: "ACTIVE", billing_period: "PUNCH_CARD" }], now)).toHaveLength(0);
    expect(cardHealth(c, [], [], [{ status: "ACTIVE", billing_period: "MONTHLY" }], now)[0].category).toBe("PAYMENT_METHOD");
  });
  it("failed payment is its own issue", () => {
    const r = cardHealth(base, [], [{ id: "p", status: "FAILED", amount: 100, due_at: null, created_at: "2026-10-01" }], [], now);
    expect(r[0].category).toBe("FAILED_PAYMENT");
  });
  it("customer with three issues counts once in the total", () => {
    const issues = cardHealth({ ...base, payment_method: null, national_id: null }, [health("MISSING")], [{ id: "p", status: "FAILED", amount: 1, due_at: null, created_at: "x" }], [{ status: "ACTIVE", billing_period: "MONTHLY" }], now);
    expect(new Set(issues.map((i) => i.category)).size).toBe(4);
    expect(countUnhealthy(new Map([["a", issues], ["b", []]]))).toBe(1);
  });
  it("fixing one issue leaves the others open", () => {
    const issues = cardHealth(base, [health("VALID", "2027-01-01")], [{ id: "p", status: "FAILED", amount: 1, due_at: null, created_at: "x" }], [{ status: "ACTIVE" }], now);
    expect(issues.map((i) => i.category)).toEqual(["FAILED_PAYMENT"]);
  });
});
