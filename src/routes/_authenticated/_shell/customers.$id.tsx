import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Download, FileUp, Phone, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInsights, useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { insightTargetId, worst } from "@/lib/rules";
import { COMPLIANCE_STATUS, CUSTOMER_STATUS, MEMBERSHIP_STATUS, PAYMENT_STATUS, TASK_PRIORITY, fmtDate, fmtMoney, fmtRelative } from "@/lib/format";
import { SeverityBadge, SeverityIcon, SourceBadge, StatusBadge } from "@/components/app/badges";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Timeline } from "@/components/app/Timeline";
import { TaskDialog } from "@/components/app/TaskDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PAYMENT_METHOD, HEALTH_LABEL, healthState, healthSeverity, entryBlocked } from "@/lib/health";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ENTRY_REASON, FREEZE_REASON } from "@/lib/entry";
import { fmtDateTime } from "@/lib/format";
import { EditablePhoto } from "@/components/app/CustomerPhoto";
import { DeskNote, FreezeDialog } from "@/components/app/CustomerExtras";
import { LinkedTickets } from "@/components/app/TicketLinks";
import { CancelMembershipDialog, CancelRequestDialog, CancelRequestsPanel, CardHealthPanel, ClassesPanel, EditDetailsDialog, MembershipsPanel, affiliationLabel, useAffiliations } from "@/components/app/CustomerCard";
import { cardHealth } from "@/lib/card-health";
import { Ban, CalendarPlus, CreditCard, FileX, MessageSquarePlus, Pencil, ShoppingCart, Snowflake } from "lucide-react";
import { useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_shell/customers/$id")({
  head: () => ({
    meta: [
      { title: "כרטיס לקוח — Pulse" },
      { name: "description", content: "תמונת 360 של הלקוח: מנוי, תשלומים, מסמכים ומשימות." },
      { property: "og:title", content: "כרטיס לקוח — Pulse" },
      { property: "og:description", content: "תמונת 360 של הלקוח: מנוי, תשלומים, מסמכים ומשימות." },
    ],
  }),
  component: Customer360,
});

