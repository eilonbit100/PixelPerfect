import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) navigate({ to: "/dashboard" }); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (s) navigate({ to: "/dashboard" }); });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) toast.success("שלחנו אליך מייל לאימות החשבון. לאחר האימות אפשר להתחבר.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast.success("שלחנו קישור לאיפוס סיסמה למייל שלך.");
        setMode("in");
      }
    } catch (err) {
      const msg = (err as Error).message;
      toast.error(msg.includes("Invalid login") ? "אימייל או סיסמה שגויים" : msg.includes("already") ? "המשתמש כבר קיים — נסה להתחבר" : "הפעולה נכשלה. נסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error("ההתחברות עם Google נכשלה");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Activity className="size-4" /></span>
          <span className="text-lg font-semibold">Pulse</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{mode === "up" ? "יצירת חשבון" : mode === "forgot" ? "איפוס סיסמה" : "כניסה למערכת"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">מה קורה, מה לא תקין ומה צריך לעשות עכשיו.</p>

        <form onSubmit={submit} className="panel mt-6 space-y-4 p-5">
          {mode === "up" && (
            <div className="space-y-1.5"><Label htmlFor="n">שם מלא</Label><Input id="n" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          )}
          <div className="space-y-1.5"><Label htmlFor="e">אימייל</Label><Input id="e" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="p">סיסמה</Label>
                {mode === "in" && <button type="button" className="text-xs text-primary hover:underline" onClick={() => setMode("forgot")}>שכחתי סיסמה</button>}
              </div>
              <Input id="p" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "רגע…" : mode === "up" ? "יצירת חשבון" : mode === "forgot" ? "שלח קישור" : "כניסה"}
          </Button>
          {mode !== "forgot" && (
            <>
              <div className="relative text-center text-xs text-muted-foreground"><span className="bg-surface px-2">או</span></div>
              <Button type="button" variant="outline" className="w-full" onClick={google}>המשך עם Google</Button>
            </>
          )}
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "up" ? "כבר יש לך חשבון? " : "אין לך חשבון? "}
          <button className="text-primary hover:underline" onClick={() => setMode(mode === "up" ? "in" : "up")}>{mode === "up" ? "כניסה" : "יצירת חשבון"}</button>
        </p>
      </div>
    </div>
  );
}
