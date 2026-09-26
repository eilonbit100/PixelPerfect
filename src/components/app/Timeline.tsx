import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, MessageSquare, Phone, RefreshCw, UserPlus, XCircle, ListTodo, FileText, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVITY_LABEL, LEAD_STATUS, LOSS_REASON, fmtDateTime } from "@/lib/format";
import { TableSkeleton, ErrorState, EmptyState } from "./states";

const ICONS: Record<string, typeof Circle> = {
  LEAD_CREATED: UserPlus, CUSTOMER_CREATED: UserPlus, CALL: Phone, WHATSAPP: MessageSquare, NOTE: MessageSquare, MEETING: MessageSquare,
  STATUS_CHANGED: RefreshCw, TASK_CREATED: ListTodo, TASK_COMPLETED: CheckCircle2, LOST_REASON: XCircle, CONVERTED: CheckCircle2,
  DOCUMENT: FileText, PAYMENT: CreditCard,
};

export function Timeline({ entityType, entityId }: { entityType: string; entityId: string }) {
  const q = useQuery({
    queryKey: ["activities", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("activities").select("*")
        .eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <TableSkeleton rows={4} cols={2} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState title="אין עדיין פעילות" text="שיחות, הערות ושינויי סטטוס יופיעו כאן." />;

  return (
    <ol className="relative space-y-0 ps-1">
      {q.data.map((a, idx) => {
        const Icon = ICONS[a.activity_type] ?? Circle;
        const meta = (a.metadata ?? {}) as Record<string, string>;
        let detail = a.description ?? "";
        if (a.activity_type === "STATUS_CHANGED" || a.activity_type === "CONVERTED")
          detail = `${LEAD_STATUS[meta.from] ?? meta.from ?? ""} ← ${LEAD_STATUS[meta.to] ?? meta.to ?? ""}`.trim();
        if (a.activity_type === "LOST_REASON")
          detail = [LOSS_REASON[meta.loss_reason], a.description].filter(Boolean).join(" · ");
        return (
          <li key={a.id} className="relative flex gap-3 pb-5">
            {idx < q.data.length - 1 && <span className="absolute top-8 bottom-0 start-[15px] w-px bg-border" aria-hidden />}
            <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-surface text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{ACTIVITY_LABEL[a.activity_type] ?? a.activity_type}</span>
                <span className="text-xs text-muted-foreground num">{fmtDateTime(a.created_at)}</span>
              </div>
              {detail && <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
