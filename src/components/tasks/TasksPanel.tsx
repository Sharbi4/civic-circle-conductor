import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, ChevronDown, ChevronRight, MessagesSquare, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Task = { id: string; goal_id: string | null; kind: string; title: string; due_date: string | null; done: boolean; created_by: string; created_at: string; repeat?: string | null; scheduled_for?: string | null; last_error?: string | null; thread_id?: string | null };

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
  const open = all.filter((t) => t.kind !== "goal" && !t.done).length;
  const overdue = all.filter((t) => !t.done && t.due_date && t.due_date < today()).length;

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-4">
      <h2 className="px-3 pb-1 font-medium">Goals & tasks</h2>
      <p className="px-3 pb-3 text-xs text-muted-foreground">Civi works from this list. Add your own, or ask Civi to plan goals for you.</p>
      <div className="mx-1 mb-3 flex gap-2 text-xs">
        <span className="rounded-full bg-secondary px-2.5 py-1">{open} open</span>
        {overdue > 0 && <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-destructive">{overdue} overdue</span>}
        <button onClick={() => setShowDone(!showDone)} className="ml-auto rounded-full px-2.5 py-1 text-muted-foreground hover:bg-secondary">{showDone ? "Hide done" : "Show done"}</button>
      </div>

      <form className="mx-1 mb-3 flex items-center gap-2 rounded-2xl border bg-background/40 px-3 py-2" onSubmit={(e) => { e.preventDefault(); add(newGoal, "goal", null); setNewGoal(""); }}>
        <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder="Add a goal…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        {newGoal && <button type="submit" aria-label="Add goal" className="rounded-full p-1 hover:bg-secondary"><Plus className="h-4 w-4" /></button>}
      </form>

      {goals.map((g) => {
        const kids = all.filter((t) => t.goal_id === g.id);
        const doneN = kids.filter((t) => t.done).length;
        const pct = kids.length ? Math.round((doneN / kids.length) * 100) : g.done ? 100 : 0;
        const isOpen = !collapsed[g.id];
        if (g.done && !showDone) return null;
        return (
          <div key={g.id} className="mx-1 mb-2 rounded-2xl border bg-background/30 p-2">
            <div className="flex items-center gap-1">
              <button aria-label={isOpen ? "Collapse" : "Expand"} onClick={() => setCollapsed({ ...collapsed, [g.id]: isOpen })} className="rounded-full p-1 text-muted-foreground hover:bg-secondary">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <Row t={g} onUpdate={update} onRemove={remove} bold />
            </div>
            <div className="mx-2 mt-1 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
            <div className="px-2 pt-1 text-[11px] text-muted-foreground">{doneN}/{kids.length} done</div>
            {isOpen && (
              <div className="mt-1 space-y-0.5 pl-5">
                {kids.filter((t) => showDone || !t.done).map((t) => <Row key={t.id} t={t} onUpdate={update} onRemove={remove} />)}
                <AddInline placeholder="Add a task…" onAdd={(v) => add(v, "task", g.id)} />
              </div>
            )}
          </div>
        );
      })}

      <div className="mx-1 mt-3">
        <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other tasks</div>
        {loose.filter((t) => showDone || !t.done).map((t) => <Row key={t.id} t={t} onUpdate={update} onRemove={remove} />)}
        <AddInline placeholder="Add a task…" onAdd={(v) => add(v, "task", null)} />
      </div>
      {all.length === 0 && !q.isLoading && <p className="px-3 py-3 text-sm text-muted-foreground">Nothing yet — try asking Civi "Set goals for our spring cleanup."</p>}
    </div>
  );
}

function Row({ t, onUpdate, onRemove, bold }: { t: Task; onUpdate: (id: string, p: Partial<Task>) => void; onRemove: (t: Task) => void; bold?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [dateOpen, setDateOpen] = useState(false);
  const over = !t.done && t.due_date && t.due_date < today();
  function save() { setEditing(false); if (title.trim() && title.trim() !== t.title) onUpdate(t.id, { title: title.trim() }); else setTitle(t.title); }
  return (
    <div className="group flex min-w-0 flex-1 items-start gap-2 rounded-xl px-1.5 py-1.5 hover:bg-sidebar-accent">
      <button aria-label={t.done ? "Mark not done" : "Mark done"} onClick={() => onUpdate(t.id, { done: !t.done })}
        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors ${t.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 hover:border-primary"}`}>
        {t.done && <Check className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setTitle(t.title); setEditing(false); } }}
            className="w-full rounded bg-background/60 px-1 text-sm outline-none ring-1 ring-ring" />
        ) : (
          <button onClick={() => setEditing(true)} title="Click to edit" className={`block w-full text-left text-sm leading-snug ${bold ? "font-medium" : ""} ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.title}</button>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {t.last_error && <span className="text-destructive">{t.last_error}</span>}
          {t.repeat && (
            <select aria-label="Repeat" value={t.repeat} onChange={(e) => onUpdate(t.id, { repeat: e.target.value === "off" ? null : e.target.value })}
              className="inline-flex rounded bg-transparent text-[11px] text-primary outline-none">
              {["daily", "weekly", "biweekly", "monthly"].map((r) => <option key={r} value={r}>↻ {r}</option>)}
              <option value="off">Stop repeating</option>
            </select>
          )}
          {(t.created_by === "agent" || t.created_by === "civi") && <span className="inline-flex items-center gap-0.5"><Sparkles className="h-3 w-3" />Civi</span>}
          {dateOpen ? (
            <input type="date" autoFocus defaultValue={t.due_date ?? ""} onBlur={() => setDateOpen(false)}
              onChange={(e) => { onUpdate(t.id, { due_date: e.target.value || null }); setDateOpen(false); }}
              className="rounded bg-background/60 px-1 text-[11px] outline-none" />
          ) : t.due_date ? (
            <button onClick={() => setDateOpen(true)} className={over ? "text-destructive" : ""}>{dueLabel(t.due_date)}</button>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-60">
        {t.thread_id && (
          <Link to="/chat/$threadId" params={{ threadId: t.thread_id }} aria-label="View progress in chat" title="View progress in chat"
            className="grid place-items-center rounded-full p-1 text-primary hover:bg-background/60">
            <MessagesSquare className="h-3.5 w-3.5" />
          </Link>
        )}
        <button aria-label="Set due date" title="Due date" onClick={() => setDateOpen(true)} className="rounded-full p-1 hover:bg-background/60"><CalendarDays className="h-3.5 w-3.5" /></button>
        {t.due_date && <button aria-label="Clear due date" title="Clear date" onClick={() => onUpdate(t.id, { due_date: null })} className="rounded-full p-1 text-xs hover:bg-background/60">×</button>}
        <button aria-label="Delete" title="Delete" onClick={() => onRemove(t)} className="rounded-full p-1 hover:bg-background/60"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="flex items-center gap-2 px-1.5 py-1" onSubmit={(e) => { e.preventDefault(); onAdd(v); setV(""); }}>
      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
    </form>
  );
}
