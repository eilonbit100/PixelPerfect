import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RULES } from "@/lib/rules";

/** Opens the module list pre-filtered to exactly the records behind a rule */
export function RuleLink({ rule, children, className }: { rule: string; children: ReactNode; className?: string }) {
  const m = RULES[rule]?.module;
  if (m === "tasks") return <Link to="/tasks" search={{ filter: "overdue" }} className={className}>{children}</Link>;
  if (m === "customers") return <Link to="/customers" search={{ rule }} className={className}>{children}</Link>;
  if (m === "inventory") return <Link to="/inventory" search={{ rule }} className={className}>{children}</Link>;
  return <Link to="/leads" search={{ rule }} className={className}>{children}</Link>;
}
