import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ArrowLeft, Building2, CalendarDays, Check, CheckCircle2, CircleDollarSign, Lightbulb, MessagesSquare, Pin, Plus, RefreshCw, StickyNote, Store, Trash2, Users, Contact, XCircle, Clock, ImagePlus, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { refreshEventSuggestions } from "@/lib/eventProfile.functions";
import { resetEventProgress, signedCover, uploadEventCover } from "@/lib/eventGoal";
import { stepInfo, isEssentialsStep, sortSteps } from "@/lib/eventSteps.shared";
import { EventEssentialsDialog } from "@/components/tasks/EventEssentialsDialog";

export const Route = createFileRoute("/_authenticated/events/$goalId")({
  head: () => ({
    meta: [
      { title: "Event overview — Civi Meet" },
      { name: "description", content: "Venue, budget, team, vendors, progress and ideas for your event in one place." },
      { property: "og:title", content: "Event overview — Civi Meet" },
      { property: "og:description", content: "Venue, budget, team, vendors, progress and ideas for your event in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EventPage,
});

type Profile = Database["public"]["Tables"]["event_profiles"]["Row"];
type Person = { name: string; role?: string; phone?: string; email?: string; booked?: boolean };
const STICKY = ["sun", "sky", "mint", "rose"] as const;
const stickyBg: Record<string, string> = { sun: "bg-sticky-sun", sky: "bg-sticky-sky", mint: "bg-sticky-mint", rose: "bg-sticky-rose" };

function EventPage() {
  const { goalId } = Route.useParams();
  const qc = useQueryClient();
  const key = ["event-page", goalId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: goal, error } = await supabase.from("tasks").select("*").eq("id", goalId).maybeSingle();
      if (error || !goal) throw new Error("Event not found");
      const [steps, profile, notes, thread, approvals] = await Promise.all([
        supabase.from("tasks").select("*").eq("goal_id", goalId).order("created_at"),
        supabase.from("event_profiles").select("*").eq("goal_id", goalId).maybeSingle(),
        supabase.from("sticky_notes").select("*").eq("goal_id", goalId).order("created_at", { ascending: false }),
        goal.thread_id ? supabase.from("threads").select("id, title, event_date").eq("id", goal.thread_id).maybeSingle() : Promise.resolve({ data: null }),
        goal.thread_id ? supabase.from("approvals").select("id, title, payload, status, run_state, created_at, resolved_at, run_finished_at").eq("thread_id", goal.thread_id).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
      ]);
      const cover = await signedCover(profile.data?.cover_path);
      return { goal, cover, steps: sortSteps(steps.data ?? []), profile: profile.data, notes: notes.data ?? [], thread: thread.data, approvals: approvals.data ?? [] };
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("event_profiles").upsert({ goal_id: goalId, user_id: u.user!.id, ...q.data?.profile, ...patch, updated_at: new Date().toISOString() } as Profile, { onConflict: "goal_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error("Couldn't save that change"),
  });
  const refresh = useMutation({
    mutationFn: () => refreshEventSuggestions({ data: { goalId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error("Couldn't get new suggestions right now"),
  });
  async function addNote(text: string, color: string = STICKY[Math.floor(Math.random() * 4)] ?? "sun") {
    if (!text.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("sticky_notes").insert({ user_id: u.user!.id, goal_id: goalId, text: text.trim().slice(0, 600), color });
    qc.invalidateQueries({ queryKey: key });
  }
  const [essentials, setEssentials] = useState(false);
  const [uploading, setUploading] = useState(false);
  async function onCover(f: File | undefined) {
    if (!f) return; setUploading(true);
    try { await uploadEventCover(goalId, f); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["event-profiles", goalId] }); qc.invalidateQueries({ queryKey: ["event-covers"] }); } catch { toast.error("Couldn't upload that photo"); } finally { setUploading(false); }
  }
  async function reset() {
    if (!confirm("Reset progress? Every step goes back to not started.")) return;
    try { await resetEventProgress(goalId); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Progress reset"); } catch { toast.error("Couldn't reset progress"); }
  }

  if (q.isLoading) return <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading event…</div>;
  if (q.error || !q.data) return <div className="grid h-full place-items-center text-sm text-muted-foreground">This event couldn't be found. <Link to="/chat" className="text-primary underline">Back to chats</Link></div>;
  const { goal, cover, steps, profile: p, notes, thread, approvals } = q.data;
  const done = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const title = (thread?.title || goal.title).replace(/^(Event|Launch):\s*/, "");
  const date = thread?.event_date ? new Date(`${thread.event_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Date to be set";
  const staff = (p?.staff ?? []) as Person[], contacts = (p?.contacts ?? []) as Person[], vendors = (p?.vendors ?? []) as Person[];
  const suggestions = (p?.suggestions ?? []) as { title: string; detail: string }[];
  const budget = Number(p?.budget ?? 0), spent = Number(p?.spent ?? 0);
  const actions = [
    ...approvals.filter((a) => a.status !== "pending" || a.run_state).map((a) => ({ id: a.id, text: a.title, state: a.run_state === "succeeded" ? "done" : a.run_state === "failed" ? "failed" : a.status === "declined" ? "declined" : a.status === "pending" ? "waiting" : "working", at: a.run_finished_at ?? a.resolved_at ?? a.created_at })),
    ...steps.filter((s) => s.done && s.done_at).map((s) => ({ id: s.id, text: `Completed: ${s.title}`, state: "done", at: s.done_at! })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <Link to="/chat" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>

        <header className="mb-6 overflow-hidden rounded-3xl border bg-card">
          <label className="group relative block h-44 cursor-pointer overflow-hidden bg-gradient-to-br from-primary/30 via-primary/10 to-secondary md:h-56">
            {cover ? <img src={cover} alt="Event photo" className="h-full w-full object-cover" /> : null}
            <span className={`absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 text-xs font-medium backdrop-blur transition ${cover ? "opacity-0 group-hover:opacity-100 max-md:opacity-100" : ""}`}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}{cover ? "Change photo" : "Add event photo"}
            </span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onCover(e.target.files?.[0])} />
          </label>
          <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary"><CalendarDays className="h-3.5 w-3.5" /> {date}</p>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">{title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{p?.venue ? `${p.venue} · ` : ""}{done} of {steps.length} steps done</p>
            </div>
            {goal.thread_id && <Button asChild variant="outline" className="rounded-full"><Link to="/chat/$threadId" params={{ threadId: goal.thread_id }}><MessagesSquare className="mr-1.5 h-4 w-4" /> Event chat</Link></Button>}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
            <span className="text-sm font-semibold tabular-nums">{pct}%</span>
            <button onClick={reset} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"><RotateCcw className="h-3.5 w-3.5" /> Reset progress</button>
          </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card icon={<Building2 className="h-4 w-4" />} title="Venue">
            <Field label="Venue name" value={p?.venue ?? ""} onSave={(v) => save.mutate({ venue: v })} placeholder="Where is it happening?" />
            <Field label="Address, room, capacity, terms" value={p?.venue_details ?? ""} onSave={(v) => save.mutate({ venue_details: v })} multiline placeholder="Anything worth remembering" />
            <div className="mt-2 flex gap-1.5">
              {(["searching", "holding", "booked"] as const).map((s) => (
                <button key={s} onClick={() => save.mutate({ venue_status: s })} className={`rounded-full border px-3 py-1 text-xs capitalize transition ${p?.venue_status === s || (!p && s === "searching") ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{s === "holding" ? "On hold" : s}</button>
              ))}
            </div>
          </Card>

          <Card icon={<CircleDollarSign className="h-4 w-4" />} title="Budget">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Budget ($)" value={p?.budget?.toString() ?? ""} onSave={(v) => save.mutate({ budget: v ? Number(v) || 0 : null })} numeric />
              <Field label="Expected people" value={p?.headcount?.toString() ?? ""} onSave={(v) => save.mutate({ headcount: v ? parseInt(v, 10) || 0 : null })} numeric />
              <Field label="Spent ($)" value={p?.spent?.toString() ?? ""} onSave={(v) => save.mutate({ spent: v ? Number(v) || 0 : null })} numeric />
            </div>
            {budget > 0 && (
              <div className="mt-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${spent > budget ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} /></div>
                <p className="mt-1 text-xs text-muted-foreground">${Math.max(0, budget - spent).toLocaleString()} left{spent > budget ? ` · $${(spent - budget).toLocaleString()} over` : ""}</p>
              </div>
            )}
            <Field label="Notes" value={p?.budget_notes ?? ""} onSave={(v) => save.mutate({ budget_notes: v })} multiline placeholder="Donations, sponsors, quotes…" />
          </Card>

          <Card icon={<Users className="h-4 w-4" />} title="Team">
            <People list={staff} fields={["name", "role"]} empty="Add who's helping" onChange={(l) => save.mutate({ staff: l })} />
          </Card>

          <Card icon={<Store className="h-4 w-4" />} title="Vendors" className="lg:col-span-2">
            <People list={vendors} fields={["name", "role", "phone", "email"]} labels={{ role: "Service" }} bookable empty="Food trucks, caterers, DJs, rentals…" onChange={(l) => save.mutate({ vendors: l })} />
          </Card>

          <Card icon={<Contact className="h-4 w-4" />} title="Contacts">
            <People list={contacts} fields={["name", "role", "phone", "email"]} labels={{ role: "Who they are" }} empty="Venue manager, partners, speakers" onChange={(l) => save.mutate({ contacts: l })} />
          </Card>

          <Card icon={<CheckCircle2 className="h-4 w-4" />} title="Steps">
            <ul className="space-y-1">
              {steps.map((s) => {
                const info = stepInfo(s.title); const ess = isEssentialsStep(s.title);
                const inner = (<>
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${s.done ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{s.done && <Check className="h-3 w-3" />}</span>
                  <span className="min-w-0"><span className={`block text-sm ${s.done ? "text-muted-foreground" : ""}`}>{s.title}</span>{info && <span className="block text-xs text-muted-foreground">{info}</span>}</span>
                </>);
                return <li key={s.id}>{ess ? <button onClick={() => setEssentials(true)} className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-secondary">{inner}</button> : <div className="flex items-start gap-2 px-1.5 py-1.5">{inner}</div>}</li>;
              })}
              {!steps.length && <p className="text-sm text-muted-foreground">No steps yet.</p>}
            </ul>
          </Card>

          <Card icon={<Clock className="h-4 w-4" />} title="What Civi has done" className="lg:col-span-2">
            {actions.length ? (
              <ol className="relative space-y-3 border-l pl-4">
                {actions.map((a) => (
                  <li key={a.id} className="relative">
                    <span className={`absolute -left-[21px] top-1 grid h-3 w-3 place-items-center rounded-full ${a.state === "done" ? "bg-primary" : a.state === "failed" ? "bg-destructive" : "bg-muted-foreground/40"}`} />
                    <p className="text-sm">{a.text}</p>
                    <p className="text-xs text-muted-foreground">{a.state === "done" ? "Done" : a.state === "failed" ? "Didn't work" : a.state === "declined" ? "Declined" : a.state === "waiting" ? "Waiting for your OK" : "In progress"} · {new Date(a.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted-foreground">Nothing yet — actions show up here as Civi works on this event.</p>}
          </Card>

          <Card icon={<Lightbulb className="h-4 w-4" />} title="Suggestions" className="lg:col-span-3"
            action={<Button size="sm" variant="ghost" className="rounded-full" disabled={refresh.isPending} onClick={() => refresh.mutate()}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />{suggestions.length ? "Refresh" : "Get suggestions"}</Button>}>
            {suggestions.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map((s, i) => (
                  <div key={i} className="group flex flex-col rounded-2xl border bg-background/50 p-3">
                    <p className="text-sm font-semibold">{s.title}</p>
                    <p className="mt-1 flex-1 text-sm text-muted-foreground">{s.detail}</p>
                    <button onClick={() => { addNote(`${s.title} — ${s.detail}`); toast.success("Pinned to your board"); }} className="mt-2 inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-xs text-primary hover:bg-primary/10"><Pin className="h-3 w-3" /> Pin to board</button>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">{refresh.isPending ? "Thinking up ideas for this event…" : "Get fresh ideas for this event, then pin the good ones to your board."}</p>}
          </Card>

          <Card icon={<StickyNote className="h-4 w-4" />} title="Sticky board" className="lg:col-span-3">
            <NewNote onAdd={addNote} />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {notes.map((n, i) => (
                <div key={n.id} className={`group relative min-h-28 rounded-md p-3 text-sm text-sticky-ink shadow-sm ${stickyBg[n.color] ?? "bg-sticky-sun"} ${i % 2 ? "rotate-1" : "-rotate-1"} transition hover:rotate-0`}>
                  <p className="whitespace-pre-wrap break-words pr-4">{n.text}</p>
                  <button aria-label="Remove note" onClick={async () => { await supabase.from("sticky_notes").delete().eq("id", n.id); qc.invalidateQueries({ queryKey: key }); }}
                    className="absolute right-1.5 top-1.5 rounded-full p-0.5 opacity-0 transition group-hover:opacity-70 max-md:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            {!notes.length && <p className="mt-2 text-sm text-muted-foreground">Jot ideas here, or pin suggestions.</p>}
          </Card>
        </div>
      </div>
      <EventEssentialsDialog goalId={goalId} open={essentials} onOpenChange={setEssentials} />
    </div>
  );
}

function Card({ icon, title, children, className = "", action }: { icon: ReactNode; title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-3xl border bg-card p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">{icon}</span>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onSave, multiline, numeric, placeholder }: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean; numeric?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value);
  const cls = "w-full rounded-xl border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary";
  const commit = () => { if (v !== value) onSave(v.trim()); };
  return (
    <label className="mb-2 block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {multiline ? <textarea rows={2} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} className={`${cls} resize-none`} />
        : <input inputMode={numeric ? "decimal" : undefined} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className={cls} />}
    </label>
  );
}

function People({ list, fields, labels = {}, bookable, empty, onChange }: { list: Person[]; fields: (keyof Person)[]; labels?: Partial<Record<keyof Person, string>>; bookable?: boolean; empty: string; onChange: (l: Person[]) => void }) {
  const [draft, setDraft] = useState<Person>({ name: "" });
  const [open, setOpen] = useState(false);
  return (
    <div>
      <ul className="space-y-1.5">
        {list.map((x, i) => (
          <li key={i} className="group flex items-center gap-2 rounded-xl border bg-background/50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{x.name}{x.role && <span className="font-normal text-muted-foreground"> · {x.role}</span>}</p>
              {(x.phone || x.email) && <p className="truncate text-xs text-muted-foreground">{[x.phone, x.email].filter(Boolean).join(" · ")}</p>}
            </div>
            {bookable && <button onClick={() => onChange(list.map((y, j) => (j === i ? { ...y, booked: !y.booked } : y)))} className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${x.booked ? "bg-primary text-primary-foreground" : "border hover:bg-secondary"}`}>{x.booked ? "Booked" : "Not booked"}</button>}
            <button aria-label="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))} className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 max-md:opacity-60"><XCircle className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      {!list.length && !open && <p className="text-sm text-muted-foreground">{empty}</p>}
      {open ? (
        <form className="mt-2 grid gap-1.5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!draft.name.trim()) return; onChange([...list, draft]); setDraft({ name: "" }); setOpen(false); }}>
          {fields.map((f) => <input key={f} autoFocus={f === "name"} value={(draft[f] as string) ?? ""} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} placeholder={labels[f] ?? f[0]!.toUpperCase() + f.slice(1)} className="rounded-xl border bg-background/50 px-3 py-1.5 text-sm outline-none focus:border-primary" />)}
          <div className="flex gap-1.5 sm:col-span-2"><Button size="sm" type="submit" className="rounded-full">Add</Button><Button size="sm" type="button" variant="ghost" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      ) : <button onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-primary hover:bg-primary/10"><Plus className="h-3.5 w-3.5" /> Add</button>}
    </div>
  );
}

function NewNote({ onAdd }: { onAdd: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onAdd(t); setT(""); }}>
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Add an idea to the board…" className="min-w-0 flex-1 rounded-full border bg-background/50 px-4 py-2 text-sm outline-none focus:border-primary" />
      <Button type="submit" size="sm" className="rounded-full"><Plus className="mr-1 h-3.5 w-3.5" /> Note</Button>
    </form>
  );
}