function Customer360() {
  const { id } = Route.useParams();
  const { org, branchName, memberName, isManager } = useOrg();
  const [pm, setPm] = useState<{ method: string; details: string } | null>(null);
  const [approveDate, setApproveDate] = useState(() => new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10));
  const insights = useInsights();
  const invalidate = useInvalidateAll();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState("HEALTH_DECLARATION");
  const [plan, setPlan] = useState("");
  const [tab, setTab] = useState("overview");
  const aff = useAffiliations();
  const router = useRouter();
  const goBack = () => { if (window.history.length > 1) router.history.back(); else router.navigate({ to: "/customers" }); };

  const q = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const [c, m, p, ci, d, t, plans, v, fz, cr] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).maybeSingle(),
        supabase.from("memberships").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
        supabase.from("payments").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
        supabase.from("customer_compliance_items").select("*, requirement:compliance_requirements(key,name,required,active)").eq("customer_id", id),
        supabase.from("customer_documents").select("*").eq("customer_id", id).order("uploaded_at", { ascending: false }),
        supabase.from("tasks").select("*").eq("entity_type", "customer").eq("entity_id", id).is("deleted_at", null).order("due_at", { ascending: false }),
        supabase.from("membership_plans").select("*").eq("organization_id", org.id),
        supabase.from("check_ins").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
        supabase.from("customer_freezes").select("*").eq("customer_id", id).order("start_date", { ascending: false }),
        supabase.from("cancellation_requests").select("*").eq("customer_id", id).order("requested_at", { ascending: false }),
      ]);
      for (const r of [c, m, p, ci, d, t, plans, v, fz, cr]) if (r.error) throw r.error;
      const activeReq = (ci.data ?? []).filter((x) => (x.requirement as { active?: boolean } | null)?.active !== false);
      return { c: c.data, m: m.data!, p: p.data!, ci: activeReq, d: d.data!, t: t.data!, allPlans: plans.data!, plans: plans.data!.filter((x) => x.active), v: v.data!, fz: fz.data!, cr: cr.data! };
    },
  });

  if (q.isLoading) return <TableSkeleton rows={6} cols={3} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  const { c, m, p, ci, d, t, plans, allPlans, v, fz, cr } = q.data!;
  if (!c) return <EmptyState title="הלקוח לא נמצא" action={<Link to="/customers" className="text-primary">חזרה ללקוחות</Link>} />;

  const issues = (insights.data ?? []).filter((i) => insightTargetId(i) === id);
  const w = worst(issues);
  const activeM = m.find((x) => ["ACTIVE", "PENDING", "FROZEN"].includes(x.status));
  const healthItem = ci.find((x) => (x.requirement as { key: string } | null)?.key === "HEALTH_DECLARATION");
  const hs = healthState(healthItem);
  const blocked = entryBlocked(hs, activeM?.status === "ACTIVE");
  const todayS = new Date().toISOString().slice(0, 10);
  const frozenNow = fz.find((x) => x.start_date <= todayS && x.end_date >= todayS);
  const billingOf = (planId: string | null) => allPlans.find((x) => x.id === planId)?.billing_period ?? null;
  const health = cardHealth(c, ci as never, p, m.map((x) => ({ status: x.status, billing_period: billingOf(x.membership_plan_id) })));
  const failedByMembership = new Set(p.filter((x) => x.status === "FAILED" && x.membership_id).map((x) => x.membership_id!));
  const debt = p.filter((x) => x.status === "FAILED" || (x.status === "PENDING" && x.due_at && new Date(x.due_at) < new Date())).reduce((s, x) => s + Number(x.amount), 0);
  const future = p.filter((x) => x.status === "PENDING" && x.due_at && new Date(x.due_at) >= new Date());
  const openReqs = cr.filter((x) => ["OPEN", "IN_PROGRESS"].includes(x.status));
  const pmItem = ci.find((x) => (x.requirement as { key: string } | null)?.key === "PAYMENT_METHOD");

  async function savePaymentMethod() {
    if (!pm?.method) return toast.error("יש לבחור אמצעי תשלום");
    const { error } = await supabase.from("customers").update({ payment_method: pm.method, payment_method_details: pm.details.trim() || null }).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    if (pmItem && pmItem.status !== "VALID") await supabase.from("customer_compliance_items").update({ status: "VALID", completed_at: new Date().toISOString() }).eq("id", pmItem.id);
    toast.success("אמצעי התשלום נשמר");
    setPm(null);
    invalidate();
  }
  async function approveHealth() {
    if (!healthItem) return;
    if (!approveDate || new Date(approveDate).getTime() < Date.now()) return toast.error("יש לבחור תאריך תוקף עתידי");
    const { error } = await supabase.from("customer_compliance_items").update({ status: "VALID", completed_at: new Date().toISOString(), expires_at: new Date(approveDate + "T23:59:00").toISOString() }).eq("id", healthItem.id);
    if (error) return toast.error(friendlyError(error));
    toast.success("הצהרת הבריאות אושרה");
    invalidate();
  }

  async function upload(file: File) {
    const path = `${org.id}/${id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const up = await supabase.storage.from("customer-documents").upload(path, file);
    if (up.error) return toast.error("ההעלאה נכשלה");
    const { error } = await supabase.from("customer_documents").insert({
      organization_id: org.id, customer_id: id, document_type: uploadType, storage_path: path, file_name: file.name,
    });
    if (error) return toast.error(friendlyError(error));
    toast.success("המסמך נשמר");
    invalidate();
  }
  async function download(path: string) {
    const { data, error } = await supabase.storage.from("customer-documents").createSignedUrl(path, 60);
    if (error) return toast.error("לא ניתן לפתוח את הקובץ");
    window.open(data.signedUrl, "_blank");
  }
  async function markItem(itemId: string, status: string) {
    const { error } = await supabase.from("customer_compliance_items").update({ status, completed_at: status === "VALID" ? new Date().toISOString() : null }).eq("id", itemId);
    if (error) return toast.error(friendlyError(error));
    invalidate();
  }
  async function markPaid(pid: string) {
    const { error } = await supabase.from("payments").update({ status: "PAID", paid_at: new Date().toISOString(), failure_reason: null }).eq("id", pid);
    if (error) return toast.error(friendlyError(error));
    toast.success("התשלום סומן כשולם");
    invalidate();
  }
  async function addMembership() {
    const pl = plans.find((x) => x.id === plan);
    if (!pl) return;
    const { error } = await supabase.from("memberships").insert({
      organization_id: org.id, branch_id: c!.home_branch_id, customer_id: id, membership_plan_id: pl.id, display_name: pl.name, price: pl.price, status: "ACTIVE",
    });
    if (error) return toast.error(friendlyError(error));
    if (c!.status === "PENDING") await supabase.from("customers").update({ status: "ACTIVE" }).eq("id", id);
    toast.success("המנוי נוסף");
    setPlan("");
    invalidate();
  }

  const openUpload = (type: string) => { setUploadType(type); setTimeout(() => fileRef.current?.click(), 0); };

  return (
    <div>
      <button onClick={goBack} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> חזרה</button>
      <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />

      <div className="panel mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
          <EditablePhoto orgId={org.id} customerId={id} name={c.full_name} path={c.photo_path} onSaved={invalidate} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{c.full_name}</h1>
              {activeM ? <StatusBadge tone={activeM.status === "ACTIVE" ? "ok" : "neutral"}>{MEMBERSHIP_STATUS[activeM.status]}</StatusBadge> : <StatusBadge tone="attention">ללא מנוי</StatusBadge>}
              <StatusBadge tone={activeM ? "ok" : "neutral"}>{activeM ? "לקוח פעיל" : "לקוח לא פעיל"}</StatusBadge>
              {openReqs.length > 0 && <StatusBadge tone="attention">בקשת ביטול פתוחה</StatusBadge>}
              {activeM?.scheduled_cancel_date && <StatusBadge tone="attention">ביטול מתוכנן · {fmtDate(activeM.scheduled_cancel_date)}</StatusBadge>}
              {failedByMembership.size > 0 && <StatusBadge tone="critical">חיוב נכשל</StatusBadge>}
              {blocked && <StatusBadge tone="critical">כניסה חסומה עד חתימה ואישור הצהרת בריאות</StatusBadge>}
              {frozenNow && <StatusBadge tone="attention">מוקפא עד {fmtDate(frozenNow.end_date)}</StatusBadge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {c.phone && <a href={`tel:${c.phone}`} className="num inline-flex items-center gap-1 hover:text-foreground"><Phone className="size-3.5" />{c.phone}</a>}
              <span>הצטרף: <span className="num">{fmtDate(c.joined_at)}</span></span>
              {activeM && <span>{activeM.display_name} · {fmtMoney(activeM.price)} · תוקף {activeM.end_date ? <span className="num">עד {fmtDate(activeM.end_date)}</span> : "ללא תאריך סיום"}</span>}
              {affiliationLabel(aff.data, c) && <span>הצטרף דרך: {affiliationLabel(aff.data, c)}</span>}
              <span>סניף: {branchName(c.home_branch_id)}</span>
              {c.national_id && <span className="num">ת״ז {c.national_id}</span>}
              <span>אמצעי תשלום: {c.payment_method ? PAYMENT_METHOD[c.payment_method] : "לא הוגדר"}{c.payment_method_details && <span className="num"> ···{c.payment_method_details}</span>}</span>
              <span>הצהרת בריאות: <span className={hs === "VALID" ? "" : hs === "EXPIRING" || hs === "PENDING" ? "text-attention" : "text-critical"}>{HEALTH_LABEL[hs]}</span>{healthItem?.expires_at && <span className="num"> · עד {fmtDate(healthItem.expires_at)}</span>}</span>
            </div>
          </div>
          </div>
          <div className="flex max-w-xl flex-wrap justify-end gap-2" aria-label="פעולות מהירות">
            <EditDetailsDialog c={c} onSaved={invalidate} trigger={<Button size="sm" variant="outline"><Pencil className="size-4" /> עדכון פרטים</Button>} />
            <Button size="sm" variant="outline" onClick={() => setTab("membership")}><ShoppingCart className="size-4" /> רכישת מנוי</Button>
            <TaskDialog entityType="customer" entityId={id} branchId={c.home_branch_id} trigger={<Button size="sm" variant="outline"><Plus className="size-4" /> משימה</Button>} />
            <TaskDialog entityType="customer" entityId={id} branchId={c.home_branch_id} defaultTitle="הערה" trigger={<Button size="sm" variant="outline"><MessageSquarePlus className="size-4" /> הערה</Button>} />
            {!c.desk_note && <DeskNote customerId={id} note={null} onSaved={invalidate} />}
            {health.some((i) => i.category === "HEALTH" || i.category === "DOCS") && <Button size="sm" variant="outline" onClick={() => setTab("docs")}><FileUp className="size-4" /> מסמך חסר</Button>}
            {activeM?.status === "ACTIVE" && !frozenNow && <FreezeDialog orgId={org.id} customerId={id} membershipId={activeM.id} onSaved={invalidate} />}
            {activeM && !activeM.scheduled_cancel_date && <CancelRequestDialog memberships={m as never} onSaved={invalidate} trigger={<Button size="sm" variant="outline"><FileX className="size-4" /> בקשת ביטול</Button>} />}
            {activeM && isManager && !activeM.scheduled_cancel_date && <CancelMembershipDialog memberships={m as never} requests={cr} onSaved={invalidate} trigger={<Button size="sm" variant="outline" className="text-critical"><Ban className="size-4" /> ביטול מנוי</Button>} />}
            {debt > 0 && <Button size="sm" variant="outline" onClick={() => setTab("payments")}><CreditCard className="size-4" /> טיפול בחוב</Button>}
            <Button size="sm" variant="outline" asChild><Link to="/schedule"><CalendarPlus className="size-4" /> תיאום שיעור</Link></Button>
          </div>
        </div>
        {c.desk_note && <div className="mt-4"><DeskNote customerId={id} note={c.desk_note} onSaved={invalidate} /></div>}

        {issues.length ? (
          <div className="mt-4 space-y-2">
            {issues.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-3">
                <SeverityIcon severity={i.severity} />
                <div className="flex-1"><div className="flex items-center gap-2"><SeverityBadge severity={i.severity} /><span className="font-medium">{i.title}</span></div>
                  <div className="text-sm text-muted-foreground">{i.explanation}</div></div>
                {i.rule_key === "MISSING_COMPLIANCE" && <Button size="sm" onClick={() => openUpload(((i.metadata?.missing as string[]) ?? [])[0] ?? "HEALTH_DECLARATION")}><FileUp className="size-4" /> העלה מסמך</Button>}
                {i.rule_key === "FAILED_PAYMENT" && <Button size="sm" onClick={() => markPaid(i.entity_id)}>סמן כשולם</Button>}
                {i.rule_key === "FAILED_PAYMENT" && <TaskDialog entityType="customer" entityId={id} branchId={c.home_branch_id} defaultTitle="גביית חיוב שנכשל" trigger={<Button size="sm" variant="outline">משימת גבייה</Button>} />}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok"><CheckCircle2 className="size-4" /> הכרטיס תקין</div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">פרטים ותקינות</TabsTrigger>
          <TabsTrigger value="membership">מנויים</TabsTrigger>
          <TabsTrigger value="payments">תשלומים וחיובים</TabsTrigger>
          <TabsTrigger value="docs">מסמכים</TabsTrigger>
          <TabsTrigger value="tasks">משימות והערות</TabsTrigger>
          <TabsTrigger value="visits">כניסות</TabsTrigger>
          <TabsTrigger value="classes">שיעורים ואימונים</TabsTrigger>
          <TabsTrigger value="tickets">קריאות</TabsTrigger>
          <TabsTrigger value="timeline">היסטוריית פעילות</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel">
            <div className="flex items-center justify-between border-b px-4 py-3"><span className="text-sm font-medium">פרטים אישיים</span>
              <EditDetailsDialog c={c} onSaved={invalidate} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /> עריכה</Button>} /></div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 p-4 text-sm">
              {([["שם מלא", c.full_name], ["תעודת זהות", c.national_id], ["טלפון", c.phone], ["דוא״ל", c.email], ["כתובת", c.address], ["תאריך לידה", c.birth_date ? fmtDate(c.birth_date) : null],
                ["סניף משויך", branchName(c.home_branch_id)], ["סטטוס אדם", "לקוח"], ["סטטוס מנוי", activeM ? MEMBERSHIP_STATUS[activeM.status] : "ללא מנוי פעיל"], ["גוף מאגד / מקור", affiliationLabel(aff.data, c)]] as [string, string | null][]).map(([k, val]) => (
                <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className={val ? "" : "text-muted-foreground"}>{val ?? "לא הוזן"}</dd></div>
              ))}
            </dl>
          </div>
          <CardHealthPanel issues={health} tasks={t} onFix={(i) => {
            if (i.category === "HEALTH" || i.category === "DOCS") return <Button size="sm" variant="ghost" onClick={() => setTab("docs")}><FileUp className="size-4" /> לטיפול</Button>;
            if (i.category === "FAILED_PAYMENT") return <Button size="sm" variant="ghost" onClick={() => setTab("payments")}>לחיוב</Button>;
            if (i.category === "PAYMENT_METHOD") return <Button size="sm" variant="ghost" onClick={() => setPm({ method: "", details: "" })}>הגדר</Button>;
            return <EditDetailsDialog c={c} onSaved={invalidate} trigger={<Button size="sm" variant="ghost">השלם</Button>} />;
          }} />
          <div className="panel">
            <div className="border-b px-4 py-3 text-sm font-medium">פתיחת כרטיס ומסמכים</div>
            <ul className="divide-y">
              <li className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>מנוי נבחר</span>{activeM ? <SeverityBadge severity="OK" /> : <SeverityBadge severity="ATTENTION" label="חסר" />}
              </li>
              {ci.filter((x) => x.status !== "NOT_REQUIRED").map((x) => {
                const r = x.requirement as { key: string; name: string } | null;
                if (r?.key === "HEALTH_DECLARATION") return (
                  <li key={x.id} className="space-y-2 px-4 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>{r.name}{x.expires_at && <span className="num ms-2 text-xs text-muted-foreground">תוקף עד {fmtDate(x.expires_at)}</span>}</span>
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={healthSeverity(hs) as "OK"} label={HEALTH_LABEL[hs]} />
                        {hs !== "PENDING" && hs !== "VALID" && <Button size="sm" variant="ghost" onClick={() => openUpload("HEALTH_DECLARATION")}><FileUp className="size-4" /> העלה חתומה</Button>}
                      </div>
                    </div>
                    {hs === "PENDING" && (isManager ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
                        <span className="text-xs text-muted-foreground">הצהרה חדשה ממתינה. תוקף עד:</span>
                        <Input type="date" dir="ltr" value={approveDate} onChange={(e) => setApproveDate(e.target.value)} className="h-8 w-40" />
                        <Button size="sm" onClick={approveHealth}>אשר הצהרה</Button>
                      </div>
                    ) : <p className="text-xs text-muted-foreground">ההצהרה ממתינה לאישור מנהל.</p>)}
                  </li>
                );
                if (r?.key === "PAYMENT_METHOD") return (
                  <li key={x.id} className="space-y-2 px-4 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>{r.name}{c.payment_method && <span className="ms-2 text-xs text-muted-foreground">{PAYMENT_METHOD[c.payment_method]}{c.payment_method_details ? ` ···${c.payment_method_details}` : ""}</span>}</span>
                      <div className="flex items-center gap-2">
                        {x.status === "VALID" ? <SeverityBadge severity="OK" /> : <SeverityBadge severity="HIGH" label={COMPLIANCE_STATUS[x.status]} />}
                        <Button size="sm" variant="ghost" onClick={() => setPm(pm ? null : { method: c.payment_method ?? "", details: c.payment_method_details ?? "" })}>{c.payment_method ? "עדכון" : "הגדר"}</Button>
                      </div>
                    </div>
                    {pm && (
                      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
                        <Select value={pm.method} onValueChange={(v) => setPm({ ...pm, method: v })}>
                          <SelectTrigger className="h-8 w-40"><SelectValue placeholder="אמצעי תשלום" /></SelectTrigger>
                          <SelectContent>{Object.entries(PAYMENT_METHOD).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input dir="ltr" value={pm.details} maxLength={4} inputMode="numeric" placeholder="4 ספרות אחרונות" onChange={(e) => setPm({ ...pm, details: e.target.value.replace(/\D/g, "") })} className="h-8 w-32" />
                        <Button size="sm" onClick={savePaymentMethod}>שמור</Button>
                      </div>
                    )}
                  </li>
                );
                const ok = x.status === "VALID";
                return (
                  <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span>{r?.name}</span>
                    <div className="flex items-center gap-2">
                      {ok ? <SeverityBadge severity="OK" /> : <SeverityBadge severity="HIGH" label={COMPLIANCE_STATUS[x.status]} />}
                      {!ok && r?.key !== "PAYMENT_METHOD" && <Button size="sm" variant="ghost" onClick={() => openUpload(r!.key)}><FileUp className="size-4" /> העלה</Button>}
                      {!ok && r?.key === "PAYMENT_METHOD" && <Button size="sm" variant="ghost" onClick={() => markItem(x.id, "VALID")}>סמן כהתקבל</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="panel p-4"><div className="mb-3 text-sm font-medium">פעילות אחרונה</div><Timeline entityType="customer" entityId={id} /></div>
        </TabsContent>

        <TabsContent value="membership" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger className="w-56"><SelectValue placeholder="בחר מסלול" /></SelectTrigger>
              <SelectContent>{plans.map((x) => <SelectItem key={x.id} value={x.id}>{x.name} · {fmtMoney(x.price)}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={addMembership} disabled={!plan}>הוסף מנוי</Button>
          </div>
          <MembershipsPanel customerId={id} orgId={org.id} memberships={m as never} plans={allPlans} requests={cr} freezes={fz} failedByMembership={failedByMembership} onSaved={invalidate}
            FreezeButton={({ membershipId }) => <FreezeDialog orgId={org.id} customerId={id} membershipId={membershipId} onSaved={invalidate} />} />
          <CancelRequestsPanel requests={cr} memberships={m as never} onSaved={invalidate} />
        </TabsContent>

        <TabsContent value="payments" className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="panel p-3"><div className="text-xs text-muted-foreground">שולם</div><div className="num text-lg font-semibold">{fmtMoney(p.filter((x) => x.status === "PAID").reduce((s, x) => s + Number(x.amount), 0))}</div></div>
            <div className="panel p-3"><div className="text-xs text-muted-foreground">יתרת חוב</div><div className={"num text-lg font-semibold " + (debt ? "text-critical" : "")}>{fmtMoney(debt)}</div></div>
            <div className="panel p-3"><div className="text-xs text-muted-foreground">חיובים עתידיים</div><div className="num text-lg font-semibold">{future.length}</div></div>
            <div className="panel p-3"><div className="text-xs text-muted-foreground">אמצעי תשלום</div><div className="text-sm font-medium">{c.payment_method ? PAYMENT_METHOD[c.payment_method] : "לא הוגדר"}{c.payment_method_details && <span className="num"> ···{c.payment_method_details}</span>}</div></div>
          </div>
          <p className="text-xs text-muted-foreground">כאן מוצגים חיובים ותשלומים בלבד. מסמכים חשבונאיים (קבלות/חשבוניות) ופעולות גבייה והחזר ממתינים לחיבור ספק תשלומים וקופה. לא נשמר מספר כרטיס מלא — רק 4 ספרות אחרונות.</p>
          <div className="panel">
          {!p.length ? <EmptyState title="אין תשלומים" /> : (
            <table className="data-table">
              <thead><tr><th>סכום</th><th>מועד חיוב</th><th>שולם</th><th>סטטוס</th><th>הערה</th><th /></tr></thead>
              <tbody>{p.map((x) => (
                <tr key={x.id}>
                  <td className="num font-medium">{fmtMoney(x.amount)}</td><td className="num">{fmtDate(x.due_at)}</td><td className="num">{fmtDate(x.paid_at)}</td>
                  <td><StatusBadge tone={x.status === "PAID" ? "ok" : x.status === "FAILED" ? "critical" : "neutral"}>{PAYMENT_STATUS[x.status]}</StatusBadge></td>
                  <td className="text-muted-foreground">{x.failure_reason ?? ""}</td>
                  <td className="text-end">{x.status === "FAILED" && <Button size="sm" variant="ghost" onClick={() => markPaid(x.id)}>סמן כשולם</Button>}</td>
                </tr>))}</tbody>
            </table>
          )}
          </div>
        </TabsContent>

        <TabsContent value="classes" className="mt-4"><ClassesPanel customerId={id} /></TabsContent>

        <TabsContent value="visits" className="panel mt-4">
          {!v.length ? <EmptyState title="אין כניסות עדיין" text="כל בדיקה בעמדת הכניסה תירשם כאן." /> : (
            <table className="data-table">
              <thead><tr><th>מועד</th><th>סניף</th><th>תוצאה</th><th>סיבה</th></tr></thead>
              <tbody>{v.map((x) => (
                <tr key={x.id}>
                  <td className="num">{fmtDateTime(x.created_at)}</td><td>{branchName(x.branch_id)}</td>
                  <td>{x.allowed ? <StatusBadge tone="ok">אושרה</StatusBadge> : <StatusBadge tone="critical">נחסמה</StatusBadge>}</td>
                  <td className="text-muted-foreground">{x.reasons.map((r) => ENTRY_REASON[r] ?? r).join(", ")}</td>
                </tr>))}</tbody>
            </table>
          )}
          {!!fz.length && (
            <div className="border-t p-4">
              <div className="mb-2 text-sm font-medium">היסטוריית הקפאות</div>
              <ul className="space-y-1 text-sm">{fz.map((x) => <li key={x.id}><span className="num">{fmtDate(x.start_date)} – {fmtDate(x.end_date)}</span> · {FREEZE_REASON[x.reason]}{x.note && ` · ${x.note}`}</li>)}</ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="docs" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={uploadType} onValueChange={setUploadType}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ci.map((x) => { const r = x.requirement as { key: string; name: string }; return <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>; })}
                <SelectItem value="OTHER">אחר</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp className="size-4" /> העלאת מסמך</Button>
          </div>
          <div className="panel">
            {!d.length ? <EmptyState title="אין מסמכים" text="מסמכים שיועלו נשמרים באופן מאובטח ופרטי." /> : (
              <table className="data-table">
                <thead><tr><th>מסמך</th><th>סוג</th><th>הועלה</th><th>חתימה</th><th>סטטוס</th><th /></tr></thead>
                <tbody>{d.map((x) => (
                  <tr key={x.id}>
                    <td>{x.file_name}</td>
                    <td>{(ci.find((i) => (i.requirement as { key: string }).key === x.document_type)?.requirement as { name: string } | undefined)?.name ?? "אחר"}</td>
                    <td className="num text-muted-foreground">{fmtDate(x.uploaded_at)}</td>
                    <td className="num text-muted-foreground">{x.signed_at ? fmtDate(x.signed_at) : "—"}</td>
                    <td>{({ UPLOADED: "הועלה", SIGNED: "נחתם", PENDING: "ממתין", APPROVED: "אושר", EXPIRED: "פג תוקף", REJECTED: "נדחה" } as Record<string, string>)[x.status] ?? x.status}</td>
                    <td className="text-end"><Button size="sm" variant="ghost" onClick={() => download(x.storage_path)}><Download className="size-4" /> פתח</Button></td>
                  </tr>))}</tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="panel mt-4">
          {!t.length ? <EmptyState title="אין משימות ללקוח" /> : (
            <table className="data-table">
              <thead><tr><th>משימה</th><th>מועד</th><th>עדיפות</th><th>אחראי</th><th>מקור</th><th /></tr></thead>
              <tbody>{t.map((x) => {
                const done = x.status === "COMPLETED";
                return (
                  <tr key={x.id}>
                    <td className={done ? "text-muted-foreground line-through" : ""}>{x.title}</td>
                    <td className={!done && new Date(x.due_at) < new Date() ? "text-critical" : "text-muted-foreground"}>{fmtRelative(x.due_at, true)}</td>
                    <td>{TASK_PRIORITY[x.priority]}</td><td>{memberName(x.assigned_member_id)}</td><td><SourceBadge source={x.source} /></td>
                    <td className="text-end">{!done && <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("tasks").update({ status: "COMPLETED" }).eq("id", x.id); invalidate(); }}><CheckCircle2 className="size-4" /> בוצע</Button>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="tickets" className="mt-4"><LinkedTickets kind="customer" id={id} /></TabsContent>

        <TabsContent value="timeline" className="panel mt-4 p-4"><Timeline entityType="customer" entityId={id} /></TabsContent>
      </Tabs>
    </div>
  );
}
