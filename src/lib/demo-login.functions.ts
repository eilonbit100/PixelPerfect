import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Demo-only username login (no password). Each organization member seat with a
// username is linked on first login to an internal account; the server then
// issues a one-time sign-in token for that account.

export const listDemoUsers = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("username, display_name, role, job_title, member_branch_access(branches(name))")
    .not("username", "is", null)
    .in("status", ["ACTIVE", "INVITED"])
    .order("role")
    .order("username");
  if (error) return [];
  const order: Record<string, number> = { EMPLOYEE: 0, BRANCH_MANAGER: 1, HQ: 2 };
  return (data ?? [])
    .map((m) => ({
      username: m.username as string,
      name: m.display_name ?? "",
      role: m.role,
      branches: ((m.member_branch_access ?? []) as { branches: { name: string } | null }[])
        .map((a) => a.branches?.name).filter(Boolean) as string[],
    }))
    .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.username.localeCompare(b.username, "he"));
});

export const demoLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ username: z.string().trim().min(1).max(50) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m, error } = await supabaseAdmin
      .from("organization_members")
      .select("id, user_id, display_name, username, job_title, status")
      .ilike("username", data.username)
      .in("status", ["ACTIVE", "INVITED"])
      .maybeSingle();
    if (error || !m) return { ok: false as const, error: "שם המשתמש לא נמצא" };

    const email = `m-${m.id}@demo.pulse.local`;
    let userId = m.user_id;
    if (!userId) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email, email_confirm: true, user_metadata: { full_name: m.display_name, username: m.username },
      });
      if (created.error || !created.data.user) {
        console.error("demoLogin createUser", created.error);
        return { ok: false as const, error: "ההתחברות נכשלה. נסה שוב." };
      }
      userId = created.data.user.id;
      await supabaseAdmin.from("organization_members")
        .update({ user_id: userId, status: "ACTIVE", joined_at: new Date().toISOString() }).eq("id", m.id);
    }
    await supabaseAdmin.from("profiles").upsert({
      id: userId, full_name: m.display_name, username: m.username, job_title: m.job_title,
    });

    const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) {
      console.error("demoLogin generateLink", link.error);
      return { ok: false as const, error: "ההתחברות נכשלה. נסה שוב." };
    }
    return { ok: true as const, tokenHash };
  });
