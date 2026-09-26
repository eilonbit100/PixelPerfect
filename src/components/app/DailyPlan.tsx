import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Plus, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { TASK_PRIORITY, fmtRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

function usePlan(branchId: string | null) {
  const date = today();
  return useQuery({
    enabled: !!branchId,
    queryKey: ["daily-plan", branchId, date],
    queryFn: async () => {
      const [plan, tasks, pool] = await Promise.all([
        supabase.from("daily_plans").select("*").eq("branch_id", branchId!).eq("plan_date", date).maybeSingle(),
        supabase.from("tasks").select("*").eq("branch_id", branchId!).eq("plan_date", date).is("deleted_at", null).neq("status", "CANCELLED").order("plan_rank"),
        supabase.from("tasks").select("id,title,due_at").eq("branch_id", branchId!).is("plan_date", null).is("deleted_at", null).in("status", ["OPEN", "IN_PROGRESS"]).order("due_at").limit(50),
      ]);
      for (const r of [plan, tasks, pool]) if (r.error) throw r.error;
      return { date, plan: plan.data, tasks: tasks.data ?? [], pool: pool.data ?? [] };
    },
  });
}

/** Branch manager: system suggests, manager edits, then approves. After approval shows done / not done per employee. */
export function DailyPlanManager() {
  const { branchId, members, memberName } = useOrg();
  const qc = useQueryClient();
  const q = usePlan(branchId);
  const [adding, setAdding] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["daily-plan"] });

  const employees = members.filter((m) => m.role === "EMPLOYEE" && m.status !== "SUSPENDED");
  const act = useMutation({
    mutationFn: async (fn: () => PromiseLike<{ error: unknown }>) => { const { error } = await fn(); if (error) throw error; },
    onSuccess: refresh,
    onError: () => toast.error("הפעולה נכשלה"),
  });

  const byMember = useMemo(() => {
    const m = new Map<string, NonNullable<typeof q.data>["tasks"]>();
    (q.data?.tasks ?? []).forEach((t) => { const k = t.assigned_member_id ?? "none"; m.set(k, [...(m.get(k) ?? []), t]); });
    return [...m.entries()];
  }, [q.data]);

  if (!branchId) return null;
  const d = q.data;
  const approved = !!d?.plan?.approved_at;
  const done = d?.tasks.filter((t) => t.status === "COMPLETED").length ?? 0;

  return (
    <section className="panel mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">תוכנית העבודה להיום</h2>
          <p className="text-xs text-muted-foreground">
            {!d ? "" : !d.tasks.length ? "עוד לא נבנתה תוכנית" : approved ? <>אושרה · <span className="num">{done}/{d.tasks.length}</span> בוצעו</> : "הצעה — ממתינה לאישורך"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate(() => supabase.rpc("suggest_daily_plan", { _branch: branchId, _date: today() }))}>
            <Wand2 className="size-3.5" /> {d?.tasks.length ? "עדכן הצעה" : "הצע תוכנית"}
          </Button>
          {!!d?.tasks.length && !approved && (
            <Button size="sm" disabled={act.isPending} onClick={() => act.mutate(() => supabase.rpc("approve_daily_plan", { _branch: branchId, _date: today() }))}>
              <Check className="size-3.5" /> כן, אשר
            </Button>
          )}
        </div>
      </div>

      {q.isLoading ? <div className="p-4"><Skeleton className="h-4 w-full" /></div> : !d?.tasks.length ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">המערכת תסדר את המשימות הפתוחות לפי דחיפות ותחלק אותן לעובדים לפי תפקיד ועומס. אחר כך תוכל לשנות ולאשר.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 [&>div]:border-b [&>div]:border-e">
          {byMember.map(([mid, list]) => {
            const c = list.filter((t) => t.status === "COMPLETED").length;
            return (
              <div key={mid} className="p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{mid === "none" ? "ללא אחראי" : memberName(mid)}</span>
                  <span className="num text-muted-foreground">{c}/{list.length}</span>
                </div>
                <ul className="space-y-1.5">
                  {list.map((t) => (
                    <li key={t.id} className="group flex items-center gap-2 text-sm">
                      {t.status === "COMPLETED" ? <Check className="size-3.5 shrink-0 text-ok" /> : <Circle className="size-3 shrink-0 text-muted-foreground" />}
                      <span className={"min-w-0 flex-1 truncate " + (t.status === "COMPLETED" ? "text-muted-foreground line-through" : "")}>{t.title}</span>
                      {t.status !== "COMPLETED" && (
                        <>
                          <Select value={t.assigned_member_id ?? ""} onValueChange={(v) => act.mutate(() => supabase.from("tasks").update({ assigned_member_id: v }).eq("id", t.id))}>
                            <SelectTrigger className="h-6 w-6 shrink-0 justify-center border-0 bg-transparent p-0 opacity-0 group-hover:opacity-100 [&>svg]:size-3" aria-label="העבר לעובד"><span /></SelectTrigger>
                            <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{memberName(e.id)}</SelectItem>)}</SelectContent>
                          </Select>
                          <button aria-label="הסר מהתוכנית" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                            onClick={() => act.mutate(() => supabase.from("tasks").update({ plan_date: null, plan_rank: null }).eq("id", t.id))}><X className="size-3.5" /></button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {!!d?.tasks.length && (
        <div className="border-t px-4 py-2">
          {adding ? (
            <Select onValueChange={(v) => { setAdding(false); act.mutate(() => supabase.from("tasks").update({ plan_date: today(), plan_rank: 999 }).eq("id", v)); }}>
              <SelectTrigger className="h-8 w-72"><SelectValue placeholder="בחר משימה פתוחה להוספה" /></SelectTrigger>
              <SelectContent>{d.pool.map((p) => <SelectItem key={p.id} value={p.id}>{p.title} · {fmtRelative(p.due_at, true)}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setAdding(true)} disabled={!d.pool.length}>
              <Plus className="size-3.5" /> הוסף משימה לתוכנית
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Employee: today's approved plan, in priority order, check off when done. */
export function DailyPlanEmployee() {
  const { branchId, me } = useOrg();
  const qc = useQueryClient();
  const q = usePlan(branchId);
  const mine = (q.data?.tasks ?? []).filter((t) => t.assigned_member_id === me.id);
  const approved = !!q.data?.plan?.approved_at;
  const complete = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tasks").update({ status: "COMPLETED" }).eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-plan"] }),
  });
  if (!approved || !mine.length) return null;
  const done = mine.filter((t) => t.status === "COMPLETED").length;
  return (
    <section className="panel mb-6">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">התוכנית שלי להיום</h2>
        <span className="num text-xs text-muted-foreground">{done}/{mine.length}</span>
      </div>
      <ul className="divide-y">
        {mine.map((t, i) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="num w-4 text-xs text-muted-foreground">{i + 1}</span>
            <span className={"min-w-0 flex-1 truncate " + (t.status === "COMPLETED" ? "text-muted-foreground line-through" : "")}>{t.title}</span>
            <span className="text-xs text-muted-foreground">{TASK_PRIORITY[t.priority]}</span>
            {t.status === "COMPLETED" ? <Check className="size-4 text-ok" /> : (
              <Button size="sm" variant="outline" className="h-7" disabled={complete.isPending} onClick={() => complete.mutate(t.id)}>בוצע</Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
