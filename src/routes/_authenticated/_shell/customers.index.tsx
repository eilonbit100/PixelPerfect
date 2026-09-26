import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X, Search as SearchIcon } from "lucide-react";
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

type SearchField = "all" | "name" | "phone" | "nid" | "nid4";
const FIELD_PLACEHOLDER: Record<SearchField, string> = {
  all: "חיפוש לפי שם, טלפון או ת״ז",
  name: "הקלד שם מלא",
  phone: "הקלד מספר טלפון",
  nid: "הקלד מספר תעודת זהות",
  nid4: "4 ספרות אחרונות",
};

type Search = { filter?: string; rule?: string; q?: string };

export const Route = createFileRoute("/_authenticated/_shell/customers/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    filter: typeof s.filter === "string" ? s.filter : undefined,
    rule: typeof s.rule === "string" ? s.rule : undefined,
    q: typeof s.q === "string" ? s.q : typeof s.q === "number" ? String(s.q) : undefined,
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
  const [field, setField] = useState<SearchField>("all");
  const [qInput, setQInput] = useState(search.q ?? "");
  const [q, setQ] = useState(search.q ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim());
      navigate({ search: (s: Search) => ({ ...s, q: qInput.trim() || undefined }), replace: true });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  const data = useQuery({
    queryKey: ["customers-list", org.id, branchId],
    queryFn: async () => {
      let q = supabase.from("customers").select("*").eq("organization_id", org.id).is("deleted_at", null).order("joined_at", { ascending: false }).limit(5000);
      if (branchId) q = q.eq("home_branch_id", branchId);
      const [c, m, p] = await Promise.all([
        q,
        supabase.from("memberships").select("customer_id,display_name,status,price").eq("organization_id", org.id).order("created_at", { ascending: false }),
        supabase.from("payments").select("customer_id,paid_at,amount").eq("organization_id", org.id).eq("status", "PAID").limit(20000),
      ]);
      if (c.error) throw c.error;
      if (m.error) throw m.error;
      if (p.error) throw p.error;
      const ms = new Map<string, (typeof m.data)[number]>();
      m.data.forEach((x) => { if (!ms.has(x.customer_id)) ms.set(x.customer_id, x); });
      const buys = new Map<string, { count: number; last: string | null }>();
      p.data.forEach((x) => {
        const cur = buys.get(x.customer_id) ?? { count: 0, last: null };
        cur.count++;
        if (x.paid_at && (!cur.last || x.paid_at > cur.last)) cur.last = x.paid_at;
        buys.set(x.customer_id, cur);
      });
      return { customers: c.data, ms, buys };
    },
  });

  const byCust = useMemo(() => {
    const m = new Map<string, Insight[]>();
    (insights.data ?? []).filter((i) => i.entity_type === "customer" || i.rule_key === "FAILED_PAYMENT")
      .forEach((i) => { const k = insightTargetId(i); m.set(k, [...(m.get(k) ?? []), i]); });
    return m;
  }, [insights.data]);

  const all = data.data?.customers ?? [];
  const ms = data.data?.ms;
  const buys = data.data?.buys;
  const has = (id: string, rule: string) => byCust.get(id)?.some((i) => i.rule_key === rule);
  const activeMember = (id: string) => ms?.get(id)?.status === "ACTIVE";
  const noMemberBuyer = (id: string) => !activeMember(id) && (buys?.get(id)?.count ?? 0) > 0;

  const searched = useMemo(() => {
    if (!q) return all;
    const text = q.toLowerCase();
    const digits = q.replace(/\D/g, "");
    const byName = (c: (typeof all)[number]) => c.full_name.toLowerCase().includes(text);
    const byPhone = (c: (typeof all)[number]) => {
      if (!digits) return false;
      const phone = (c.phone ?? "").replace(/\D/g, "");
      const local = phone.startsWith("972") ? "0" + phone.slice(3) : phone;
      return local.includes(digits) || phone.includes(digits);
    };
    const nidOf = (c: (typeof all)[number]) => (c.national_id ?? "").replace(/\D/g, "");
    return all.filter((c) => {
      switch (field) {
        case "name": return byName(c);
        case "phone": return byPhone(c);
        case "nid": return !!digits && nidOf(c).includes(digits);
        case "nid4": return !!digits && nidOf(c).endsWith(digits);
        default:
          return byName(c) || (!!c.email && c.email.toLowerCase().includes(text)) ||
            (digits.length >= 3 && (byPhone(c) || (digits.length === 4 ? nidOf(c).endsWith(digits) : nidOf(c).includes(digits))));
      }
    });
  }, [all, q, field]);

  const rows = useMemo(() => {
    let list = searched;
    if (search.rule) list = list.filter((c) => has(c.id, search.rule!));
    const month = Date.now() - 30 * 864e5;
    switch (filter) {
      case "active": list = list.filter((c) => c.status === "ACTIVE"); break;
      case "inactive": list = list.filter((c) => c.status === "INACTIVE"); break;
      case "new": list = list.filter((c) => new Date(c.joined_at).getTime() > month); break;
      case "buyers": list = list.filter((c) => noMemberBuyer(c.id)); break;
      case "docs": list = list.filter((c) => has(c.id, "MISSING_COMPLIANCE")); break;
      case "payment": list = list.filter((c) => has(c.id, "FAILED_PAYMENT")); break;
      case "attention": list = list.filter((c) => byCust.has(c.id)); break;
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, byCust, filter, search.rule, ms, buys]);

  const [limit, setLimit] = useState(100);
  useEffect(() => setLimit(100), [q, filter, search.rule]);
  const visible = rows.slice(0, limit);
  const month = Date.now() - 30 * 864e5;

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
      <div className="mb-3 flex flex-col gap-3">
        <div className="flex max-w-xl gap-2">
          <Select value={field} onValueChange={(v) => setField(v as SearchField)}>
            <SelectTrigger className="w-40 shrink-0" aria-label="חיפוש לפי"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל השדות</SelectItem>
              <SelectItem value="name">שם מלא</SelectItem>
              <SelectItem value="phone">טלפון</SelectItem>
              <SelectItem value="nid">תעודת זהות</SelectItem>
              <SelectItem value="nid4">4 ספרות אחרונות ת״ז</SelectItem>
            </SelectContent>
          </Select>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={FIELD_PLACEHOLDER[field]}
            dir={field === "name" || field === "all" ? "rtl" : "ltr"}
            inputMode={field === "name" || field === "all" ? "text" : "numeric"}
            maxLength={field === "nid4" ? 4 : undefined}
            className="ps-9 pe-9"
            aria-label="חיפוש לקוחות"
          />
          {qInput && (
            <button onClick={() => setQInput("")} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="נקה חיפוש">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        </div>
        <FilterChips
          value={filter}
          onChange={(v) => set({ filter: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: "כולם", count: searched.length },
            { value: "active", label: "פעילים", count: searched.filter((c) => c.status === "ACTIVE").length },
            { value: "inactive", label: "לא פעילים", count: searched.filter((c) => c.status === "INACTIVE").length },
            { value: "new", label: "לקוחות חדשים", count: searched.filter((c) => new Date(c.joined_at).getTime() > month).length },
            { value: "buyers", label: "ללא מנוי, עם רכישות", count: searched.filter((c) => noMemberBuyer(c.id)).length },
            { value: "docs", label: "מסמכים חסרים", count: searched.filter((c) => has(c.id, "MISSING_COMPLIANCE")).length },
            { value: "payment", label: "בעיית תשלום", count: searched.filter((c) => has(c.id, "FAILED_PAYMENT")).length },
            { value: "attention", label: "דורשים טיפול", count: searched.filter((c) => byCust.has(c.id)).length },
          ]}
        />
        {!data.isLoading && <p className="text-xs text-muted-foreground">מציג <span className="num">{visible.length}</span> מתוך <span className="num">{rows.length}</span> לקוחות</p>}
      </div>
      <div className="panel overflow-x-auto">
        {data.isLoading || insights.isLoading ? <TableSkeleton cols={7} /> : data.error ? <ErrorState onRetry={() => data.refetch()} /> : !rows.length ? (
          all.length ? <EmptyState title="אין לקוחות שתואמים לסינון" /> : <EmptyState title="אין עדיין לקוחות" text="לקוחות חדשים ולידים שהומרו יופיעו כאן." action={<NewCustomer />} />
        ) : (
          <table className="data-table">
            <thead><tr><th>שם</th><th>טלפון</th><th>ת״ז</th><th>מנוי</th><th>סטטוס מנוי</th><th>רכישות</th><th>סניף</th><th>הצטרפות</th><th>תקינות</th></tr></thead>
            <tbody>
              {visible.map((c) => {
                const m = data.data?.ms?.get(c.id);
                const b = data.data?.buys?.get(c.id);
                const iss = byCust.get(c.id) ?? [];
                const w = worst(iss);
                return (
                  <tr key={c.id} className="cursor-pointer" onClick={() => navigate({ to: "/customers/$id", params: { id: c.id } })}>
                    <td className="font-medium"><Link to="/customers/$id" params={{ id: c.id }} onClick={(e) => e.stopPropagation()}>{c.full_name}</Link>
                      {c.status !== "ACTIVE" && <span className="ms-2 text-xs text-muted-foreground">{CUSTOMER_STATUS[c.status]}</span>}</td>
                    <td className="num text-muted-foreground">{c.phone ?? "—"}</td>
                    <td className="num text-muted-foreground">{c.national_id ? "•••" + c.national_id.slice(-4) : "—"}</td>
                    <td>{m?.display_name ?? "—"}</td>
                    <td>{m ? <StatusBadge tone={m.status === "ACTIVE" ? "ok" : m.status === "CANCELLED" ? "critical" : "neutral"}>{MEMBERSHIP_STATUS[m.status]}</StatusBadge> : <StatusBadge tone="attention">ללא מנוי</StatusBadge>}</td>
                    <td className="text-muted-foreground">{b ? <><span className="num">{b.count}</span>{b.last && <span className="ms-1 text-xs">· אחרונה {fmtDate(b.last)}</span>}</> : "—"}</td>
                    <td className="text-muted-foreground">{branchName(c.home_branch_id)}</td>
                    <td className="num text-muted-foreground">{fmtDate(c.joined_at)}</td>
                    <td>{w ? <SeverityBadge severity={w} label={iss.length > 1 ? `${healthLabel(iss.find((i) => i.severity === w)!)} +${iss.length - 1}` : healthLabel(iss[0])} /> : <SeverityBadge severity="OK" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {rows.length > limit && (
          <div className="border-t p-3 text-center">
            <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 100)}>הצג עוד {Math.min(100, rows.length - limit)}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
