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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const { org, branchName, memberName } = useOrg();
  const insights = useInsights();
  const invalidate = useInvalidateAll();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState("HEALTH_DECLARATION");
  const [plan, setPlan] = useState("");

  const q = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const [c, m, p, ci, d, t, plans] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).maybeSingle(),
        supabase.from("memberships").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
        supabase.from("payments").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
        supabase.from("customer_compliance_items").select("*, requirement:compliance_requirements(key,name,required)").eq("customer_id", id),
        supabase.from("customer_documents").select("*").eq("customer_id", id).order("uploaded_at", { ascending: false }),
        supabase.from("tasks").select("*").eq("entity_type", "customer").eq("entity_id", id).is("deleted_at", null).order("due_at", { ascending: false }),
        supabase.from("membership_plans").select("*").eq("organization_id", org.id).eq("active", true),
      ]);
      for (const r of [c, m, p, ci, d, t, plans]) if (r.error) throw r.error;
      return { c: c.data, m: m.data!, p: p.data!, ci: ci.data!, d: d.data!, t: t.data!, plans: plans.data! };
    },
  });

  if (q.isLoading) return <TableSkeleton rows={6} cols={3} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  const { c, m, p, ci, d, t, plans } = q.data!;
  if (!c) return <EmptyState title="הלקוח לא נמצא" action={<Link to="/customers" className="text-primary">חזרה ללקוחות</Link>} />;

  const issues = (insights.data ?? []).filter((i) => insightTargetId(i) === id);
  const w = worst(issues);
  const activeM = m.find((x) => ["ACTIVE", "PENDING", "FROZEN"].includes(x.status));

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
  async function setMembershipStatus(mid: string, status: string) {
    const { error } = await supabase.from("memberships").update({ status }).eq("id", mid);
    if (error) return toast.error(friendlyError(error));
    invalidate();
  }

  const openUpload = (type: string) => { setUploadType(type); setTimeout(() => fileRef.current?.click(), 0); };

  return (
    <div>
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> לקוחות</Link>
      <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />

      <div className="panel mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{c.full_name}</h1>
              {activeM ? <StatusBadge tone={activeM.status === "ACTIVE" ? "ok" : "neutral"}>{MEMBERSHIP_STATUS[activeM.status]}</StatusBadge> : <StatusBadge tone="attention">ללא מנוי</StatusBadge>}
              {c.status !== "ACTIVE" && <StatusBadge>{CUSTOMER_STATUS[c.status]}</StatusBadge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {c.phone && <a href={`tel:${c.phone}`} className="num inline-flex items-center gap-1 hover:text-foreground"><Phone className="size-3.5" />{c.phone}</a>}
              <span>הצטרף: <span className="num">{fmtDate(c.joined_at)}</span></span>
              {activeM && <span>{activeM.display_name} · {fmtMoney(activeM.price)}</span>}
              <span>סניף: {branchName(c.home_branch_id)}</span>
              {c.national_id && <span className="num">ת״ז {c.national_id}</span>}
            </div>
          </div>
          <TaskDialog entityType="customer" entityId={id} branchId={c.home_branch_id} trigger={<Button variant="outline"><Plus className="size-4" /> משימה</Button>} />
        </div>

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

      <Tabs defaultValue="overview" dir="rtl">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">סקירה</TabsTrigger>
          <TabsTrigger value="membership">מנוי</TabsTrigger>
          <TabsTrigger value="payments">תשלומים</TabsTrigger>
          <TabsTrigger value="visits">כניסות</TabsTrigger>
          <TabsTrigger value="docs">מסמכים</TabsTrigger>
          <TabsTrigger value="tasks">משימות</TabsTrigger>
          <TabsTrigger value="timeline">ציר זמן</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel">
            <div className="border-b px-4 py-3 text-sm font-medium">פתיחת כרטיס ומסמכים</div>
            <ul className="divide-y">
              <li className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>מנוי נבחר</span>{activeM ? <SeverityBadge severity="OK" /> : <SeverityBadge severity="ATTENTION" label="חסר" />}
              </li>
              {ci.filter((x) => x.status !== "NOT_REQUIRED").map((x) => {
                const r = x.requirement as { key: string; name: string } | null;
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
          <div className="panel">
            {!m.length ? <EmptyState title="אין מנויים" text="בחר מסלול כדי להשלים את פתיחת הכרטיס." /> : (
              <table className="data-table">
                <thead><tr><th>מנוי</th><th>מחיר</th><th>התחלה</th><th>סיום</th><th>סטטוס</th><th /></tr></thead>
                <tbody>{m.map((x) => (
                  <tr key={x.id}>
                    <td className="font-medium">{x.display_name}</td><td className="num">{fmtMoney(x.price)}</td>
                    <td className="num">{fmtDate(x.start_date)}</td><td className="num">{fmtDate(x.end_date)}</td>
                    <td><StatusBadge tone={x.status === "ACTIVE" ? "ok" : "neutral"}>{MEMBERSHIP_STATUS[x.status]}</StatusBadge></td>
                    <td className="text-end">{x.status === "ACTIVE" && <Button size="sm" variant="ghost" onClick={() => confirm("לבטל את המנוי?") && setMembershipStatus(x.id, "CANCELLED")}>ביטול מנוי</Button>}</td>
                  </tr>))}</tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="payments" className="panel mt-4">
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
        </TabsContent>

        <TabsContent value="visits" className="panel mt-4">
          <EmptyState title="מעקב כניסות עדיין לא מחובר" text="היסטוריית כניסות תופיע כאן לאחר חיבור מערכת בקרת הכניסה למועדון." />
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
                <thead><tr><th>מסמך</th><th>סוג</th><th>הועלה</th><th /></tr></thead>
                <tbody>{d.map((x) => (
                  <tr key={x.id}>
                    <td>{x.file_name}</td>
                    <td>{(ci.find((i) => (i.requirement as { key: string }).key === x.document_type)?.requirement as { name: string } | undefined)?.name ?? "אחר"}</td>
                    <td className="num text-muted-foreground">{fmtDate(x.uploaded_at)}</td>
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

        <TabsContent value="timeline" className="panel mt-4 p-4"><Timeline entityType="customer" entityId={id} /></TabsContent>
      </Tabs>
    </div>
  );
}
