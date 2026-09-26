import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Member = Tables<"organization_members">;
export type Branch = Tables<"branches">;

interface OrgState {
  userId: string;
  email: string;
  profileName: string;
  org: Tables<"organizations">;
  me: Member;
  role: Member["role"];
  isManager: boolean;
  isAdmin: boolean;
  members: Member[];
  memberName: (id?: string | null) => string;
  branches: Branch[]; // accessible
  allBranches: Branch[];
  branchName: (id?: string | null) => string;
  branchId: string | null; // selected, null = all accessible
  setBranchId: (id: string | null) => void;
}

const Ctx = createContext<OrgState | null>(null);

async function loadOrg() {
  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if (!user) throw new Error("NOT_AUTHENTICATED");
  const boot = await supabase.rpc("bootstrap_current_user", {});
  if (boot.error) throw boot.error;

  const { data: mine, error: e1 } = await supabase
    .from("organization_members").select("*").eq("user_id", user.id).eq("status", "ACTIVE").limit(1);
  if (e1) throw e1;
  const me = mine?.[0];
  if (!me) return { user, me: null } as const;

  const [org, members, branches, access, profile] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", me.organization_id).single(),
    supabase.from("organization_members").select("*").eq("organization_id", me.organization_id).order("created_at"),
    supabase.from("branches").select("*").eq("organization_id", me.organization_id).is("deleted_at", null).order("created_at"),
    supabase.from("member_branch_access").select("branch_id").eq("organization_member_id", me.id),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  for (const r of [org, members, branches, access]) if (r.error) throw r.error;
  return {
    user, me, org: org.data!, members: members.data ?? [], branches: branches.data ?? [],
    accessIds: (access.data ?? []).map((a) => a.branch_id), profileName: profile.data?.full_name ?? me.display_name ?? "",
  } as const;
}

export const orgQueryKey = ["org-context"];

export function OrgProvider({ children, fallback, noOrg }: { children: ReactNode; fallback: ReactNode; noOrg: ReactNode }) {
  const q = useQuery({ queryKey: orgQueryKey, queryFn: loadOrg, staleTime: 60_000 });
  const [branchId, setBranchIdState] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("pulse.branch");
    if (saved) setBranchIdState(saved === "all" ? null : saved);
  }, []);

  const value = useMemo<OrgState | null>(() => {
    const d = q.data;
    if (!d || !d.me) return null;
    const role = d.me.role;
    const isAdmin = role === "OWNER" || role === "ADMIN";
    const accessible = isAdmin ? d.branches : d.branches.filter((b) => d.accessIds.includes(b.id));
    const selected = branchId && accessible.some((b) => b.id === branchId) ? branchId : accessible.length === 1 ? accessible[0].id : null;
    return {
      userId: d.user.id, email: d.user.email ?? "", profileName: d.profileName,
      org: d.org, me: d.me, role, isAdmin, isManager: isAdmin || role === "MANAGER",
      members: d.members,
      memberName: (id) => d.members.find((m) => m.id === id)?.display_name ?? "—",
      branches: accessible, allBranches: d.branches,
      branchName: (id) => d.branches.find((b) => b.id === id)?.name ?? "—",
      branchId: selected,
      setBranchId: (id) => {
        localStorage.setItem("pulse.branch", id ?? "all");
        setBranchIdState(id);
      },
    };
  }, [q.data, branchId]);

  if (q.isLoading) return <>{fallback}</>;
  if (q.error) throw q.error;
  if (!value) return <>{noOrg}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrg() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOrg outside OrgProvider");
  return v;
}
