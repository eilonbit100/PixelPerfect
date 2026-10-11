import { describe, expect, it } from "vitest";
import { TASK_OUTCOME, typesForRole } from "./tasks";

const types = [
  { key: "LEAD_CONTACT", allowed_roles: ["EMPLOYEE", "BRANCH_MANAGER"] },
  { key: "APPROVAL_REVIEW", allowed_roles: ["BRANCH_MANAGER", "HQ"] },
  { key: "NETWORK_REVIEW", allowed_roles: ["HQ"] },
];
describe("task types by role", () => {
  it("employee never gets approval tasks", () => expect(typesForRole(types, "EMPLOYEE").map((t) => t.key)).toEqual(["LEAD_CONTACT"]));
  it("HQ gets no reception sales tasks", () => expect(typesForRole(types, "HQ").map((t) => t.key)).toEqual(["APPROVAL_REVIEW", "NETWORK_REVIEW"]));
  it("sales outcomes include all seven spec results", () => expect(Object.keys(TASK_OUTCOME)).toHaveLength(7));
});
