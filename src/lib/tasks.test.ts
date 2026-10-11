import { describe, expect, it } from "vitest";
import { leadsWithoutTask, queueRank, snoozeUntil, sortQueue } from "./tasks";

const now = new Date("2026-10-11T10:00:00");
describe("tasks queue", () => {
  it("orders overdue, urgent, today, future", () => {
    const list = [
      { id: "f", status: "OPEN", priority: "NORMAL", due_at: "2026-10-15T10:00:00" },
      { id: "t", status: "OPEN", priority: "NORMAL", due_at: "2026-10-11T18:00:00" },
      { id: "u", status: "OPEN", priority: "URGENT", due_at: "2026-10-20T10:00:00" },
      { id: "o", status: "OPEN", priority: "LOW", due_at: "2026-10-10T10:00:00" },
    ];
    expect(sortQueue(list, now).map((x) => x.id)).toEqual(["o", "u", "t", "f"]);
  });
  it("completed past task is not overdue", () => {
    expect(queueRank({ status: "COMPLETED", priority: "NORMAL", due_at: "2026-10-01T10:00:00" }, now)).not.toBe(0);
  });
  it("lead without open task excludes lost/won and leads with a task", () => {
    const leads = [{ id: "a", status: "NEW" }, { id: "b", status: "NEW" }, { id: "c", status: "LOST" }, { id: "d", status: "WON" }];
    expect(leadsWithoutTask(leads, new Set(["b"])).map((l) => l.id)).toEqual(["a"]);
  });
  it("snooze 15 minutes", () => {
    expect(snoozeUntil(15, now)).toBe(new Date("2026-10-11T10:15:00").toISOString());
  });
});
