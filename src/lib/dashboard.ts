// Pure prioritization helpers for the role dashboards. Data comes from dashboard_people / dashboard_inventory RPCs.

export type PeopleLead = {
  id: string; full_name: string; phone: string | null; stage: string; status: string;
  assigned_member_id: string | null; created_at: string; branch_id: string;
  last_call_at: string | null; last_result: string | null; attempts: number; next_due: string | null;
};

export type LeadState = "new_overdue" | "new" | "followup_overdue" | "followup_today" | "no_followup" | "scheduled";

export const NEW_LEAD_SLA_H = 24;

const endOfDay = (now: Date) => { const d = new Date(now); d.setHours(23, 59, 59, 999); return d; };

export function leadState(l: PeopleLead, now = new Date()): LeadState {
  const untouched = l.stage === "LEAD" && l.status === "NEW" && !l.last_call_at;
  if (untouched) return now.getTime() - new Date(l.created_at).getTime() > NEW_LEAD_SLA_H * 3600e3 ? "new_overdue" : "new";
  if (!l.next_due) return "no_followup";
  const due = new Date(l.next_due);
  if (due < now) return "followup_overdue";
  if (due <= endOfDay(now)) return "followup_today";
  return "scheduled";
}

const RANK: Record<LeadState, number> = { new_overdue: 0, followup_overdue: 1, new: 2, followup_today: 3, no_followup: 4, scheduled: 5 };

export const LEAD_STATE_UI: Record<LeadState, { label: string; sev: "CRITICAL" | "HIGH" | "ATTENTION" | "OK" }> = {
  new_overdue: { label: "ליד חדש — לא חזרו מעל 24 שעות", sev: "CRITICAL" },
  followup_overdue: { label: "מעקב באיחור", sev: "CRITICAL" },
  new: { label: "ליד חדש — לחזור היום", sev: "HIGH" },
  followup_today: { label: "מעקב היום", sev: "HIGH" },
  no_followup: { label: "אין מעקב מתוכנן", sev: "ATTENTION" },
  scheduled: { label: "מעקב מתוכנן", sev: "OK" },
};

export function prioritizeLeads(list: PeopleLead[], now = new Date()) {
  return list
    .map((l) => ({ ...l, state: leadState(l, now) }))
    .sort((a, b) => RANK[a.state] - RANK[b.state] || +new Date(a.created_at) - +new Date(b.created_at));
}

/** Today's to-do: new/overdue leads and prospects whose follow-up is due today or earlier. */
export const isActionToday = (s: LeadState) => s === "new_overdue" || s === "new" || s === "followup_overdue" || s === "followup_today";

/** Mirrors SQL _inv_stats: days of stock left at the 30-day sales rate (null without sales). */
export function daysLeft(current: number, sold30: number): number | null {
  if (sold30 <= 0) return null;
  return Math.round((current / (sold30 / 30)) * 10) / 10;
}

/** Mirrors SQL _inv_stats: reorder when at/below minimum or stock runs out before delivery + 7 days. */
export function reorderSuggestion(p: { current: number; minimum: number; target: number | null; sold30: number; leadTime: number }) {
  const dl = daysLeft(p.current, p.sold30);
  const need = p.current <= p.minimum || (dl !== null && dl <= p.leadTime + 7);
  if (!need) return { need, qty: 0, daysLeft: dl };
  const qty = Math.max(0, Math.ceil((p.target ?? p.minimum * 2) + (p.sold30 / 30) * p.leadTime - p.current));
  return { need, qty, daysLeft: dl };
}
