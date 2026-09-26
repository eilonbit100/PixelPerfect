import { AlertOctagon, AlertTriangle, CheckCircle2, CircleAlert, Info, Bot, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/rules";

/** Maps the 5 technical severities to the 4-level operational language */
export const SEVERITY_UI: Record<Severity | "OK", { label: string; icon: typeof Info; cls: string; dot: string }> = {
  OK: { label: "תקין", icon: CheckCircle2, cls: "bg-ok-soft text-ok", dot: "bg-ok" },
  INFO: { label: "מידע", icon: Info, cls: "bg-info-soft text-info", dot: "bg-info" },
  ATTENTION: { label: "תשומת לב", icon: CircleAlert, cls: "bg-attention-soft text-attention", dot: "bg-attention" },
  WARNING: { label: "חריגה", icon: AlertTriangle, cls: "bg-warning-soft text-warning", dot: "bg-warning" },
  HIGH: { label: "דורש טיפול", icon: AlertOctagon, cls: "bg-critical-soft text-critical", dot: "bg-critical" },
  CRITICAL: { label: "דורש טיפול", icon: AlertOctagon, cls: "bg-critical-soft text-critical", dot: "bg-critical" },
};

export function SeverityBadge({ severity, label, className }: { severity: Severity | "OK" | null; label?: string; className?: string }) {
  const s = SEVERITY_UI[severity ?? "OK"];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", s.cls, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label ?? s.label}
    </span>
  );
}

export function SeverityIcon({ severity, className }: { severity: Severity | "OK"; className?: string }) {
  const s = SEVERITY_UI[severity];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md", s.cls, className)}>
      <Icon className="size-4" aria-label={s.label} />
    </span>
  );
}

const TONES = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-accent text-accent-foreground",
  ok: "bg-ok-soft text-ok",
  warning: "bg-warning-soft text-warning",
  critical: "bg-critical-soft text-critical",
  attention: "bg-attention-soft text-attention",
} as const;

export function StatusBadge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: keyof typeof TONES; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const auto = source === "RULE" || source === "SYSTEM";
  const Icon = auto ? Bot : Hand;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", auto ? "text-accent-foreground" : "text-muted-foreground")}>
      <Icon className="size-3.5" aria-hidden />
      {auto ? "אוטומטית" : "ידנית"}
    </span>
  );
}

export function leadStatusTone(s: string): keyof typeof TONES {
  if (s === "WON") return "ok";
  if (s === "LOST") return "neutral";
  if (s === "FOLLOW_UP" || s === "TRIAL") return "primary";
  return "neutral";
}
