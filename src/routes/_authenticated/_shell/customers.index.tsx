import { LeadDialog } from "@/components/app/LeadDialog";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X, Search as SearchIcon, Megaphone } from "lucide-react";
import { CustomerPhoto } from "@/components/app/CustomerPhoto";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInsights, useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { RULES, healthLabel, insightTargetId, worst, type Insight } from "@/lib/rules";
import { CUSTOMER_STATUS, MEMBERSHIP_STATUS, fmtDate, isValidIsraeliPhone } from "@/lib/format";
import { PAYMENT_METHOD, HEALTH_LABEL, healthState, healthSeverity, entryBlocked } from "@/lib/health";
import { SeverityBadge, StatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, FilterChips, PageHeader, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SearchField = "all" | "name" | "phone" | "nid" | "nid4";
const FIELD_PLACEHOLDER: Record<SearchField, string> = {
  all: "חיפוש",
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
  const [busy, setBusy] = useState(false);
  const empty = { full_name: "", phone: "", email: "", national_id: "", birth_date: "", address: "", payment_method: "", payment_details: "", branch: branchId ?? branches[0]?.id ?? "" };
  const [f, setF] = useState(empty);
  const [files, setFiles] = useState<{ HEALTH_DECLARATION: File | null; SIGNED_TERMS: File | null }>({ HEALTH_DECLARATION: null, SIGNED_TERMS: null });
  const missing = [!f.phone && "טלפון", !f.national_id && "ת״ז", !f.birth_date && "תאריך לידה", !f.payment_method && "אמצעי תשלום", !files.HEALTH_DECLARATION && "הצהרת בריאות", !files.SIGNED_TERMS && "תקנון חתום"].filter(Boolean) as string[];
  async function save() {
    if (busy) return;
    if (!f.full_name.trim()) return toast.error("יש להזין שם");
    if (f.phone && !isValidIsraeliPhone(f.phone)) return toast.error("מספר הטלפון אינו תקין");
    if (f.national_id && !/^\d{5,9}$/.test(f.national_id.trim())) return toast.error("מספר תעודת הזהות אינו תקין");
    if (f.birth_date && new Date(f.birth_date) > new Date()) return toast.error("תאריך הלידה אינו תקין");
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast.error("כתובת האימייל אינה תקינה");
    setBusy(true);
    try {
      const { data, error } = await supabase.from("customers").insert({
        organization_id: org.id, home_branch_id: f.branch, full_name: f.full_name.trim(), phone: f.phone || null,
        email: f.email.trim() || null, national_id: f.national_id.trim() || null, birth_date: f.birth_date || null,
        address: f.address.trim() || null, payment_method: f.payment_method || null,
        payment_method_details: f.payment_details.trim() || null, status: "PENDING",
      }).select("id").single();
      if (error) return toast.error(friendlyError(error));
      if (f.payment_method) {
        const { data: req } = await supabase.from("compliance_requirements").select("id").eq("key", "PAYMENT_METHOD");
        if (req?.length) await supabase.from("customer_compliance_items").update({ status: "VALID", completed_at: new Date().toISOString() }).eq("customer_id", data.id).in("requirement_id", req.map((r) => r.id));
      }
      for (const [type, file] of Object.entries(files)) {
        if (!file) continue;
        const path = `${org.id}/${data.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const up = await supabase.storage.from("customer-documents").upload(path, file);
        if (up.error) { toast.error("העלאת מסמך נכשלה — ניתן להעלות מכרטיס הלקוח"); continue; }
        await supabase.from("customer_documents").insert({ organization_id: org.id, customer_id: data.id, document_type: type, storage_path: path, file_name: file.name });
      }
      toast.success(missing.length ? `הכרטיס נפתח. חסר: ${missing.join(", ")}` : "הכרטיס נפתח ומלא");
      setOpen(false); setF(empty); setFiles({ HEALTH_DECLARATION: null, SIGNED_TERMS: null });
      invalidate();
      navigate({ to: "/customers/$id", params: { id: data.id } });
    } finally { setBusy(false); }
  }
  const fld = (k: keyof typeof f, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5"><Label>{label}</Label><Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} /></div>
  );
  const fileField = (k: keyof typeof files, label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="file" accept="application/pdf,image/*" onChange={(e) => setFiles({ ...files, [k]: e.target.files?.[0] ?? null })} />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> לקוח חדש</Button></DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>פתיחת כרטיס לקוח</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">פרטים אישיים</h3>
            {fld("full_name", "שם מלא *", { autoFocus: true })}
            <div className="grid grid-cols-2 gap-3">{fld("phone", "טלפון", { dir: "ltr" })}{fld("national_id", "ת״ז", { dir: "ltr", inputMode: "numeric" })}</div>
            <div className="grid grid-cols-2 gap-3">{fld("birth_date", "תאריך לידה", { type: "date" })}{fld("email", "אימייל", { dir: "ltr" })}</div>
            {fld("address", "כתובת")}
            <div className="space-y-1.5">
              <Label>סניף</Label>
              <Select value={f.branch} onValueChange={(v) => setF({ ...f, branch: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">אמצעי תשלום</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>אמצעי</Label>
                <Select value={f.payment_method} onValueChange={(v) => setF({ ...f, payment_method: v })}>
                  <SelectTrigger><SelectValue placeholder="בחירה" /></SelectTrigger>
                  <SelectContent>{Object.entries(PAYMENT_METHOD).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {fld("payment_details", "פרטים (4 ספרות אחרונות / הערה)")}
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">מסמכים חתומים</h3>
            <div className="grid grid-cols-2 gap-3">{fileField("HEALTH_DECLARATION", "הצהרת בריאות")}{fileField("SIGNED_TERMS", "תקנון חתום")}</div>
            <p className="text-xs text-muted-foreground">הצהרת בריאות שהועלתה ממתינה לאישור מנהל.</p>
          </section>
          <div className={`rounded-md border p-2.5 text-sm ${missing.length ? "border-warning/40 bg-warning/10" : "border-success/40 bg-success/10"}`}>
            {missing.length ? <>הכרטיס ייפתח עם חוסרים: {missing.join(", ")}</> : <>כל הפרטים הדרושים הוזנו — הכרטיס ייפתח תקין</>}
          </div>
        </div>
        <DialogFooter className="gap-2"><Button onClick={save} disabled={busy}>{busy ? "שומר…" : "פתח כרטיס"}</Button><Button variant="ghost" onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PhoneLookup({ q, hasResults }: { q: string; hasResults: boolean }) {
  const { org } = useOrg();
  const digits = q.replace(/\D/g, "");
  const isPhone = digits.length >= 9 && digits.length === q.replace(/[\s\-+()]/g, "").length;
  const r = useQuery({
    enabled: isPhone,
    queryKey: ["phone-lookup", org.id, digits],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("find_person_by_phone", { _org: org.id, _phone: q });
      if (error) throw error;
      return data;
    },
  });
  if (!isPhone || !r.data) return null;
  const leads = r.data.filter((x) => x.kind === "lead");
  if (leads.length) return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
      <span>המספר שייך ל{leads[0].stage === "PROSPECT" ? "מתעניין" : "ליד"}:</span>
      {leads.map((l) => <Link key={l.id} to="/leads/$id" params={{ id: l.id }} className="font-medium text-primary hover:underline">{l.full_name}</Link>)}
    </div>
  );
  if (hasResults || r.data.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
      <span>לא נמצא אדם עם המספר <span className="num" dir="ltr">{q}</span>.</span>
      <LeadDialog defaultPhone={q} trigger={<Button size="sm"><Plus className="size-4" /> פתיחת כרטיס ליד</Button>} />
    </div>
  );
}

function CustomersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/customers/" });
  const { org, branchId, branchName } = useOrg();
  const insights = useInsights();
  const filter = search.filter ?? "all";
  const [field, setField] = useState<SearchField>("all");
  const [openId, setOpenId] = useState<string | null>(null);
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
      const [c, m, p, h] = await Promise.all([
        q,
        supabase.from("memberships").select("customer_id,display_name,status,price").eq("organization_id", org.id).order("created_at", { ascending: false }),
        supabase.from("payments").select("customer_id,paid_at,amount").eq("organization_id", org.id).eq("status", "PAID").limit(20000),
        supabase.from("customer_compliance_items").select("customer_id,status,expires_at,requirement:compliance_requirements!inner(key)").eq("organization_id", org.id).eq("requirement.key", "HEALTH_DECLARATION").limit(20000),
      ]);
      if (h.error) throw h.error;
      const health = new Map<string, { status: string; expires_at: string | null }>();
      h.data.forEach((x) => health.set(x.customer_id, x));
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
      return { customers: c.data, ms, buys, health };
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
  const activeMember = (id: string) => ["ACTIVE", "FROZEN"].includes(ms?.get(id)?.status ?? "");
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
      case "active": list = list.filter((c) => activeMember(c.id)); break;
      case "inactive": list = list.filter((c) => !activeMember(c.id)); break;
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
              <SelectItem value="all">סינון לפי</SelectItem>
              <SelectItem value="name">שם מלא</SelectItem>
              <SelectItem value="phone">טלפון</SelectItem>
              <SelectItem value="nid">תעודת זהות</SelectItem>
              <SelectItem value="nid4">4 ספרות אחרונות ת״ז</SelectItem>
            </SelectContent>
          </Select>
        <div className="relative w-52">
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
            { value: "active", label: "לקוחות פעילים", count: searched.filter((c) => activeMember(c.id)).length },
            { value: "inactive", label: "לקוחות לא פעילים", count: searched.filter((c) => !activeMember(c.id)).length },
            { value: "new", label: "לקוחות חדשים", count: searched.filter((c) => new Date(c.joined_at).getTime() > month).length },
            { value: "buyers", label: "ללא מנוי, עם רכישות", count: searched.filter((c) => noMemberBuyer(c.id)).length },
            { value: "docs", label: "מסמכים חסרים", count: searched.filter((c) => has(c.id, "MISSING_COMPLIANCE")).length },
            { value: "payment", label: "בעיית תשלום", count: searched.filter((c) => has(c.id, "FAILED_PAYMENT")).length },
            { value: "attention", label: "דורשים טיפול", count: searched.filter((c) => byCust.has(c.id)).length },
          ]}
        />
        <PhoneLookup q={q} hasResults={rows.length > 0} />
        {!data.isLoading && <p className="text-xs text-muted-foreground">מציג <span className="num">{visible.length}</span> מתוך <span className="num">{rows.length}</span> לקוחות</p>}
      </div>
      <div className="panel overflow-x-auto">
        {data.isLoading || insights.isLoading ? <TableSkeleton cols={4} /> : data.error ? <ErrorState onRetry={() => data.refetch()} /> : !rows.length ? (
          all.length ? <EmptyState title="אין לקוחות שתואמים לסינון" /> : <EmptyState title="אין עדיין לקוחות" text="לקוחות חדשים ולידים שהומרו יופיעו כאן." action={<NewCustomer />} />
        ) : (
          <table className="data-table table-fixed w-full">
            <colgroup><col className="w-[34%]" /><col className="w-[22%]" /><col className="w-[18%]" /><col className="w-[26%]" /></colgroup>
            <thead><tr><th>שם</th><th>טלפון</th><th>מנוי</th><th>תקינות</th></tr></thead>
            <tbody>
              {visible.map((c) => {
                const m = data.data?.ms?.get(c.id);
                const iss = byCust.get(c.id) ?? [];
                const w = worst(iss);
                return (
                  <tr key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                    <td className="truncate font-medium">{c.full_name}
                      {c.status !== "ACTIVE" && <span className="ms-2 text-xs text-muted-foreground">{CUSTOMER_STATUS[c.status]}</span>}</td>
                    <td className="text-muted-foreground"><span className="num" dir="ltr">{c.phone ?? "—"}</span></td>
                    <td>{m?.status === "ACTIVE" ? <StatusBadge tone="ok">מנוי פעיל</StatusBadge> : m?.status === "FROZEN" ? <StatusBadge tone="attention">מוקפא</StatusBadge> : <StatusBadge tone="neutral">לא פעיל</StatusBadge>}</td>
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
      {(() => {
        const c = all.find((x) => x.id === openId);
        if (!c) return null;
        const m = data.data?.ms?.get(c.id);
        const b = data.data?.buys?.get(c.id);
        const iss = byCust.get(c.id) ?? [];
        const hItem = data.data?.health?.get(c.id);
        const hs = healthState(hItem);
        const blocked = entryBlocked(hs, m?.status === "ACTIVE");
        const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
          <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0"><span className="text-sm text-muted-foreground">{k}</span><span className="text-sm">{v}</span></div>
        );
        return (
          <Dialog open onOpenChange={(o) => !o && setOpenId(null)}>
            <DialogContent dir="rtl" className="sm:max-w-md">
              <DialogHeader><DialogTitle className="flex items-center gap-3"><CustomerPhoto name={c.full_name} path={c.photo_path} size={48} />{c.full_name}</DialogTitle></DialogHeader>
              {c.desk_note && <div className="flex items-center gap-2 rounded-md bg-attention-soft px-3 py-2 text-sm font-medium"><Megaphone className="size-4 text-attention" />{c.desk_note}</div>}
              <div>
                <Row k="סטטוס לקוח" v={CUSTOMER_STATUS[c.status]} />
                <Row k="טלפון" v={<span className="num" dir="ltr">{c.phone ?? "—"}</span>} />
                <Row k="ת״ז" v={<span className="num" dir="ltr">{c.national_id ?? "—"}</span>} />
                <Row k="אימייל" v={<span dir="ltr">{c.email ?? "—"}</span>} />
                <Row k="מנוי" v={m?.display_name ?? "ללא מנוי"} />
                <Row k="סטטוס מנוי" v={m ? <StatusBadge tone={m.status === "ACTIVE" ? "ok" : m.status === "CANCELLED" ? "critical" : "neutral"}>{MEMBERSHIP_STATUS[m.status]}</StatusBadge> : "—"} />
                <Row k="אמצעי תשלום" v={c.payment_method ? <>{PAYMENT_METHOD[c.payment_method]}{c.payment_method_details && <span className="num"> ···{c.payment_method_details}</span>}</> : "לא הוגדר"} />
                <Row k="הצהרת בריאות" v={<span className="flex items-center gap-2">{hItem?.expires_at && <span className="num text-xs text-muted-foreground">עד {fmtDate(hItem.expires_at)}</span>}<SeverityBadge severity={healthSeverity(hs) as "OK"} label={HEALTH_LABEL[hs]} /></span>} />
                {blocked && <div className="my-2 rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">כניסה חסומה עד שהלקוח יחתום מחדש על הצהרת בריאות והיא תאושר.</div>}
                <Row k="רכישות" v={b ? <><span className="num">{b.count}</span>{b.last && <span className="ms-1 text-xs text-muted-foreground">· אחרונה {fmtDate(b.last)}</span>}</> : "—"} />
                <Row k="סניף" v={branchName(c.home_branch_id)} />
                <Row k="הצטרפות" v={<span className="num">{fmtDate(c.joined_at)}</span>} />
                <Row k="תקינות" v={iss.length ? <div className="flex flex-wrap justify-end gap-1">{iss.map((i) => <SeverityBadge key={i.id} severity={i.severity} label={healthLabel(i)} />)}</div> : <SeverityBadge severity="OK" />} />
              </div>
              <DialogFooter className="gap-2">
                <Button asChild><Link to="/customers/$id" params={{ id: c.id }}>לכרטיס המלא</Link></Button>
                <Button variant="ghost" onClick={() => setOpenId(null)}>סגור</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
