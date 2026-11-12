import { useState } from "react";
import { formatAppTime } from "@/lib/appTimeZone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarHeart, Check, ChevronDown, ChevronRight, Loader2, MessagesSquare, MoreHorizontal, Plus, RotateCcw, Target, Trash2 } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { isEssentialsStep, sortSteps } from "@/lib/eventSteps.shared";
import { StepStatus } from "./StepStatus";
import { resetEventProgress, openScheduledTaskChat, signedCover } from "@/lib/eventGoal";
import { EventEssentialsDialog } from "./EventEssentialsDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Task = { id: string; goal_id: string | null; kind: string; title: string; due_date: string | null; done: boolean; created_by: string; created_at: string; repeat?: string | null; scheduled_for?: string | null; last_error?: string | null; thread_id?: string | null; step_key?: string | null; step_state?: string | null; step_note?: string | null; result_url?: string | null };

const today = () => new Date().toISOString().slice(0, 10);
function dueLabel(d: string) {
  const t = today();
  const dt = new Date(d + "T12:00:00");
  const s = dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d < t ? `Overdue · ${s}` : d === t ? "Today" : s;
}

export function TasksPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
    refetchInterval: 15000,
  });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showDone, setShowDone] = useState(false);
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoal, setNewGoal] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  async function add(title: string, kind: "goal" | "task", goal_id: string | null) {
    if (!title.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("tasks").insert({ user_id: u.user!.id, title: title.trim(), kind, goal_id });
    if (error) toast.error("Couldn't add that"); else refresh();
  }
  async function update(id: string, patch: Partial<Task>) {
    qc.setQueryData<Task[]>(["tasks"], (old) => old?.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const full = { ...patch, ...("done" in patch ? { done_at: patch.done ? new Date().toISOString() : null } : {}), ...("due_date" in patch ? { scheduled_for: patch.due_date ? `${patch.due_date}T07:00:00Z` : null } : {}) };
    const { error } = await supabase.from("tasks").update(full).eq("id", id);
    if (error) toast.error("Couldn't save"); refresh();
  }
  async function remove(t: Task) {
    if (!confirm(t.kind === "goal" ? `Delete goal "${t.title}" and its tasks?` : `Delete "${t.title}"?`)) return;
    if (t.kind === "goal") await supabase.from("tasks").delete().eq("goal_id", t.id);
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) toast.error("Couldn't delete"); refresh();
  }

  const all = q.data ?? [];
  const goals = all.filter((t) => t.kind === "goal");
  const loose = all.filter((t) => t.kind !== "goal" && !t.goal_id);
  const scheduled = loose.filter((t) => t.repeat || t.scheduled_for);
  const other = loose.filter((t) => !t.repeat && !t.scheduled_for);
  // The header counts the event goals listed right under it, so the number always matches what's shown.
  const openGoals = goals.filter((g) => !g.done);
  const open = openGoals.length;
  const overdue = openGoals.filter((g) => g.due_date && g.due_date < today()).length;

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-4">
      <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-1">
        <h2 className="text-sm font-medium">Event goals</h2>
        <span className="truncate text-[11px] text-muted-foreground" title={overdue ? `${open} open event${open === 1 ? "" : "s"}, ${overdue} past due` : `${open} open event${open === 1 ? "" : "s"}`}>
          {open ? `${open} open` : "None yet"}{overdue > 0 && <span className="text-destructive"> · {overdue} past due</span>}
        </span>
        <button onClick={() => setShowDone(!showDone)} aria-pressed={showDone} title={showDone ? "Hide completed" : "Show completed"}
          className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary">{showDone ? "Done" : "Show done"}</button>
        <button onClick={() => setAddingGoal(!addingGoal)} aria-label="Add event goal" title="Add event goal"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary"><Plus className="h-3.5 w-3.5" /></button>
      </div>

      {addingGoal && (
        <form className="mx-1 mb-1.5 flex items-center gap-2 rounded-xl border bg-background/40 px-2 py-1.5" onSubmit={(e) => { e.preventDefault(); add(newGoal, "goal", null); setNewGoal(""); setAddingGoal(false); }}>
          <Target className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input autoFocus value={newGoal} onChange={(e) => setNewGoal(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setNewGoal(""); setAddingGoal(false); } }}
            placeholder="New event goal…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <button type="submit" aria-label="Add goal" className="rounded-full p-1 hover:bg-secondary"><Plus className="h-3.5 w-3.5" /></button>
        </form>
      )}

      {goals.map((g) => {
        if (g.done && !showDone) return null;
        return <GoalCard key={g.id} g={g} kids={sortSteps(all.filter((t) => t.goal_id === g.id))} open={!collapsed[g.id]} showDone={showDone}
          onToggle={() => setCollapsed({ ...collapsed, [g.id]: !collapsed[g.id] })} onRemove={remove} onChanged={refresh} />;
      })}

      {scheduled.filter((t) => showDone || !t.done).length > 0 && (
        <div className="mx-1 mt-2">
          <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Scheduled tasks</div>
          {scheduled.filter((t) => showDone || !t.done).map((t) => <Row key={t.id} t={t} onUpdate={update} onRemove={remove} />)}
        </div>
      )}
      <div className="mx-1 mt-2">
        <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Other tasks</div>
        {other.filter((t) => showDone || !t.done).map((t) => <Row key={t.id} t={t} onUpdate={update} onRemove={remove} />)}
        <AddInline placeholder="Add a task…" onAdd={(v) => add(v, "task", null)} />
      </div>
      {all.length === 0 && !q.isLoading && <p className="px-3 py-2 text-xs text-muted-foreground">Nothing yet — try asking Civi "Set goals for our spring cleanup."</p>}
    </div>
  );
}

