import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { logoToDataUrl } from "@/lib/logo";
import { LETTERHEAD_FIELDS, useLetterhead } from "@/components/LetterheadCheck";

export function AccountPanel() {
  const qc = useQueryClient();
  const o = useLetterhead();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!o.data) return;
    const d = o.data as Record<string, unknown>;
    setVals(Object.fromEntries(LETTERHEAD_FIELDS.map((f) => [f.k, String(d[f.k] ?? "")])));
    setLogo(o.data.logo_url);
  }, [o.data]);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "")); }, []);
  const d = (o.data ?? {}) as Record<string, unknown>;
  const dirty = !!o.data && (logo !== o.data.logo_url || LETTERHEAD_FIELDS.some((f) => (vals[f.k] ?? "").trim() !== String(d[f.k] ?? "")));

  async function save() {
    if (!vals["name"]?.trim()) { toast.error("Organization name can't be empty"); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const upd = Object.fromEntries(LETTERHEAD_FIELDS.map((f) => [f.k, vals[f.k]?.trim().slice(0, 200) || null]));
    const { error } = await supabase.from("organizations").update({ ...upd, logo_url: logo }).eq("user_id", u.user!.id);
    setSaving(false);
    if (error) { toast.error("Couldn't save your details"); return; }
    for (const k of ["org-letterhead", "org-letterhead-full", "org"]) qc.invalidateQueries({ queryKey: [k] });
    toast.success("Account details saved");
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-4">
      <h2 className="px-2 pb-1 font-medium">My account</h2>
      <p className="px-2 pb-3 text-xs text-muted-foreground">These appear on your official documents, forms and letterhead.</p>
      <div className="mb-3 flex items-center gap-3 rounded-2xl border bg-background/30 p-3">
        {logo ? <img src={logo} alt="Organization logo" className="h-14 w-14 rounded-lg object-contain" /> : <span className="grid h-14 w-14 place-items-center rounded-lg bg-secondary text-xs text-muted-foreground">Logo</span>}
        <div className="flex flex-col gap-1.5">
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()}>{logo ? "Change logo" : "Upload logo"}</Button>
          {logo && <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setLogo(null)}>Remove</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) try { setLogo(await logoToDataUrl(f)); } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't use that image"); } }} />
      </div>
      <div className="space-y-2.5">
        {LETTERHEAD_FIELDS.map((f) => (
          <label key={f.k} className="block">
            <span className="px-1 text-xs text-muted-foreground">{f.label}</span>
            <Input value={vals[f.k] ?? ""} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} placeholder={f.ph} className="mt-0.5 h-9" />
          </label>
        ))}
      </div>
      <Button className="mt-4 w-full rounded-full" onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : dirty ? "Save changes" : "Saved"}</Button>
      {email && <p className="mt-4 px-1 text-xs text-muted-foreground">Signed in as {email}</p>}
    </div>
  );
}
