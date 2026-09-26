import type { TablesUpdate } from "@/integrations/supabase/types";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Phone, Plus, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { useInsights, useInvalidateAll } from "@/lib/queries";
import { friendlyError } from "@/lib/errors";
import { worst } from "@/lib/rules";
import { LEAD_SOURCE, LEAD_STATUS, LOSS_REASON, TASK_PRIORITY, fmtDate, fmtRelative } from "@/lib/format";
import { SeverityBadge, SeverityIcon, SourceBadge, StatusBadge, leadStatusTone } from "@/components/app/badges";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Timeline } from "@/components/app/Timeline";
import { TaskDialog } from "@/components/app/TaskDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_shell/leads/$id")({
  head: () => ({
    meta: [
      { title: "כרטיס ליד — Pulse" },
      { name: "description", content: "פרטי ליד, פעולה הבאה וציר זמן." },
      { property: "og:title", content: "כרטיס ליד — Pulse" },
      { property: "og:description", content: "פרטי ליד, פעולה הבאה וציר זמן." },
    ],
  }),
  component: LeadDetail,
});

function LeadDetail() {
  const { id } = Route.useParams();
  const { org, members, memberName, branchName } = useOrg();
  const invalidate = useInvalidateAll();
  const navigate = useNavigate();
  const insights = useInsights();
  const [lostOpen, setLostOpen] = useState(false);
  const [lossReason, setLossReason] = useState("");
  const [lossNote, setLossNote] = useState("");
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState("CALL");

  const lead = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const tasks = useQuery({
    queryKey: ["tasks", "lead", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("entity_type", "lead").eq("entity_id", id).is("deleted_at", null).order("due_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (lead.isLoading) return <TableSkeleton rows={6} cols={3} />;
  if (lead.error) return <ErrorState onRetry={() => lead.refetch()} />;
  const l = lead.data;
  if (!l) return <EmptyState title="הליד לא נמצא" action={<Link to="/leads" className="text-primary">חזרה ללידים</Link>} />;

  const issues = (insights.data ?? []).filter((i) => i.entity_type === "lead" && i.entity_id === id);
  const w = worst(issues);

  async function update(patch: TablesUpdate<"leads">, msg = "עודכן") {
    const { error } = await supabase.from("leads").update(patch).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    toast.success(msg);
    invalidate();
  }
  async function changeStatus(s: string) {
    if (s === "LOST") { setLossReason(l!.loss_reason ?? ""); setLostOpen(true); return; }
    if (s === "WON") return convert();
    update({ status: s }, "הסטטוס עודכן");
  }
  async function saveLost() {
    if (!lossReason) return toast.error("יש לבחור סיבה");
    await update({ status: "LOST", loss_reason: lossReason, loss_note: lossNote || null }, "הליד סומן כלא רלוונטי");
    setLostOpen(false);
  }
  async function convert() {
    const { data, error } = await supabase.rpc("convert_lead_to_customer", { _lead: id });
    if (error) return toast.error(friendlyError(error));
    toast.success("הליד הומר ללקוח");
    invalidate();
    navigate({ to: "/customers/$id", params: { id: data as string } });
  }
  async function addNote() {
    if (!note.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("activities").insert({
      organization_id: org.id, branch_id: l!.branch_id, entity_type: "lead", entity_id: id, activity_type: noteType, description: note.trim(), performed_by: u.user!.id,
    });
    if (error) return toast.error(friendlyError(error));
    setNote("");
    toast.success("התיעוד נשמר");
    invalidate();
  }
  async function completeTask(tid: string) {
    const { error } = await supabase.from("tasks").update({ status: "COMPLETED" }).eq("id", tid);
    if (error) return toast.error(friendlyError(error));
    invalidate();
  }

  const primary = issues.sort((a, b) => (a.severity === w ? -1 : 1) - (b.severity === w ? -1 : 1))[0];

  return (
    <div>
      <Link to="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> לידים</Link>
      <div className="panel mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{l.full_name}</h1>
              <StatusBadge tone={leadStatusTone(l.status)}>{LEAD_STATUS[l.status]}</StatusBadge>
              {w ? <SeverityBadge severity={w} /> : <SeverityBadge severity="OK" />}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {l.phone && <a href={`tel:${l.phone}`} className="num inline-flex items-center gap-1 hover:text-foreground"><Phone className="size-3.5" />{l.phone}</a>}
              <span>מקור: {LEAD_SOURCE[l.source]}</span>
              <span>סניף: {branchName(l.branch_id)}</span>
              <span>נוצר: <span className="num">{fmtDate(l.created_at)}</span></span>
              {l.loss_reason && <span>סיבת אובדן: {LOSS_REASON[l.loss_reason]}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={l.assigned_member_id ?? ""} onValueChange={(v) => update({ assigned_member_id: v }, "האחראי עודכן")}>
              <SelectTrigger className="w-40"><SelectValue placeholder="אחראי" /></SelectTrigger>
              <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}</SelectContent>
            </Select>
            {l.status !== "WON" && (
              <Select value={l.status} onValueChange={changeStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(LEAD_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {l.status !== "WON" && l.status !== "LOST" && <Button onClick={convert}><UserCheck className="size-4" /> המר ללקוח</Button>}
            {l.converted_customer_id && <Link to="/customers/$id" params={{ id: l.converted_customer_id }}><Button variant="outline">לכרטיס הלקוח</Button></Link>}
          </div>
        </div>

        {primary ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border bg-background p-3">
            <SeverityIcon severity={primary.severity} />
            <div className="flex-1">
              <div className="font-medium">{primary.title}</div>
              <div className="text-sm text-muted-foreground">{primary.explanation}</div>
            </div>
            {primary.rule_key === "MISSING_LOST_REASON" ? (
              <Button onClick={() => setLostOpen(true)}>השלם סיבה</Button>
            ) : (
              <TaskDialog entityType="lead" entityId={id} branchId={l.branch_id} defaultTitle={`שיחת המשך עם ${l.full_name.split(" ")[0]}`}
                defaultAssignee={l.assigned_member_id} trigger={<Button><Plus className="size-4" /> צור משימה</Button>} />
            )}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok"><CheckCircle2 className="size-4" /> המעקב אחרי הליד תקין</div>
        )}
      </div>

      <Tabs defaultValue="overview" dir="rtl">
        <TabsList>
          <TabsTrigger value="overview">סקירה</TabsTrigger>
          <TabsTrigger value="timeline">ציר זמן</TabsTrigger>
          <TabsTrigger value="tasks">משימות</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel p-4">
            <div className="mb-2 text-sm font-medium">תיעוד פעילות</div>
            <div className="mb-2 flex gap-1.5">
              {[["CALL", "שיחה"], ["WHATSAPP", "וואטסאפ"], ["MEETING", "פגישה"], ["NOTE", "הערה"]].map(([k, v]) => (
                <button key={k} onClick={() => setNoteType(k)} className={"rounded-md border px-2 py-1 text-xs " + (noteType === k ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>{v}</button>
              ))}
            </div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="מה סוכם?" rows={3} />
            <Button size="sm" className="mt-2" onClick={addNote} disabled={!note.trim()}>שמור תיעוד</Button>
          </div>
          <div className="panel p-4">
            <div className="mb-3 text-sm font-medium">פעילות אחרונה</div>
            <Timeline entityType="lead" entityId={id} />
          </div>
        </TabsContent>
        <TabsContent value="timeline" className="panel mt-4 p-4"><Timeline entityType="lead" entityId={id} /></TabsContent>
        <TabsContent value="tasks" className="mt-4">
          <div className="mb-2 flex justify-end">
            <TaskDialog entityType="lead" entityId={id} branchId={l.branch_id} defaultAssignee={l.assigned_member_id} trigger={<Button size="sm" variant="outline"><Plus className="size-4" /> משימה</Button>} />
          </div>
          <div className="panel">
            {!tasks.data?.length ? <EmptyState title="אין משימות לליד" /> : (
              <table className="data-table">
                <thead><tr><th>משימה</th><th>מועד</th><th>עדיפות</th><th>אחראי</th><th>מקור</th><th /></tr></thead>
                <tbody>
                  {tasks.data.map((t) => {
                    const done = t.status === "COMPLETED";
                    const overdue = !done && new Date(t.due_at) < new Date();
                    return (
                      <tr key={t.id}>
                        <td className={done ? "text-muted-foreground line-through" : ""}>{t.title}</td>
                        <td className={overdue ? "text-critical" : "text-muted-foreground"}>{fmtRelative(t.due_at, true)}</td>
                        <td>{TASK_PRIORITY[t.priority]}</td>
                        <td>{memberName(t.assigned_member_id)}</td>
                        <td><SourceBadge source={t.source} /></td>
                        <td className="text-end">{!done && <Button size="sm" variant="ghost" onClick={() => completeTask(t.id)}><CheckCircle2 className="size-4" /> בוצע</Button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader><DialogTitle>למה הליד לא רלוונטי?</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>סיבה</Label>
              <Select value={lossReason} onValueChange={setLossReason}>
                <SelectTrigger><SelectValue placeholder="בחר סיבה" /></SelectTrigger>
                <SelectContent>{Object.entries(LOSS_REASON).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>הערות</Label><Textarea value={lossNote} onChange={(e) => setLossNote(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter className="gap-2"><Button onClick={saveLost}>שמור</Button><Button variant="ghost" onClick={() => setLostOpen(false)}>ביטול</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
