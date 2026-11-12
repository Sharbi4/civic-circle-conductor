import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { submitInfoRequest } from "@/lib/inquiry.functions";

const field = "h-12 w-full rounded-xl border border-border bg-background/70 px-4 text-sm outline-none transition placeholder:text-muted-foreground/80 focus:border-primary focus:ring-2 focus:ring-primary/25";

export function InfoRequestForm() {
  const send = useServerFn(submitInfoRequest);
  const [f, setF] = useState({ email: "", phone: "", organization: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await send({ data: f }); setDone(true); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  if (done) return (
    <div className="surface-premium mx-auto mt-10 flex w-full max-w-md flex-col items-center rounded-[1.75rem] p-8">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-5 w-5" /></span>
      <p className="mt-4 text-lg font-medium">Thanks, we got your request.</p>
      <p className="mt-1 text-sm text-muted-foreground">We'll reach out soon.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="surface-premium mx-auto mt-10 grid w-full max-w-xl gap-3 rounded-[1.75rem] p-4 text-left sm:grid-cols-2 sm:gap-4 sm:p-6">
      <input required type="email" placeholder="Email" value={f.email} onChange={set("email")} maxLength={255} className={field} />
      <input type="tel" placeholder="Phone (optional)" value={f.phone} onChange={set("phone")} maxLength={40} className={field} />
      <input required placeholder="Organization name, city & what you do" value={f.organization} onChange={set("organization")} maxLength={300} className={`${field} sm:col-span-2`} />
      <textarea rows={3} placeholder="What would you like Civi to help with?" value={f.message} onChange={set("message")} maxLength={1000} className={`${field} h-auto resize-none py-3 sm:col-span-2`} />
      <button disabled={busy} className="cta-primary group mt-1 inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-6 text-[15px] font-semibold tracking-tight transition hover:brightness-105 disabled:opacity-60 sm:col-span-2">
        {busy ? "Sending…" : "Request more information"}
        {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
      </button>
    </form>
  );
}
