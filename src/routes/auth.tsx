import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { demoLogin, listDemoUsers } from "@/lib/demo-login.functions";
import { ROLE } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "כניסה — Pulse" },
      { name: "description", content: "כניסה למערכת הניהול של המועדון." },
      { property: "og:title", content: "כניסה — Pulse" },
      { property: "og:description", content: "כניסה למערכת הניהול של המועדון." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const users = useQuery({ queryKey: ["demo-users"], queryFn: () => listDemoUsers() });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) navigate({ to: "/dashboard" }); });
  }, [navigate]);

  async function login(name: string) {
    if (!name.trim()) return;
    if (!password) { toast.error("יש להזין סיסמה"); return; }
    setBusy(true);
    try {
      const r = await demoLogin({ data: { username: name, password } });
      if (!r.ok) { toast.error(r.error); return; }
      await supabase.auth.signOut();
      const { error } = await supabase.auth.verifyOtp({ token_hash: r.tokenHash, type: "magiclink" });
      if (error) throw error;
      qc.clear();
      navigate({ to: "/dashboard", replace: true });
    } catch {
      toast.error("ההתחברות נכשלה. נסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Activity className="size-4" /></span>
          <span className="text-lg font-semibold">Pulse</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">כניסה למערכת</h1>
        <p className="mt-1 text-sm text-muted-foreground">מה קורה, מה לא תקין ומה צריך לעשות עכשיו.</p>

        <form onSubmit={(e) => { e.preventDefault(); login(username); }} className="panel mt-6 space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="u">שם משתמש</Label>
            <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="עובד1" autoFocus required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p">סיסמה</Label>
            <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "רגע…" : "כניסה למערכת"}</Button>
        </form>

        <div className="mt-6">
          <div className="eyebrow mb-2">משתמשי דמו</div>
          <div className="panel divide-y">
            {(users.data ?? []).map((u) => (
              <button key={u.username} type="button" disabled={busy}
                onClick={() => { setUsername(u.username); login(u.username); }}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-muted">
                <span className="font-medium">{u.username}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {ROLE[u.role] ?? u.role} · {u.role === "HQ" ? "כל הארגון" : u.branches.join(", ") || "—"}
                </span>
              </button>
            ))}
            {users.isLoading && <p className="px-4 py-3 text-sm text-muted-foreground">טוען…</p>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">הזן סיסמה ואז בחר משתמש מהרשימה.</p>
        </div>
      </div>
    </div>
  );
}
