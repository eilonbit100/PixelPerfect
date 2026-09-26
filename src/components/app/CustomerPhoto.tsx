import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("");

export function CustomerPhoto({ name, path, size = 56, className }: { name: string; path?: string | null; size?: number; className?: string }) {
  const url = useQuery({
    queryKey: ["photo", path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("customer-photos").createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-semibold text-accent-foreground", className)}
      style={{ width: size, height: size, fontSize: size / 2.6 }}
    >
      {url.data ? <img src={url.data} alt={name} className="size-full object-cover" /> : initials(name)}
    </div>
  );
}

/** Photo with upload / camera capture */
export function EditablePhoto({ orgId, customerId, name, path, onSaved }: { orgId: string; customerId: string; name: string; path?: string | null; onSaved: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("יש לבחור קובץ תמונה");
    const p = `${orgId}/${customerId}/${Date.now()}.${file.name.split(".").pop() ?? "jpg"}`;
    const up = await supabase.storage.from("customer-photos").upload(p, file);
    if (up.error) return toast.error("העלאת התמונה נכשלה");
    const { error } = await supabase.from("customers").update({ photo_path: p }).eq("id", customerId);
    if (error) return toast.error(friendlyError(error));
    toast.success("התמונה נשמרה");
    onSaved();
  }
  return (
    <button type="button" onClick={() => ref.current?.click()} className="group relative rounded-full" aria-label="החלפת תמונה">
      <CustomerPhoto name={name} path={path} size={72} />
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/50 text-background opacity-0 transition group-hover:opacity-100">
        <Camera className="size-5" />
      </span>
      <input ref={ref} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
    </button>
  );
}
