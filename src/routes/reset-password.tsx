import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "סיסמה חדשה — Pulse" },
      { name: "description", content: "בחירת סיסמה חדשה לחשבון." },
      { property: "og:title", content: "סיסמה חדשה — Pulse" },
      { property: "og:description", content: "בחירת סיסמה חדשה לחשבון." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error("לא הצלחנו לעדכן את הסיסמה. בקש קישור חדש.");
    toast.success("הסיסמה עודכנה");
    navigate({ to: "/dashboard" });
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={save} className="panel w-full max-w-sm space-y-4 p-6">
        <h1 className="text-lg font-semibold">בחירת סיסמה חדשה</h1>
        <div className="space-y-1.5"><Label>סיסמה חדשה</Label><Input type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required /></div>
        <Button type="submit" className="w-full" disabled={busy}>שמירה</Button>
      </form>
    </div>
  );
}
