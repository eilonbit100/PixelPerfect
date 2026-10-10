import { describe, expect, it } from "vitest";
import { bmWarnings, pctChange } from "./branch-report";

describe("branch report rules", () => {
  it("percent change vs previous period", () => { expect(pctChange(12, 10)).toBe(20); expect(pctChange(8, 10)).toBe(-20); });
  it("no percent when previous period is zero (no reliable base)", () => { expect(pctChange(5, 0)).toBeNull(); });
  it("warns when cancelled memberships lack an actual cancellation date", () => {
    expect(bmWarnings({ cancelled_no_date: 3 })).toHaveLength(1);
    expect(bmWarnings({ cancelled_no_date: 0 })).toHaveLength(0);
  });
});
