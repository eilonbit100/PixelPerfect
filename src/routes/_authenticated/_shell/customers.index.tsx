import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInsights, useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { RULES, healthLabel, insightTargetId, worst, type Insight } from "@/lib/rules";
import { CUSTOMER_STATUS, MEMBERSHIP_STATUS, fmtDate, isValidIsraeliPhone } from "@/lib/format";
import { SeverityBadge, StatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, FilterChips, PageHeader, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Search = { filter?: string; rule?: string };

export const Route = createFileRoute("/_authenticated/_shell/customers/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    filter: typeof s.filter === "string" ? s.filter : undefined,
    rule: typeof s.rule === "string" ? s.rule : undefined,
  }),
  head: () => ({
    meta: [
      { title: "לקוחות — Pulse" },
      { name: "description", content: "לקוחות, מנויים ותקינות מסמכים ותשלומים." },
      { property: "og:title", content: "לקוחות — Pulse" },
      { property: "og:description", content: "לקוחות, מנויים ותקינות מסמכים ותשלומים." },
    ],
  }),
  component: CustomersPage,
});

function NewCustomer() {
  const { org, branches, branchId } = useOrg();
  const invalidate = useInvalidateAll();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ full_name: "", phone: "", email: "", national_id: "", branch: branchId ?? branches[0]?.id ?? "" });
  async function save() {
    if (!f.full_name.trim()) return toast.error("יש להזין שם");
    if (f.phone && !isValidIsraeliPhone(f.phone)) return toast.error("מספר הטלפון אינו תקין");
    const { data, error } = await supabase.from("customers").insert({
      organization_id: org.id, home_branch_id: f.branch, full_name: f.full_name.trim(), phone: f.phone || null,
      email: f.email || null, national_id: f.national_id || null, status: "PENDING",
    }).select("id").single();
    if (error) return toast.error(friendlyError(error));
    setOpen(false);
    invalidate();
    navigate({ to: "/customers/$id", params: { id: data.id } });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> לקוח חדש</Button></DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle>פתיחת כרטיס לקוח</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>שם מלא</Label><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>טלפון</Label><Input dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>ת״ז</Label><Input dir="ltr" value={f.national_id} onChange={(e) => setF({ ...f, national_id: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>אימייל</Label><Input dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>סניף</Label>
              <Select value={f.branch} onValueChange={(v) => setF({ ...f, branch: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2"><Button onClick={save}>פתח כרטיס</Button><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/customers/" });
  const { org, branchId, branchName } = useOrg();
  const insights = useInsights();
  const filter = search.filter ?? "all";

  const data = useQuery({
    queryKey: ["customers", org.id, branchId],
    queryFn: async () => {
      let q = supabase.from("customers").select("*").eq("organization_id", org.id).is("deleted_at", null).order("joined_at", { ascending: false }).limit(1000);
      if (branchId) q = q.eq("home_branch_id", branchId);
      const [c, m] = await Promise.all([q, supabase.from("memberships").select("customer_id,display_name,status,price").eq("organization_id", org.id).order("created_at", { ascending: false })]);
      if (c.error) throw c.error;
      if (m.error) throw m.error;
      const ms = new Map<string, (typeof m.data)[number]>();
      m.data.forEach((x) => { if (!ms.has(x.customer_id)) ms.set(x.customer_id, x); });
      return { customers: c.data, ms };
    },
  });

  const byCust = useMemo(() => {
    const m = new Map<string, Insight[]>();
    (insights.data ?? []).filter((i) => i.entity_type === "customer" || i.rule_key === "FAILED_PAYMENT")
      .forEach((i) => { const k = insightTargetId(i); m.set(k, [...(m.get(k) ?? []), i]); });
    return m;
  }, [insights.data]);

  const all = data.data?.customers ?? [];
  const has = (id: string, rule: string) => byCust.get(id)?.some((i) => i.rule_key === rule);
  const rows = useMemo(() => {
    let list = all;
    if (search.rule) list = list.filter((c) => has(c.id, search.rule!));
    const month = Date.now() - 30 * 864e5;
    switch (filter) {
      case "active": list = list.filter((c) => c.status === "ACTIVE"); break;
      case "inactive": list = list.filter((c) => c.status === "INACTIVE"); break;
      case "new": list = list.filter((c) => new Date(c.joined_at).getTime() > month); break;
      case "docs": list = list.filter((c) => has(c.id, "MISSING_COMPLIANCE")); break;
      case "payment": list = list.filter((c) => has(c.id, "FAILED_PAYMENT")); break;
      case "attention": list = list.filter((c) => byCust.has(c.id)); break;
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, byCust, filter, search.rule]);

  const set = (p: Partial<Search>) => navigate({ search: (s: Search) => ({ ...s, ...p }) });

  return (
    <div>
      <PageHeader title="לקוחות" subtitle="מנויים, מסמכים ותשלומים במבט אחד" actions={<NewCustomer />} />
      {search.rule && RULES[search.rule] && (
        <div className="mb-3 flex items-center gap-2 rounded-md border bg-accent px-3 py-2 text-sm text-accent-foreground">
          מציג רק רשומות עבור: <strong>{RULES[search.rule].description}</strong>
          <button onClick={() => set({ rule: undefined })} className="ms-auto inline-flex items-center gap-1 text-xs hover:underline"><X className="size-3.5" /> נקה</button>
        </div>
      )}
      <div className="mb-3">
        <FilterChips
          value={filter}
          onChange={(v) => set({ filter: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "כולם", count: all.length },
            { value: "active", label: "פעילים" },
            { value: "inactive", label: "לא פעילים" },
            { value: "new", label: "לקוחות חדשים" },
            { value: "docs", label: "מסמכים חסרים", count: all.filter((c) => has(c.id, "MISSING_COMPLIANCE")).length },
            { value: "payment", label: "בעיית תשלום", count: all.filter((c) => has(c.id, "FAILED_PAYMENT")).length },
            { value: "attention", label: "דורשים טיפול", count: all.filter((c) => byCust.has(c.id)).length },
          ]}
        />
      </div>
      <div className="panel overflow-x-auto">
        {data.isLoading || insights.isLoading ? <TableSkeleton cols={7} /> : data.error ? <ErrorState onRetry={() => data.refetch()} /> : !rows.length ? (
          all.length ? <EmptyState title="אין לקוחות שתואמים לסינון" /> : <EmptyState title="אין עדיין לקוחות" text="לקוחות חדשים ולידים שהומרו יופיעו כאן." action={<NewCustomer />} />
        ) : (
          <table className="data-table">
            <thead><tr><th>שם</th><th>טלפון</th><th>מנוי</th><th>סטטוס מנוי</th><th>סניף</th><th>הצטרפות</th><th>תקינות</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const m = data.data!.ms.get(c.id);
                const iss = byCust.get(c.id) ?? [];
                const w = worst(iss);
                return (
                  <tr key={c.id} className="cursor-pointer" onClick={() => navigate({ to: "/customers/$id", params: { id: c.id } })}>
                    <td className="font-medium"><Link to="/customers/$id" params={{ id: c.id }} onClick={(e) => e.stopPropagation()}>{c.full_name}</Link>
                      {c.status !== "ACTIVE" && <span className="ms-2 text-xs text-muted-foreground">{CUSTOMER_STATUS[c.status]}</span>}</td>
                    <td className="num text-muted-foreground">{c.phone ?? "—"}</td>
                    <td>{m?.display_name ?? "—"}</td>
                    <td>{m ? <StatusBadge tone={m.status === "ACTIVE" ? "ok" : m.status === "CANCELLED" ? "critical" : "neutral"}>{MEMBERSHIP_STATUS[m.status]}</StatusBadge> : <StatusBadge tone="attention">ללא מנוי</StatusBadge>}</td>
                    <td className="text-muted-foreground">{branchName(c.home_branch_id)}</td>
                    <td className="num text-muted-foreground">{fmtDate(c.joined_at)}</td>
                    <td>{w ? <SeverityBadge severity={w} label={iss.length > 1 ? `${healthLabel(iss.find((i) => i.severity === w)!)} +${iss.length - 1}` : healthLabel(iss[0])} /> : <SeverityBadge severity="OK" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
