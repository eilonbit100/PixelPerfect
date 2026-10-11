import type { ReactNode } from "react";
import { Inbox, RefreshCw, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon ?? <Inbox className="size-5" />}</div>
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-critical-soft text-critical"><CloudOff className="size-5" /></div>
      <p className="font-medium">לא הצלחנו לטעון את הנתונים</p>
      <p className="mt-1 text-sm text-muted-foreground">נסה שוב בעוד רגע.</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="size-4" /> נסה שוב
        </Button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" style={{ maxWidth: c === 0 ? 180 : 110 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function FilterChips<T extends string>({ options, value, onChange, dense }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; dense?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={
              "inline-flex items-center gap-1.5 rounded-md border transition-colors " +
              (dense ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-sm") +
              (active ? "border-foreground/80 bg-foreground text-background" : "bg-surface text-foreground hover:bg-muted")
            }
          >

            {o.label}
            {o.count !== undefined && <span className={"num text-xs " + (active ? "opacity-70" : "text-muted-foreground")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
