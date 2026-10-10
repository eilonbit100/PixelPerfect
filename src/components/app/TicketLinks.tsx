import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { fmtDate } from "@/lib/format";
import { TICKET_STATUS, TICKET_TYPE } from "@/lib/tickets";
import { StatusBadge } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TicketDialog } from "@/components/app/TicketDialog";

export type LinkKind = "customer" | "task" | "product";
const COL = { customer: "customer_id", task: "task_id", product: "product_id" } as const;

/** Reverse link: tickets connected to a customer / task / product. RLS limits rows to tickets the viewer may see. */
export function LinkedTickets({ kind, id, title = "קריאות מקושרות" }: { kind: LinkKind; id: string; title?: string }) {
  const { org } = useOrg();
  const q = useQuery({
    queryKey: ["tickets", "linked", kind, id],
    queryFn: async () => {
      const { data, error } = await supabase.from("approval_requests").select("id,ticket_no,title,ticket_type,status,created_at")
        .eq("organization_id", org.id).eq(COL[kind], id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">{title}</span>
        <TicketDialog preset={{ [COL[kind]]: id }} trigger={<Button size="sm" variant="ghost"><Plus className="size-4" /> קריאה חדשה</Button>} />
      </div>
      {!q.data?.length ? <p className="px-4 py-3 text-sm text-muted-foreground">{q.isLoading ? "טוען…" : "אין קריאות מקושרות."}</p> : (
        <ul className="divide-y">{q.data.map((t) => (
          <li key={t.id}><Link to="/tickets/$id" params={{ id: t.id }} className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-muted/50">
            <span className="truncate"><span className="num text-muted-foreground">#{t.ticket_no}</span> {t.title}<span className="block text-xs text-muted-foreground">{TICKET_TYPE[t.ticket_type]} · <span className="num">{fmtDate(t.created_at)}</span></span></span>
            <StatusBadge tone={TICKET_STATUS[t.status]?.tone}>{TICKET_STATUS[t.status]?.label}</StatusBadge>
          </Link></li>))}</ul>
      )}
    </div>
  );
}

/** Picker for an existing record only — never creates customers/tasks/products. */
export function LinkPicker({ kind, value, onChange }: { kind: LinkKind; value: string; onChange: (v: string) => void }) {
  const { org } = useOrg();
  const [term, setTerm] = useState("");
  const q = useQuery({
    queryKey: ["link-pick", kind, org.id, term, value],
    queryFn: async () => {
      const t = term.trim();
      if (kind === "customer") {
        let r = supabase.from("customers").select("id,full_name,phone").eq("organization_id", org.id).is("deleted_at", null).order("full_name").limit(20);
        if (t) r = r.or(`full_name.ilike.%${t.replace(/[,()%]/g, "")}%,normalized_phone.ilike.%${t.replace(/\D/g, "") || "~"}%`);
        const { data } = await r;
        let rows = (data ?? []).map((c) => ({ id: c.id, label: c.phone ? `${c.full_name} · ${c.phone}` : c.full_name }));
        if (value && !rows.some((x) => x.id === value)) {
          const one = (await supabase.from("customers").select("id,full_name").eq("id", value).maybeSingle()).data;
          if (one) rows = [{ id: one.id, label: one.full_name }, ...rows];
        }
        return rows;
      }
      if (kind === "task") {
        let r = supabase.from("tasks").select("id,title,status").eq("organization_id", org.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(30);
        if (t) r = r.ilike("title", `%${t.replace(/[%]/g, "")}%`);
        const { data } = await r;
        return (data ?? []).map((x) => ({ id: x.id, label: x.title }));
      }
      let r = supabase.from("inventory_products").select("id,name,sku").eq("organization_id", org.id).is("deleted_at", null).order("name").limit(50);
      if (t) r = r.ilike("name", `%${t.replace(/[%]/g, "")}%`);
      const { data } = await r;
      return (data ?? []).map((x) => ({ id: x.id, label: x.sku ? `${x.name} · ${x.sku}` : x.name }));
    },
  });
  return (
    <div className="flex gap-2">
      <Input className="w-28 shrink-0" placeholder="חיפוש" value={term} onChange={(e) => setTerm(e.target.value)} />
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger className="min-w-0"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="none">ללא קישור</SelectItem>{(q.data ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
