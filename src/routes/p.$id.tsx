import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getPublicPoll, submitPollResponse } from "@/lib/polls.functions";
import type { PollQuestion } from "@/lib/polls.shared";

export const Route = createFileRoute("/p/$id")({
  loader: async ({ params }) => {
    const poll = await getPublicPoll({ data: { id: params.id } });
    if (!poll) throw notFound();
    return poll;
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.title}${loaderData.orgName ? `, ${loaderData.orgName}` : ""}` : "Poll, Civi Meet";
    const d = loaderData?.description || "Share your voice, it takes less than a minute.";
    return { meta: [
      { title: t }, { name: "description", content: d },
      { property: "og:title", content: t }, { property: "og:description", content: d },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
      ...(loaderData?.event?.image && /^https:\/\//.test(loaderData.event.image) ? [
        { property: "og:image", content: loaderData.event.image },
        { name: "twitter:image", content: loaderData.event.image },
      ] : []),
    ] };
  },
  notFoundComponent: () => <main className="grid min-h-screen place-items-center p-6 text-muted-foreground">This poll doesn't exist.</main>,
  errorComponent: () => <main className="grid min-h-screen place-items-center p-6 text-muted-foreground">Couldn't load this poll.</main>,
  component: PollPage,
});

function PollPage() {
  const poll = Route.useLoaderData();
  const submit = useServerFn(submitPollResponse);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await submit({ data: { id: poll.id, answers } }); setDone(true); }
    catch (x) { setErr(x instanceof Error ? x.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-xl rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          {poll.logoUrl ? <img src={poll.logoUrl} alt="" className="h-10 w-10 object-contain" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary font-display font-bold">{(poll.orgName ?? "C")[0]}</span>}
          <span className="text-sm text-muted-foreground">{poll.orgName ?? "Civi Meet"}</span>
        </div>
        <h1 className="font-display text-2xl font-bold">{poll.title}</h1>
        {poll.description && <p className="mt-2 text-muted-foreground">{poll.description}</p>}
        {poll.event && <EventCard e={poll.event} />}
        {done ? (
          <p className="mt-8 rounded-2xl bg-secondary p-5 text-center">Thank you, your response was recorded.</p>
        ) : poll.status !== "open" ? (
          <p className="mt-8 text-muted-foreground">This poll is closed.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-6">
            {poll.questions.map((q) => <Question key={q.id} q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} />)}
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" disabled={busy} className="w-full rounded-full">{busy ? "Sending…" : "Submit"}</Button>
          </form>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">Powered by Civi Meet</p>
      </div>
    </main>
  );
}

function Question({ q, value, onChange }: { q: PollQuestion; value: unknown; onChange: (v: unknown) => void }) {
  const pill = (on: boolean) => `rounded-2xl border px-4 py-2.5 text-left text-sm transition ${on ? "border-primary bg-primary/10 font-medium" : "hover:bg-secondary"}`;
  return (
    <fieldset>
      <legend className="mb-2 font-medium">{q.q}{q.required && <span className="text-destructive"> *</span>}</legend>
      {q.type === "choice" && <div className="grid gap-2">{q.options?.map((o) => <button type="button" key={o} className={pill(value === o)} onClick={() => onChange(o)}>{o}</button>)}</div>}
      {q.type === "multi" && <div className="grid gap-2">{q.options?.map((o) => {
        const arr = Array.isArray(value) ? (value as string[]) : [];
        const on = arr.includes(o);
        return <button type="button" key={o} className={pill(on)} onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}>{o}</button>;
      })}</div>}
      {q.type === "rating" && <div className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} aria-label={`${n} of 5`} className={`h-11 w-11 rounded-full border text-sm ${value === n ? "border-primary bg-primary/10 font-semibold" : "hover:bg-secondary"}`} onClick={() => onChange(n)}>{n}</button>)}</div>}
      {q.type === "text" && <Textarea maxLength={2000} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="rounded-2xl" />}
      {q.type === "contact" && (() => {
        const c = (value as { name?: string; email?: string; phone?: string }) ?? {};
        return <div className="grid gap-2">
          <Input placeholder="Name" maxLength={120} value={c.name ?? ""} onChange={(e) => onChange({ ...c, name: e.target.value })} />
          <Input type="email" placeholder="Email" maxLength={255} value={c.email ?? ""} onChange={(e) => onChange({ ...c, email: e.target.value })} />
          <Input type="tel" placeholder="Phone (optional)" maxLength={40} value={c.phone ?? ""} onChange={(e) => onChange({ ...c, phone: e.target.value })} />
        </div>;
      })()}
    </fieldset>
  );
}

function EventCard({ e }: { e: NonNullable<ReturnType<typeof Route.useLoaderData>["event"]> }) {
  const fmt = (v?: string) => {
    if (!v) return null;
    const d = new Date(v); if (isNaN(d.getTime())) return v;
    return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(e.timezone ? { timeZone: e.timezone } : {}) });
  };
  const start = fmt(e.start), end = e.end ? new Date(e.end) : null;
  const endT = end && !isNaN(end.getTime()) ? end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", ...(e.timezone ? { timeZone: e.timezone } : {}) }) : null;
  return (
    <section aria-label="Event details" className="mt-5 overflow-hidden rounded-2xl border bg-secondary/40">
      {e.image && <img src={e.image} alt="" className="aspect-[2/1] w-full object-cover" />}
      <div className="space-y-1.5 p-4 text-sm">
        <div className="font-medium">{e.title}</div>
        {start && <div className="text-muted-foreground">🗓 {start}{endT ? `, ${endT}` : ""}</div>}
        {e.location && <div className="text-muted-foreground">📍 {e.location}</div>}
        {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="inline-block pt-1 font-medium text-primary underline underline-offset-4">View event page ↗</a>}
      </div>
    </section>
  );
}
