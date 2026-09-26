import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Megaphone, ScanLine, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { friendlyError } from "@/lib/errors";
import { ENTRY_REASON } from "@/lib/entry";
import { fmtDate, fmtTime } from "@/lib/format";
import { CustomerPhoto } from "@/components/app/CustomerPhoto";
import { PageHeader } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_shell/checkin")({
  head: () => ({
    meta: [
      { title: "עמדת כניסה — Pulse" },
      { name: "description", content: "בדיקת כניסה מהירה למתאמנים לפי ת״ז או טלפון." },
      { property: "og:title", content: "עמדת כניסה — Pulse" },
      { property: "og:description", content: "בדיקת כניסה מהירה למתאמנים לפי ת״ז או טלפון." },
    ],
  }),
  component: CheckIn,
});

type Cust = { id: string; full_name: string; phone: string | null; national_id: string | null; photo_path: string | null; desk_note: string | null };
type Result = { customer: Cust; allowed: boolean; reasons: string[]; membership?: { display_name: string; end_date: string | null } | null };

function CheckIn() {
  const { org, branches, branchId } = useOrg();
  const qc = useQueryClient();
  const [branch, setBranch] = useState(branchId ?? branches[0]?.id ?? "");
  const [v, setV] = useState("");
  const [matches, setMatches] = useState<Cust[] | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (branchId) setBranch(branchId); }, [branchId]);

  const recent = useQuery({
    queryKey: ["checkins-today", branch],
    enabled: !!branch,
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.from("check_ins").select("id,allowed,reasons,created_at,customer:customers(id,full_name,photo_path)")
        .eq("branch_id", branch).gte("created_at", start.toISOString()).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data;
    },
  });

  async function find(e?: React.FormEvent) {
    e?.preventDefault();
    const d = v.replace(/\D/g, "");
    if (d.length < 4) return toast.error("יש להקליד לפחות 4 ספרות");
    let q = supabase.from("customers").select("id,full_name,phone,national_id,photo_path,desk_note").eq("organization_id", org.id).is("deleted_at", null).limit(20);
    if (d.length === 4) q = q.like("national_id", `%${d}`);
    else if (d.startsWith("05") || d.startsWith("972")) q = q.like("normalized_phone", `%${d.startsWith("0") ? d.slice(1) : d.slice(3)}`);
    else q = q.or(`national_id.eq.${d},normalized_phone.like.%${d.slice(1)}`);
    const { data, error } = await q;
    if (error) return toast.error(friendlyError(error));
    setRes(null);
    if (!data.length) { setMatches([]); return; }
    if (data.length === 1) return enter(data[0]);
    setMatches(data);
  }

  async function enter(c: Cust) {
    if (!branch) return toast.error("יש לבחור סניף");
    const { data, error } = await supabase.rpc("check_in_customer", { _customer: c.id, _branch: branch });
    if (error) return toast.error(friendlyError(error));
    const r = data as { allowed: boolean; reasons: string[] };
    const m = await supabase.from("memberships").select("display_name,end_date").eq("customer_id", c.id).in("status", ["ACTIVE", "FROZEN"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setMatches(null);
    setRes({ customer: c, allowed: r.allowed, reasons: r.reasons, membership: m.data });
    setV("");
    qc.invalidateQueries({ queryKey: ["checkins-today"] });
    inputRef.current?.focus();
  }

  return (
    <div>
      <PageHeader title="עמדת כניסה" subtitle="4 ספרות אחרונות ת״ז, ת״ז מלאה או טלפון"
        actions={branches.length > 1 ? (
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-44"><SelectValue placeholder="סניף" /></SelectTrigger>
            <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        ) : undefined} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <form onSubmit={find} className="panel flex gap-2 p-4">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input ref={inputRef} autoFocus dir="ltr" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} className="h-14 ps-11 text-2xl num" aria-label="מספר לזיהוי" />
            </div>
            <Button type="submit" className="h-14 px-8 text-base">בדיקה</Button>
          </form>

          {matches && (matches.length === 0 ? (
            <div className="panel p-6 text-center text-muted-foreground">לא נמצא לקוח. בדוק את המספר ונסה שוב.</div>
          ) : (
            <div className="panel divide-y">
              <div className="px-4 py-2 text-sm text-muted-foreground">נמצאו <span className="num">{matches.length}</span> לקוחות — בחר:</div>
              {matches.map((c) => (
                <button key={c.id} onClick={() => enter(c)} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-muted">
                  <CustomerPhoto name={c.full_name} path={c.photo_path} size={40} />
                  <span className="flex-1 font-medium">{c.full_name}</span>
                  <span className="num text-sm text-muted-foreground" dir="ltr">{c.phone ?? ""}</span>
                </button>
              ))}
            </div>
          ))}

          {res && (
            <div className={`panel overflow-hidden border-2 ${res.allowed ? "border-ok" : "border-critical"}`}>
              <div className={`flex items-center gap-3 px-5 py-4 text-xl font-semibold ${res.allowed ? "bg-ok-soft text-ok" : "bg-critical-soft text-critical"}`}>
                {res.allowed ? <CheckCircle2 className="size-7" /> : <XCircle className="size-7" />}
                {res.allowed ? "כניסה מאושרת" : "כניסה חסומה"}
              </div>
              <div className="flex flex-wrap items-center gap-5 p-5">
                <CustomerPhoto name={res.customer.full_name} path={res.customer.photo_path} size={112} />
                <div className="flex-1 space-y-1">
                  <div className="text-2xl font-semibold">{res.customer.full_name}</div>
                  {res.membership ? <div className="text-muted-foreground">{res.membership.display_name}{res.membership.end_date && <> · בתוקף עד <span className="num">{fmtDate(res.membership.end_date)}</span></>}</div> : <div className="text-muted-foreground">ללא מנוי</div>}
                  {!res.allowed && <ul className="mt-2 space-y-1">{res.reasons.map((r) => <li key={r} className="flex items-center gap-2 font-medium text-critical"><XCircle className="size-4" />{ENTRY_REASON[r] ?? r}</li>)}</ul>}
                </div>
                <Button asChild variant="outline"><Link to="/customers/$id" params={{ id: res.customer.id }}>לכרטיס הלקוח</Link></Button>
              </div>
              {res.customer.desk_note && (
                <div className="flex items-center gap-2 border-t bg-attention-soft px-5 py-3 font-medium"><Megaphone className="size-4 text-attention" />{res.customer.desk_note}</div>
              )}
            </div>
          )}
        </div>
        <aside className="panel h-fit">
          <div className="border-b px-4 py-3 text-sm font-medium">כניסות היום <span className="num text-muted-foreground">({recent.data?.length ?? 0})</span></div>
          <ul className="divide-y">
            {(recent.data ?? []).map((r) => {
              const c = r.customer as { id: string; full_name: string; photo_path: string | null } | null;
              return (
                <li key={r.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                  {r.allowed ? <CheckCircle2 className="size-4 text-ok" aria-label="אושר" /> : <XCircle className="size-4 text-critical" aria-label="נחסם" />}
                  <span className="flex-1 truncate">{c?.full_name}</span>
                  <span className="num text-xs text-muted-foreground">{fmtTime(r.created_at)}</span>
                </li>
              );
            })}
            {!recent.data?.length && <li className="px-4 py-6 text-center text-sm text-muted-foreground">עדיין אין כניסות היום</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
