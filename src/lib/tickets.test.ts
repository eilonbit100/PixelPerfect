import { describe, expect, it } from "vitest";
import { fileProblem, isOverdue } from "./tickets";

const now = new Date("2026-10-10T12:00:00Z");
describe("tickets", () => {
  it("open ticket past its due date is overdue", () => {
    expect(isOverdue({ due_at: "2026-10-09T12:00:00Z", status: "IN_PROGRESS" }, now)).toBe(true);
  });
  it("closed ticket is never overdue", () => {
    expect(isOverdue({ due_at: "2026-10-09T12:00:00Z", status: "CLOSED" }, now)).toBe(false);
  });
  it("ticket without due date is not overdue", () => {
    expect(isOverdue({ due_at: null, status: "OPEN" }, now)).toBe(false);
  });
  it("only images and PDF up to 10MB are accepted", () => {
    expect(fileProblem({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(fileProblem({ type: "image/png", size: 11 * 1024 * 1024 })).not.toBeNull();
    expect(fileProblem({ type: "application/zip", size: 10 })).not.toBeNull();
  });
});

import { TYPE_FIELDS, ticketFormErrors } from "./tickets";
describe("ticket form rules", () => {
  const base = { type: "FAULT", title: "t", details: "d", branch: "b", amount: "", equipment: "", approval_kind: "", quantity: "" };
  it("fault shows no supplier/approver fields", () => {
    expect(TYPE_FIELDS.FAULT).not.toContain("supplier_id");
    expect(TYPE_FIELDS.FAULT).not.toContain("approver");
  });
  it("quote requires amount", () => expect(ticketFormErrors({ ...base, type: "QUOTE" }).amount).toBeTruthy());
  it("purchase requires item", () => expect(ticketFormErrors({ ...base, type: "PURCHASE" }).equipment).toBeTruthy());
  it("approval requires kind", () => expect(ticketFormErrors({ ...base, type: "APPROVAL" }).approval_kind).toBeTruthy());
  it("valid fault passes", () => expect(ticketFormErrors(base)).toEqual({}));
});
