import { describe, expect, it } from "vitest";
import { countGap, moveAllowed, moveProblem, returnWindowDays } from "./inventory";

const base = { qty: "2", reason: "", branch: "a", toBranch: "", lotRequired: false, lotId: "" };
describe("inventory movement rules", () => {
  it("employee cannot write off, return to supplier or transfer", () => {
    expect(moveAllowed("WRITE_OFF", false)).toBe(false);
    expect(moveAllowed("RETURN_TO_SUPPLIER", false)).toBe(false);
    expect(moveAllowed("TRANSFER_OUT", false)).toBe(false);
    expect(moveAllowed("RECEIPT", false)).toBe(true);
  });
  it("write-off requires a reason", () => expect(moveProblem({ ...base, type: "WRITE_OFF" })).toBe("יש לציין סיבה"));
  it("transfer requires another branch", () => expect(moveProblem({ ...base, type: "TRANSFER_OUT", toBranch: "a" })).not.toBeNull());
  it("sale quantity must be positive", () => expect(moveProblem({ ...base, type: "SALE", qty: "0" })).not.toBeNull());
  it("return to supplier needs a lot when lots exist", () => expect(moveProblem({ ...base, type: "RETURN_TO_SUPPLIER", lotRequired: true })).toBe("יש לבחור אצווה להחזרה"));
  it("uncounted line has no gap (not zero)", () => expect(countGap({ system_qty: 5, counted_qty: null })).toBeNull());
  it("gap = counted - system", () => expect(countGap({ system_qty: 5, counted_qty: 3 })).toBe(-2));
  it("product return window overrides the supplier window", () => expect(returnWindowDays(14, 30)).toBe(14));
  it("empty product return window inherits the supplier window", () => expect(returnWindowDays(null, 30)).toBe(30));
  it("zero-day product return window remains an explicit override", () => expect(returnWindowDays(0, 30)).toBe(0));
});
