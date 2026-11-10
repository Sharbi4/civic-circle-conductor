import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { submitInfoRequest } from "@/lib/inquiry.functions";

const field = "h-12 w-full rounded-2xl border border-border/60 bg-background/60 px-4 text-sm outline-none transition focus:border-primary";

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
    <div className="mx-auto mt-10 flex max-w-md flex-col items-center rounded-[2rem] border border-border/60 bg-card/80 p-8 backdrop-blur-xl">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-5 w-5" /></span>
      <p className="mt-4 text-lg font-medium">Thanks — we got your request.</p>
      <p className="mt-1 text-sm text-muted-foreground">We'll reach out soon.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="mx-auto mt-10 grid max-w-xl gap-3 rounded-[2rem] border border-border/60 bg-card/80 p-5 text-left shadow-2xl backdrop-blur-xl sm:grid-cols-2 sm:p-6">
      <input required type="email" placeholder="Email" value={f.email} onChange={set("email")} maxLength={255} className={field} />
      <input type="tel" placeholder="Phone (optional)" value={f.phone} onChange={set("phone")} maxLength={40} className={field} />
      <input required placeholder="Organization name, city & what you do" value={f.organization} onChange={set("organization")} maxLength={300} className={`${field} sm:col-span-2`} />
      <textarea rows={3} placeholder="What would you like Civi to help with?" value={f.message} onChange={set("message")} maxLength={1000} className={`${field} h-auto resize-none py-3 sm:col-span-2`} />
      <button disabled={busy} className="h-12 rounded-full bg-primary font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60 sm:col-span-2">{busy ? "Sending…" : "Request more information"}</button>
    </form>
  );
}
