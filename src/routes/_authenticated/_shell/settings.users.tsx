import type { TablesUpdate } from "@/integrations/supabase/types";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { orgQueryKey, useOrg } from "@/lib/org";
import { friendlyError } from "@/lib/errors";
import { MEMBER_STATUS, ROLE } from "@/lib/format";
import { StatusBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_shell/settings/users")({
  head: () => ({ meta: [{ title: "משתמשים — Pulse" }, { name: "description", content: "חברי צוות, תפקידים וגישה לסניפים." }, { property: "og:title", content: "משתמשים — Pulse" }, { property: "og:description", content: "חברי צוות, תפקידים וגישה לסניפים." }] }),
  component: Users,
});

function Users() {
  const { org, members: allMembers, allBranches, branches: myBranches, isAdmin, me } = useOrg();
  const qc = useQueryClient();
  const [inv, setInv] = useState({ name: "", username: "", job: "", role: "EMPLOYEE" });
  const access = useQuery({
    queryKey: ["member-access", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("member_branch_access").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  // מנהל סניף רואה רק את צוות הסניפים שלו (צפייה בלבד); מטה רואה את כולם ועורך
  const members = isAdmin ? allMembers : allMembers.filter((m) => m.id === me.id || m.role !== "HQ" && access.data?.some((a) => a.organization_member_id === m.id && myBranches.some((b) => b.id === a.branch_id)));
  const refresh = () => { qc.invalidateQueries({ queryKey: orgQueryKey }); qc.invalidateQueries({ queryKey: ["member-access"] }); };

  async function patch(id: string, p: TablesUpdate<"organization_members">) {
    const { error } = await supabase.from("organization_members").update(p).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    toast.success("עודכן"); refresh();
  }
  async function toggleBranch(memberId: string, branchId: string, has: boolean) {
    const { error } = has
      ? await supabase.from("member_branch_access").delete().eq("organization_member_id", memberId).eq("branch_id", branchId)
      : await supabase.from("member_branch_access").insert({ organization_member_id: memberId, branch_id: branchId });
    if (error) return toast.error(friendlyError(error));
    refresh();
  }
  async function invite() {
    if (!inv.name.trim() || !inv.username.trim()) return toast.error("יש להזין שם ושם משתמש");
    const { error } = await supabase.from("organization_members").insert({
      organization_id: org.id, display_name: inv.name.trim(), username: inv.username.trim(), job_title: inv.job.trim() || null, role: inv.role, status: "INVITED",
    });
    if (error) return toast.error(friendlyError(error));
    setInv({ name: "", username: "", job: "", role: "EMPLOYEE" });
    toast.success("המשתמש נוסף — אפשר להיכנס עם שם המשתמש");
    refresh();
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="panel flex flex-wrap items-end gap-2 p-4">
          <Input placeholder="שם" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} className="w-44" />
          <Input placeholder="שם משתמש" value={inv.username} onChange={(e) => setInv({ ...inv, username: e.target.value })} className="w-36" />
          <Input placeholder="תפקיד (קופאי, קבלה…)" value={inv.job} onChange={(e) => setInv({ ...inv, job: e.target.value })} className="w-44" />
          <Select value={inv.role} onValueChange={(v) => setInv({ ...inv, role: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{["EMPLOYEE", "BRANCH_MANAGER", "HQ"].map((r) => <SelectItem key={r} value={r}>{ROLE[r]}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={invite}>הוסף חבר צוות</Button>
        </div>
      )}
      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>שם</th><th>שם משתמש</th><th>תפקיד</th><th>הרשאה</th><th>סטטוס</th><th>גישה לסניפים</th></tr></thead>
          <tbody>{members.map((m) => {
            const broad = m.role === "HQ";
            const editable = isAdmin && m.id !== me.id ;
            return (
              <tr key={m.id}>
                <td className="font-medium">{m.display_name}{m.id === me.id && <span className="ms-1 text-xs text-muted-foreground">(את/ה)</span>}</td>
                <td className="text-muted-foreground">{m.username ?? "—"}</td>
                <td>{isAdmin ? <Input defaultValue={m.job_title ?? ""} className="h-8 w-32" onBlur={(e) => e.target.value !== (m.job_title ?? "") && patch(m.id, { job_title: e.target.value || null })} /> : (m.job_title ?? "—")}</td>
                <td>{editable ? (
                  <Select value={m.role} onValueChange={(v) => patch(m.id, { role: v })}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{["EMPLOYEE", "BRANCH_MANAGER", "HQ"].map((r) => <SelectItem key={r} value={r}>{ROLE[r]}</SelectItem>)}</SelectContent>
                  </Select>
                ) : ROLE[m.role]}</td>
                <td>{editable && m.status !== "INVITED" ? (
                  <Select value={m.status} onValueChange={(v) => patch(m.id, { status: v })}>
                    <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{["ACTIVE", "SUSPENDED", "REMOVED"].map((s) => <SelectItem key={s} value={s}>{MEMBER_STATUS[s]}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <StatusBadge tone={m.status === "ACTIVE" ? "ok" : "neutral"}>{MEMBER_STATUS[m.status]}</StatusBadge>}</td>
                <td>{broad ? <span className="text-sm text-muted-foreground">כל הסניפים</span> : (
                  <div className="flex flex-wrap gap-1">
                    {allBranches.map((b) => {
                      const has = !!access.data?.some((a) => a.organization_member_id === m.id && a.branch_id === b.id);
                      return (
                        <button key={b.id} disabled={!isAdmin} onClick={() => toggleBranch(m.id, b.id, has)}
                          className={"rounded-md border px-2 py-0.5 text-xs " + (has ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground") + (isAdmin ? " hover:bg-muted" : "")}>
                          {b.name}
                        </button>
                      );
                    })}
                  </div>
                )}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">בסביבת ההדגמה נכנסים עם שם משתמש בלבד. התפקיד (קופאי, קבלה…) הוא תיאור; ההרשאות נקבעות לפי עובד / מנהל סניף / מטה.</p>
    </div>
  );
}
