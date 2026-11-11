import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { logoToDataUrl } from "@/lib/logo";
import { claimLetterheadReminder, hasSeenLetterheadReminder } from "@/lib/letterheadSession";

export async function shouldShowLetterheadReminder() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user.id) return false;
  return !hasSeenLetterheadReminder(window.sessionStorage, data.session.user.id);
}

export const LETTERHEAD_FIELDS = [
  { k: "name", label: "Organization name", ph: "Civimeet Tucson" },
  { k: "address", label: "Address", ph: "123 Main St, Tucson AZ 85701" },
  { k: "contact_name", label: "Contact person", ph: "Jane Rivera, Organizer" },
  { k: "contact_email", label: "Email", ph: "hello@yourorg.org" },
  { k: "contact_phone", label: "Phone", ph: "(520) 555-0123" },
  { k: "website", label: "Website", ph: "yourorg.org" },
] as const;
type Key = (typeof LETTERHEAD_FIELDS)[number]["k"] | "logo_url";

export function useLetterhead() {
  return useQuery({
    queryKey: ["org-letterhead-full"],
    queryFn: async () => (await supabase.from("organizations").select("name, address, logo_url, contact_name, contact_email, contact_phone, website, letterhead_skipped").maybeSingle()).data,
  });
}
export function missingLetterhead(o: Record<string, unknown> | null | undefined): Key[] {
  if (!o) return [];
  const skipped = (o["letterhead_skipped"] as string[] | undefined) ?? [];
  return ([...LETTERHEAD_FIELDS.map((f) => f.k), "logo_url"] as Key[]).filter((k) => !skipped.includes(k) && !String(o[k] ?? "").trim());
}

export function LetterheadCheck({ open, onOpenChange, onSaved, onSkipped }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved?: () => void; onSkipped?: () => void }) {
  const qc = useQueryClient();
  const o = useLetterhead();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [skip, setSkip] = useState<string[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user.id) claimLetterheadReminder(window.sessionStorage, data.session.user.id);
    });
  }, [open]);
  useEffect(() => {
    if (!open || !o.data) return;
    const d = o.data as Record<string, unknown>;
    setVals(Object.fromEntries(LETTERHEAD_FIELDS.map((f) => [f.k, String(d[f.k] ?? "")])));
    setSkip(o.data.letterhead_skipped ?? []); setLogo(o.data.logo_url);
  }, [open, o.data]);
  const empty = (k: string) => (k === "logo_url" ? !logo : !vals[k]?.trim()) && !skip.includes(k);
  const toggleSkip = (k: string) => setSkip((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  async function save() {
    setSaving(true);
    try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Please sign in to save details"); return; }
    const upd = Object.fromEntries(LETTERHEAD_FIELDS.map((f) => [f.k, vals[f.k]?.trim().slice(0, 200) || null]));
    const { error } = await supabase.from("organizations").update({ ...upd, logo_url: logo, letterhead_skipped: skip }).eq("user_id", u.user.id);
    setSaving(false);
    if (error) { toast.error("Couldn't save those details"); return; }
    qc.invalidateQueries({ queryKey: ["org-letterhead"] }); qc.invalidateQueries({ queryKey: ["org-letterhead-full"] }); qc.invalidateQueries({ queryKey: ["org"] });
    toast.success("Letterhead details saved"); onOpenChange(false); onSaved?.();
    } catch { toast.error("Couldn't save those details"); }
    finally { setSaving(false); }
  }
  const left = [...LETTERHEAD_FIELDS.map((f) => f.k), "logo_url"].filter(empty).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Let's make sure everything's filled in</DialogTitle>
          <DialogDescription>These go on every official document so nothing prints blank. Fill each in, or skip any you don't want shown.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          <div className={`flex items-center gap-3 rounded-xl border p-2.5 ${empty("logo_url") ? "border-accent" : ""}`}>
            {logo ? <img src={logo} alt="" className="h-10 w-10 object-contain" /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-xs">Logo</span>}
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>{logo ? "Change logo" : "Upload logo"}</Button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) try { setLogo(await logoToDataUrl(f)); } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't use that image"); } }} />
            <SkipBtn on={skip.includes("logo_url")} onClick={() => toggleSkip("logo_url")} />
          </div>
          {LETTERHEAD_FIELDS.map((f) => (
            <div key={f.k} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-xs text-muted-foreground">{f.label}</span>
              <Input value={vals[f.k] ?? ""} disabled={skip.includes(f.k)} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} placeholder={f.ph}
                className={`h-9 ${empty(f.k) ? "border-accent" : ""}`} />
              <SkipBtn on={skip.includes(f.k)} onClick={() => toggleSkip(f.k)} />
            </div>
          ))}
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">{left ? `${left} still empty` : "All set ✓"}</span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={saving} onClick={() => { onOpenChange(false); onSkipped?.(); }}>Skip for now</Button>
            <Button onClick={save} disabled={saving || left > 0}>{saving ? "Saving…" : "Save details"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function SkipBtn({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <Button type="button" size="sm" variant={on ? "secondary" : "outline"} aria-pressed={on} onClick={onClick} className="h-7 shrink-0 px-2.5 text-[11px]">{on ? "Skipped" : "Skip"}</Button>;
}
