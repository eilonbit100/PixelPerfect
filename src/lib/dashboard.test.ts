import { describe, expect, it } from "vitest";
import { daysLeft, leadState, reorderSuggestion, type PeopleLead } from "./dashboard";

const now = new Date("2026-10-11T12:00:00");
const lead = (o: Partial<PeopleLead>): PeopleLead => ({
  id: "1", full_name: "x", phone: null, stage: "LEAD", status: "NEW", assigned_member_id: null, created_at: now.toISOString(),
  branch_id: "b", last_call_at: null, last_result: null, attempts: 0, next_due: null, ...o,
});

describe("lead priority", () => {
  it("new lead untouched over 24h is an exception", () => {
    expect(leadState(lead({ created_at: new Date(now.getTime() - 25 * 3600e3).toISOString() }), now)).toBe("new_overdue");
  });
  it("new lead under 24h is due today", () => {
    expect(leadState(lead({ created_at: new Date(now.getTime() - 2 * 3600e3).toISOString() }), now)).toBe("new");
  });
  it("prospect with past follow-up is overdue", () => {
    expect(leadState(lead({ stage: "PROSPECT", status: "FOLLOW_UP", last_call_at: now.toISOString(), next_due: "2026-10-10T09:00:00" }), now)).toBe("followup_overdue");
  });
  it("prospect without follow-up is flagged", () => {
    expect(leadState(lead({ stage: "PROSPECT", status: "FOLLOW_UP", last_call_at: now.toISOString() }), now)).toBe("no_followup");
  });
});

describe("reorder", () => {
  it("days left from 30-day sales rate", () => {
    expect(daysLeft(10, 30)).toBe(10);
    expect(daysLeft(10, 0)).toBeNull();
  });
  it("orders up to target plus lead-time demand", () => {
    expect(reorderSuggestion({ current: 10, minimum: 5, target: 40, sold30: 30, leadTime: 7 })).toEqual({ need: true, qty: 37, daysLeft: 10 });
  });
  it("no sales: below minimum orders to double the minimum", () => {
    expect(reorderSuggestion({ current: 2, minimum: 5, target: null, sold30: 0, leadTime: 7 }).qty).toBe(8);
  });
  it("healthy stock needs nothing", () => {
    expect(reorderSuggestion({ current: 100, minimum: 5, target: 40, sold30: 30, leadTime: 7 }).need).toBe(false);
  });
});
