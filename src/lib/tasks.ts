export const TASK_CATEGORY: Record<string, string> = { SALES: "מכירה", SERVICE: "שירות", OPS: "תפעול", GENERAL: "כללי" };
export const TASK_OUTCOME: Record<string, string> = {
  CONTACTED: "נוצר קשר", NO_ANSWER: "לא נענה", FOLLOW_UP: "נקבע מעקב נוסף",
  MEETING: "נקבעה פגישה", SALE: "בוצעה מכירה", NOT_RELEVANT: "לא רלוונטי",
};
export const OPEN_STATUSES = ["OPEN", "IN_PROGRESS"];

type T = { status: string; due_at: string; priority: string };
export const isOpen = (t: { status: string }) => OPEN_STATUSES.includes(t.status);
export const isOverdue = (t: T, now = new Date()) => isOpen(t) && new Date(t.due_at) < now;

/** Personal queue order: 0 overdue, 1 urgent, 2 due today, 3 future. */
export function queueRank(t: T, now = new Date()): number {
  if (isOverdue(t, now)) return 0;
  if (t.priority === "URGENT") return 1;
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  if (new Date(t.due_at) <= end) return 2;
  return 3;
}
export function sortQueue<X extends T>(list: X[], now = new Date()): X[] {
  return [...list].sort((a, b) => queueRank(a, now) - queueRank(b, now) || +new Date(a.due_at) - +new Date(b.due_at));
}
/** Leads that still need a person-level follow-up: not closed and with no open task. */
export function leadsWithoutTask<L extends { id: string; status: string }>(leads: L[], openTaskLeadIds: Set<string>): L[] {
  return leads.filter((l) => l.status !== "LOST" && l.status !== "WON" && !openTaskLeadIds.has(l.id));
}
/** Snooze moves only the reminder, never the due date. */
export function snoozeUntil(minutes: number, now = new Date()): string {
  return new Date(now.getTime() + minutes * 60000).toISOString();
}
