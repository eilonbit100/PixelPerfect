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