function Row({ t, onUpdate, onRemove, bold }: { t: Task; onUpdate: (id: string, p: Partial<Task>) => void; onRemove: (t: Task) => void; bold?: boolean }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient(); const navigate = useNavigate();
  const [title, setTitle] = useState(t.title);
  const [dateOpen, setDateOpen] = useState(false);
  const over = !t.done && t.due_date && t.due_date < today();
  const showTime = Boolean(t.scheduled_for && !t.done);
  const sameDay = Boolean(t.scheduled_for && t.due_date && new Date(t.scheduled_for).toLocaleDateString() === new Date(t.due_date + "T12:00:00").toLocaleDateString());
  const showDue = Boolean(t.due_date) && !(showTime && sameDay);
  const hasMeta = Boolean(t.last_error || showTime || t.repeat || showDue || dateOpen);
  function save() { setEditing(false); if (title.trim() && title.trim() !== t.title) onUpdate(t.id, { title: title.trim() }); else setTitle(t.title); }
  return (
    <div className="group flex min-w-0 flex-1 items-start gap-1.5 rounded-lg px-1 py-1 hover:bg-sidebar-accent">
      <button aria-label={t.done ? "Mark not done" : "Mark done"} onClick={() => onUpdate(t.id, { done: !t.done })}
        className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border transition-colors ${t.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 hover:border-primary"}`}>
        {t.done && <Check className="h-2.5 w-2.5" />}
      </button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setTitle(t.title); setEditing(false); } }}
            className="w-full rounded bg-background/60 px-1 text-sm outline-none ring-1 ring-ring" />
        ) : (
          <button onClick={() => setEditing(true)} title="Click to edit" className={`block w-full truncate text-left text-[13px] leading-snug ${bold ? "font-medium" : ""} ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.title}</button>
        )}
        {hasMeta && (
          <div className="flex min-w-0 flex-nowrap items-center gap-x-1.5 overflow-hidden whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
            {t.last_error && <span className="truncate text-destructive">{t.last_error}</span>}
            {showTime && t.scheduled_for && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-primary" title="Scheduled run time">
                <CalendarDays className="h-2.5 w-2.5" />
                {formatAppTime(t.scheduled_for)}
              </span>
            )}
            {t.repeat && (
              <span className="relative inline-flex shrink-0 items-center text-primary">
                <select aria-label="Repeat" value={t.repeat} onChange={(e) => onUpdate(t.id, { repeat: e.target.value === "off" ? null : e.target.value })}
                  className="cursor-pointer appearance-none rounded bg-transparent pl-0 pr-3 text-[10px] text-primary outline-none">
                  {["daily", "weekly", "biweekly", "monthly"].map((r) => <option key={r} value={r}>↻ {r}</option>)}
                  <option value="off">Stop repeating</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 h-2.5 w-2.5" />
              </span>
            )}
            
            {dateOpen ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                <input type="date" autoFocus defaultValue={t.due_date ?? ""} onBlur={() => setDateOpen(false)}
                  onChange={(e) => { onUpdate(t.id, { due_date: e.target.value || null }); setDateOpen(false); }}
                  className="rounded bg-background/60 px-1 text-[10px] outline-none" />
                {t.due_date && <button aria-label="Clear due date" title="Clear due date" onClick={() => { onUpdate(t.id, { due_date: null }); setDateOpen(false); }} className="text-muted-foreground hover:text-foreground">×</button>}
              </span>
            ) : showDue && t.due_date ? (
              <button onClick={() => setDateOpen(true)} className={`shrink-0 ${over ? "text-destructive" : ""}`}>{dueLabel(t.due_date)}</button>
            ) : null}
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-60">
        {(t.thread_id || t.repeat || t.scheduled_for) && (
          <button aria-label="Open this task's chat" title="Open this task's chat"
            onClick={async () => { try { const id = (t.repeat || t.scheduled_for) ? await openScheduledTaskChat(t) : t.thread_id!; qc.invalidateQueries({ queryKey: ["threads"] }); navigate({ to: "/chat/$threadId", params: { threadId: id } }); } catch { toast.error("Couldn't open the chat"); } }}
            className="grid place-items-center rounded-full p-0.5 text-primary hover:bg-background/60">
            <MessagesSquare className="h-3 w-3" />
          </button>
        )}
        {!t.due_date && (
          <button aria-label="Set due date" title="Due date" onClick={() => setDateOpen(true)} className="rounded-full p-0.5 hover:bg-background/60"><CalendarDays className="h-3 w-3" /></button>
        )}
        <button aria-label="Delete" title="Delete" onClick={() => onRemove(t)} className="rounded-full p-0.5 hover:bg-background/60"><Trash2 className="h-3 w-3" /></button>
      </div>
    </div>
  );
}

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
        <Plus className="h-3 w-3" />{placeholder.replace("…", "").replace("Add a ", "Add ")}
      </button>
    );
  }
  return (
    <form className="flex items-center gap-1.5 px-1 py-0.5" onSubmit={(e) => { e.preventDefault(); onAdd(v); setV(""); setOpen(false); }}>
      <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (!v.trim()) setOpen(false); }}
        onKeyDown={(e) => { if (e.key === "Escape") { setV(""); setOpen(false); } }}
        placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
    </form>
  );
}

function GoalCard({ g, kids, open, showDone, onToggle, onRemove, onChanged }: { g: Task; kids: Task[]; open: boolean; showDone: boolean; onToggle: () => void; onRemove: (t: Task) => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const [essentials, setEssentials] = useState(false);
  const prof = useQuery({
    queryKey: ["event-profiles", g.id],
    queryFn: async () => {
      const { data } = await supabase.from("event_profiles").select("cover_path, budget, headcount, venue").eq("goal_id", g.id).maybeSingle();
      return { ...data, cover: await signedCover(data?.cover_path) };
    },
    staleTime: 60_000,
  });
  const doneN = kids.filter((t) => t.done).length;
  const pct = kids.length ? Math.round((doneN / kids.length) * 100) : g.done ? 100 : 0;
  const name = g.title.replace(/^(Event|Launch):\s*/, "");
  const active = kids.filter((t) => !t.done && (t.step_state === "running" || t.step_state === "ready" || t.step_state === "awaiting_approval"));
  const next = active[0] ?? kids.find((t) => !t.done);
  const linkOf = (k: string) => kids.find((t) => t.step_key === k)?.result_url ?? null;
  const stepEvent = { title: name, date: g.due_date ?? null, location: prof.data?.venue ?? "", link: linkOf("eventbrite") ?? linkOf("rsvp") };
  const nextLabel = next ? (active.length > 1 ? `Working on ${active.length} steps · ${next.title}` : next.step_state === "awaiting_approval" ? `Waiting for your approval · ${next.title}` : `Next: ${next.title}`) : null;
  async function reset() {
    if (!confirm(`Reset progress for "${name}"? Every step goes back to not started.`)) return;
    try { await resetEventProgress(g.id); onChanged(); qc.invalidateQueries({ queryKey: ["event-page", g.id] }); toast.success("Progress reset"); } catch { toast.error("Couldn't reset progress"); }
  }
  return (
    <div className="mx-1 mb-2 overflow-hidden rounded-2xl border bg-card/60 shadow-sm">
      <Link to="/events/$goalId" params={{ goalId: g.id }} className="group block">
        <div className="relative h-16 w-full overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-secondary">
          {prof.data?.cover ? <img src={prof.data.cover} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
            : <CalendarHeart className="absolute right-3 top-3 h-6 w-6 text-primary/50" />}
        </div>
        <div className="px-3 pb-1 pt-2">
          <p className="truncate text-sm font-semibold group-hover:text-primary">{name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{nextLabel ?? (kids.length ? "All steps complete" : "Open to plan")}</p>
        </div>
      </Link>
      <div className="flex items-center gap-1.5 px-3 pb-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{doneN}/{kids.length}</span>
        <button aria-label={open ? "Hide steps" : "Show steps"} onClick={onToggle} className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Event options" className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary"><MoreHorizontal className="h-3.5 w-3.5" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={reset}><RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset progress</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRemove(g)} className="text-destructive"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete event goal</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && (
        <ol className="border-t px-2 py-1.5">
          {kids.filter((t) => showDone || !t.done).map((t) => {
            const ess = isEssentialsStep(t.title, t.step_key);
            const body = <StepStatus s={t} compact active={!t.step_key && t.id === next?.id} event={stepEvent} />;
            return <li key={t.id}>{ess
              ? <div role="button" tabIndex={0} onClick={() => setEssentials(true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEssentials(true); } }} className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-sidebar-accent">{body}</div>
              : <div className="flex items-start gap-2 px-1.5 py-1.5">{body}</div>}</li>;
          })}
        </ol>
      )}
      <EventEssentialsDialog goalId={g.id} open={essentials} onOpenChange={setEssentials} />
    </div>
  );
}
