import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./org";
import type { Insight } from "./rules";

/** Open insights for the org (RLS scoped), optionally filtered by branch */
export function useInsights() {
  const { org, branchId } = useOrg();
  return useQuery({
    queryKey: ["insights", org.id, branchId],
    queryFn: async () => {
      let q = supabase.from("insights").select("*").eq("organization_id", org.id).in("status", ["OPEN", "ACKNOWLEDGED"]).limit(2000);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Insight[];
    },
  });
}

/** Runs time-based rule evaluation (server throttled) once per mount, then refreshes insights */
export function useRefreshInsights() {
  const { org } = useOrg();
  const qc = useQueryClient();
  useEffect(() => {
    supabase.rpc("refresh_insights", { _org: org.id }).then(({ error }) => {
      if (!error) qc.invalidateQueries({ queryKey: ["insights"] });
    });
  }, [org.id, qc]);
}

/** After any mutation, triggers re-evaluate server-side; refresh caches */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "org-context" });
}
