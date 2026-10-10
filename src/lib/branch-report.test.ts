import { describe, expect, it } from "vitest";
import { bmWarnings, pctChange, requestMetric } from "./branch-report";

describe("branch report rules", () => {
  it("does not expose zero request counts when entry is unavailable", () => {
    for (const key of ["req_total", "req_open", "req_handled", "req_completed"]) {
      expect(requestMetric({ [key]: 0 }, key, false)).toBeNull();
      expect(requestMetric({ [key]: 8 }, key, false)).toBeNull();
    }
  });
  it("returns real request counts including zero once entry is available", () => {
    expect(requestMetric({ req_total: 8 }, "req_total", true)).toBe(8);
    expect(requestMetric({ req_total: 0 }, "req_total", true)).toBe(0);
  });
  it("percent change vs previous period", () => { expect(pctChange(12, 10)).toBe(20); expect(pctChange(8, 10)).toBe(-20); });
  it("no percent when previous period is zero (no reliable base)", () => { expect(pctChange(5, 0)).toBeNull(); });
  it("warns when cancelled memberships lack an actual cancellation date", () => {
    expect(bmWarnings({ cancelled_no_date: 3 })).toHaveLength(1);
    expect(bmWarnings({ cancelled_no_date: 0 })).toHaveLength(0);
  });
});
