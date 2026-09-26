import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { friendlyError } from "@/lib/errors";
import { fmtMoney, fmtRelative } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/_shell/approvals")({
  head: () => ({ meta: [
    { title: "אישורים — Pulse" },
    { name: "description", content: "בקשות של מנהלי סניפים שממתינות לאישור המטה." },
    { property: "og:title", content: "אישורים — Pulse" },
    { property: "og:description", content: "בקשות של מנהלי סניפים שממתינות לאישור המטה." },
  ] }),
  component: Approvals,
});

const STATUS: Record<string, { label: string; tone: "neutral" | "warning" | "ok" | "critical" }> = {
  DRAFT: { label: "טיוטה", tone: "neutral" },
  PENDING_APPROVAL: { label: "ממתין לאישור", tone: "warning" },
  APPROVED: { label: "אושר", tone: "ok" },
  REJECTED: { label: "נדחה", tone: "critical" },
};

function NewRequest({ onDone }: { onDone: () => void }) {
  const { org, me, branchId, branches } = useOrg();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", details: "", amount: "" });
  const branch = branchId ?? branches[0]?.id;
  async function submit() {
    if (!f.title.trim()) return toast.error("יש להזין כותרת");
    const { error } = await supabase.from("approval_requests").insert({
      organization_id: org.id, branch_id: branch, title: f.title.trim(), details: f.details || null,
      amount: f.amount ? Number(f.amount) : null, requested_by: me.id,
      approval_status: "PENDING_APPROVAL", submitted_at: new Date().toISOString(),
    });
    if (error) return toast.error(friendlyError(error));
    toast.success("הבקשה נשלחה לאישור המטה");
    setF({ title: "", details: "", amount: "" }); setOpen(false); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> בקשה חדשה</Button></DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>הצעת מחיר / בקשה מיוחדת</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>כותרת</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>סכום (₪)</Label><Input type="number" dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>פרטים</Label><Textarea value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={submit}>שליחה לאישור</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Approvals() {
  const { org, branchId, isAdmin, isManager, me, memberName, branchName } = useOrg();
  const qc = useQueryClient();
  const key = ["approvals", org.id, branchId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      let r = supabase.from("approval_requests").select("*").order("created_at", { ascending: false });
      if (branchId) r = r.eq("branch_id", branchId);
      const { data, error } = await r;
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["approvals"] }); qc.invalidateQueries({ queryKey: ["approvals-pending"] }); };

  async function decide(id: string, approve: boolean) {
    let reason: string | null = null;
    if (!approve) {
      reason = window.prompt("סיבת הדחייה");
      if (!reason?.trim()) return toast.error("חובה לציין סיבת דחייה");
    }
    const { error } = await supabase.from("approval_requests").update({
      approval_status: approve ? "APPROVED" : "REJECTED", approved_by: me.id, approved_at: new Date().toISOString(), rejection_reason: reason,
    }).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    toast.success(approve ? "הבקשה אושרה" : "הבקשה נדחתה");
    refresh();
  }

  return (
    <div>
      <PageHeader title="אישורים" subtitle={isAdmin ? "בקשות ממנהלי הסניפים שממתינות להחלטתך." : "בקשות שהגשת לאישור המטה."}
        actions={isManager && !isAdmin ? <NewRequest onDone={refresh} /> : undefined} />
      <div className="panel overflow-x-auto">
        {q.data && !q.data.length ? <EmptyState title="אין בקשות" text="בקשות שיוגשו לאישור יופיעו כאן." /> : (
          <table className="data-table">
            <thead><tr><th>בקשה</th><th>סניף</th><th>סכום</th><th>הוגש ע״י</th><th>הוגש</th><th>סטטוס</th><th></th></tr></thead>
            <tbody>{(q.data ?? []).map((a) => (
              <tr key={a.id}>
                <td><div className="font-medium">{a.title}</div>{a.details && <div className="text-xs text-muted-foreground">{a.details}</div>}
                  {a.rejection_reason && <div className="text-xs text-critical">סיבת דחייה: {a.rejection_reason}</div>}</td>
                <td>{branchName(a.branch_id)}</td>
                <td className="num">{a.amount != null ? fmtMoney(a.amount) : "—"}</td>
                <td>{memberName(a.requested_by)}</td>
                <td className="text-muted-foreground">{fmtRelative(a.submitted_at)}</td>
                <td><StatusBadge tone={STATUS[a.approval_status]?.tone}>{STATUS[a.approval_status]?.label}</StatusBadge></td>
                <td>{isAdmin && a.approval_status === "PENDING_APPROVAL" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => decide(a.id, true)}>אישור</Button>
                    <Button size="sm" variant="outline" onClick={() => decide(a.id, false)}>דחייה</Button>
                  </div>
                )}{a.approved_by && <span className="text-xs text-muted-foreground">{memberName(a.approved_by)}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
