import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Check, ArrowLeft, ExternalLink, CalendarDays, Users, Target, ShieldCheck, MessageCircle, Save, Brain } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { activitySchema, type ActivityInput, automationScope } from "@/lib/activities.shared";
import { saveActivity, approveActivityPlan, retainActivityLessons } from "@/lib/activities.functions";

type Activity = Database["public"]["Tables"]["activities"]["Row"];
export function useActivities() {
  return useQuery({ queryKey: ["activities"], queryFn: async () => {
    const { data, error } = await supabase.from("activities").select("*").order("updated_at", { ascending: false });
    if (error) throw error; return data ?? [];
  }, refetchInterval: 15000 });
}

export function ActivitiesWorkspace() {
  const q = useActivities();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selectedActivity = q.data?.find((a) => a.id === selected);
  if (creating || selectedActivity) return <ActivityEditor key={selectedActivity?.id ?? "new"} activity={selectedActivity} onBack={() => { setCreating(false); setSelected(null); }} onSaved={(id) => { setCreating(false); setSelected(id); }} />;
  return <div className="h-full overflow-y-auto px-5 pb-12 pt-16 md:px-10 md:pt-8">
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted-foreground">Organizing workspace</p><h1 className="font-display text-3xl">Activities</h1></div><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New activity</Button></div>
      <AutomationState />
      {q.isError && <p role="alert" className="mt-5 text-destructive">Couldn't load activities. <Button variant="link" onClick={() => q.refetch()}>Try again</Button></p>}
      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        {q.data?.map((a) => <Button key={a.id} variant="outline" onClick={() => setSelected(a.id)} className="h-auto min-w-0 flex-col items-stretch rounded-lg bg-card p-5 text-left whitespace-normal">
          <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold break-words">{a.title}</h2><span className="shrink-0 text-xs text-muted-foreground capitalize">{a.status}</span></div>
          <p className="mt-2 text-sm text-muted-foreground break-words">{a.goal || "Goal not set"}</p>
          <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {a.proposed_date || "Date to decide"}</span><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {a.audience || "Audience to decide"}</span></div>
          <div className="mt-3 border-t pt-3 text-xs text-primary">{a.plan_approved_at ? "Shared plan approved" : "Plan in draft"} · {a.location || "Location to decide"}</div>
        </Button>)}
      </div>
      {!q.isLoading && !q.isError && q.data?.length === 0 && <div className="py-16 text-center"><Target className="mx-auto mb-4 h-8 w-8 text-primary" /><h2 className="font-display text-xl">Your next community activity</h2><p className="mt-2 text-sm text-muted-foreground">No activities yet.</p><Button className="mt-5" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create activity</Button></div>}
      <ReceiptList />
    </div>
  </div>;
}

export function AutomationState() {
  const q = useQuery({ queryKey: ["automation-state"], queryFn: async () => {
    const [o, s] = await Promise.all([supabase.from("organizations").select("autonomy, automation_paused, usage_pause_reason").maybeSingle(), supabase.from("autopilot_state").select("paused_reason, last_review_at").maybeSingle()]);
    return { level: o.data?.autonomy ?? "manual", reason: o.data?.automation_paused ? "Paid work paused by organization" : o.data?.usage_pause_reason ?? s.data?.paused_reason, last: s.data?.last_review_at };
  }, refetchInterval: 15000 });
  return <section className="border-y py-4"><div className="flex flex-wrap items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-primary" />{q.data?.reason ? "Background planning automation paused" : q.data?.level === "auto" ? "Research & preparation enabled" : q.data?.level === "assisted" ? "Suggested work waits for approval" : "Proactive reviews off"}</div><p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">{automationScope(q.data?.level ?? "manual", q.data?.reason)}</p>{q.data?.last && <p className="mt-1 text-xs text-muted-foreground">Last review: {new Date(q.data.last).toLocaleString()}</p>}</section>;
}

const LESSONS = ["Partners who responded", "Arrangements that worked", "Participant requests", "Actual cost", "Staff changes", "Try next"];
function ActivityEditor({ activity, onBack, onSaved }: { activity: Activity | undefined; onBack: () => void; onSaved: (id: string) => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveActivity), approve = useServerFn(approveActivityPlan), retain = useServerFn(retainActivityLessons);
  const [form, setForm] = useState<ActivityInput>(() => activitySchema.parse(activity ?? { title: "Untitled activity" }));
  const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(!activity);
  const tasks = useQuery({ queryKey: ["activity-tasks", activity?.id], enabled: !!activity, queryFn: async () => {
    if (!activity) return []; const { data, error } = await supabase.from("tasks").select("*").eq("activity_id", activity.id).order("created_at"); if (error) throw error; return data ?? [];
  }, refetchInterval: 15000 });
  const approvals = useQuery({ queryKey: ["activity-approvals", activity?.id], enabled: !!activity, queryFn: async () => {
    if (!activity) return []; const { data, error } = await supabase.from("approvals").select("*").eq("activity_id", activity.id).order("created_at", { ascending: false }); if (error) throw error; return data ?? [];
  }, refetchInterval: 10000 });
  const threads = useQuery({ queryKey: ["threads"], queryFn: async () => { const { data } = await supabase.from("threads").select("*").order("kind"); return data ?? []; } });
  const [newTask, setNewTask] = useState(""), [person, setPerson] = useState("");
  function change<K extends keyof ActivityInput>(key: K, value: ActivityInput[K]) { setForm((f) => ({ ...f, [key]: value })); setDirty(true); }
  async function persist() {
    setBusy(true); try { const r = await save({ data: { id: activity?.id, activity: form } }); await qc.invalidateQueries({ queryKey: ["activities"] }); setDirty(false); onSaved(r.id); toast.success("Activity saved"); } catch(e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); } finally { setBusy(false); }
  }
  async function doApprove() {
    if (!activity) return; setBusy(true); try { await approve({ data: { id: activity.id } }); await qc.invalidateQueries({ queryKey: ["activities"] }); toast.success("Shared plan approved — public actions still need their own approval"); } catch(e) { toast.error(e instanceof Error ? e.message : "Couldn't approve"); } finally { setBusy(false); }
  }
  async function addTask() {
    if (!activity || !newTask.trim()) return;
    const { data: u } = await supabase.auth.getUser(); if (!u.user) return;
    const { error } = await supabase.from("tasks").insert({ user_id: u.user.id, activity_id: activity.id, title: newTask.trim(), assignee: person });
    if (error) { toast.error("Couldn't add task"); return; } setNewTask(""); setPerson(""); qc.invalidateQueries({ queryKey: ["activity-tasks", activity.id] }); qc.invalidateQueries({ queryKey: ["tasks"] });
  }
  const field = (label: string, key: "title" | "goal" | "audience" | "community_input" | "proposed_date" | "location" | "description" | "constraints" | "registration_url" | "follow_up", multiline = false) => <label className="block min-w-0 space-y-2 text-sm"><span className="text-muted-foreground">{label}</span>{multiline ? <Textarea aria-label={label} value={form[key]} onChange={(e) => change(key, e.target.value)} rows={3} /> : <Input aria-label={label} value={form[key]} onChange={(e) => change(key, e.target.value)} />}</label>;
  return <div className="h-full overflow-y-auto px-5 pb-12 pt-16 md:px-10 md:pt-8"><div className="mx-auto max-w-5xl">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Activities</Button><Button disabled={busy || !dirty} onClick={persist}><Save className="h-4 w-4" />{busy ? "Saving…" : "Save activity"}</Button></div>
    <h1 className="font-display text-2xl break-words">{activity?.title ?? "New activity"}</h1>
    <div className="mt-3 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm text-muted-foreground">Activity status<select aria-label="Activity status" className="rounded-md border bg-background px-2 py-1 text-foreground" value={form.status} onChange={(e) => change("status", e.target.value as ActivityInput["status"])}>{["planning", "ready", "active", "completed", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}</select></label><span className="text-xs text-primary">{activity?.plan_approved_at && !dirty ? "Shared plan approved" : "Shared plan in draft"}</span></div>
    <section className="mt-6 border-t py-6"><h2 className="mb-4 text-lg font-semibold">Shared activity plan</h2><div className="grid gap-5 sm:grid-cols-2">{field("Activity name", "title")}{field("Goal", "goal")}{field("Intended audience", "audience")}{field("Community input supporting this activity", "community_input", true)}{field("Proposed date and time", "proposed_date")}{field("Location", "location")}{field("Shared description", "description", true)}<div className="space-y-5"><label className="block space-y-2 text-sm text-muted-foreground">Budget (USD)<Input aria-label="Budget (USD)" type="number" min="0" value={form.budget} onChange={(e) => change("budget", Number(e.target.value))} /></label>{field("Constraints", "constraints", true)}</div></div><div className="mt-5 flex flex-wrap items-center gap-3"><Button variant="outline" disabled={!activity || dirty || busy} onClick={doApprove}><ShieldCheck className="h-4 w-4" /> Approve shared plan</Button><span className="text-xs text-muted-foreground">Plan approval does not publish or authorize external actions.</span></div></section>
    {activity && <>
      <section className="border-t py-6"><h2 className="mb-4 text-lg font-semibold">Cross-channel coordination</h2><div className="space-y-3">{threads.data?.map((t) => <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-sm"><Link to="/chat/$threadId" params={{ threadId: t.id }} className="flex min-w-0 items-center gap-2 text-primary"><MessageCircle className="h-4 w-4 shrink-0" /><span className="break-words">{t.title}</span></Link><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" aria-label={`Coordinate ${t.title}`} checked={t.activity_id === activity.id} onChange={async (e) => { const { error } = await supabase.from("threads").update({ activity_id: e.target.checked ? activity.id : null }).eq("id", t.id); if (error) toast.error("Couldn't connect chat"); else qc.invalidateQueries({ queryKey: ["threads"] }); }} /> {t.activity_id === activity.id ? "Uses this shared plan" : "Link to activity"}</label></div>)}</div></section>
      <section className="border-t py-6"><h2 className="mb-4 text-lg font-semibold">Tasks & responsible people</h2><div className="space-y-3">{tasks.data?.map((t) => <div key={t.id} className="flex flex-wrap items-center gap-3"><Button size="icon" variant="outline" aria-label={t.done ? `Reopen ${t.title}` : `Complete ${t.title}`} onClick={async () => { const { error } = await supabase.from("tasks").update({ done: !t.done, done_at: !t.done ? new Date().toISOString() : null }).eq("id", t.id); if (error) toast.error("Couldn't update task"); else { qc.invalidateQueries({ queryKey: ["activity-tasks", activity.id] }); qc.invalidateQueries({ queryKey: ["tasks"] }); } }}>{t.done && <Check className="h-4 w-4" />}</Button><span className={`min-w-0 flex-1 break-words text-sm ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.title}</span><Input className="w-36" aria-label={`Responsible person for ${t.title}`} defaultValue={t.assignee} placeholder="Unassigned" onBlur={async (e) => { const { error } = await supabase.from("tasks").update({ assignee: e.target.value }).eq("id", t.id); if (error) toast.error("Couldn't save person"); else qc.invalidateQueries({ queryKey: ["activity-tasks", activity.id] }); }} /></div>)}</div><form onSubmit={(e) => { e.preventDefault(); addTask(); }} className="mt-4 flex flex-wrap gap-2"><Input className="min-w-40 flex-1" aria-label="New activity task" placeholder="Task" value={newTask} onChange={(e) => setNewTask(e.target.value)} /><Input className="w-40" aria-label="Responsible person" placeholder="Responsible person" value={person} onChange={(e) => setPerson(e.target.value)} /><Button type="submit" disabled={!newTask.trim()}><Plus className="h-4 w-4" /> Add task</Button></form></section>
      <section className="border-t py-6"><h2 className="mb-3 text-lg font-semibold">Pending approvals</h2>{approvals.data?.filter((a) => a.status === "pending").map((a) => <div key={a.id} className="mb-3 border-l-2 border-primary pl-3"><p className="text-sm font-medium">{a.title}</p><p className="text-xs text-muted-foreground">Draft ready for approval · Review in Approvals</p></div>)}{!approvals.data?.some((a) => a.status === "pending") && <p className="text-sm text-muted-foreground">No pending approvals for this activity.</p>}</section>
    </>}
    <section className="border-t py-6"><h2 className="mb-4 text-lg font-semibold">Registration, attendance & follow-up</h2><div className="grid gap-5 sm:grid-cols-2">{field("Registration link", "registration_url")}<label className="block space-y-2 text-sm text-muted-foreground">Attendance<Input aria-label="Attendance" type="number" min="0" value={form.attendance} onChange={(e) => change("attendance", Number(e.target.value))} /></label>{field("Follow-up", "follow_up", true)}</div>{form.registration_url && /^https?:\/\//.test(form.registration_url) && <a href={form.registration_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-primary">Open registration <ExternalLink className="h-4 w-4" /></a>}</section>
    <section className="border-t py-6"><h2 className="mb-4 text-lg font-semibold">What we learned</h2><div className="grid gap-5 sm:grid-cols-2">{LESSONS.map((label) => <label key={label} className="block space-y-2 text-sm text-muted-foreground">{label}<Textarea aria-label={label} value={form.lessons[label] ?? ""} onChange={(e) => change("lessons", { ...form.lessons, [label]: e.target.value })} rows={2} /></label>)}</div><Button className="mt-5" variant="outline" disabled={!activity || dirty || busy} onClick={async () => { if (!activity) return; try { const r = await retain({ data: { id: activity.id } }); qc.invalidateQueries({ queryKey: ["memories"] }); toast.success(`${r.saved} lessons retained in organization memory`); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't retain lessons"); } }}><Brain className="h-4 w-4" /> Retain lessons for next activity</Button></section>
    {activity && <ReceiptList activityId={activity.id} />}
  </div></div>;
}

export function ReceiptList({ activityId }: { activityId?: string }) {
  const q = useQuery({ queryKey: ["receipts", activityId], queryFn: async () => {
    let query = supabase.from("action_receipts").select("*").order("completed_at", { ascending: false }).limit(50);
    if (activityId) query = query.eq("activity_id", activityId);
    const { data, error } = await query; if (error) throw error; return data ?? [];
  }, refetchInterval: 10000 });
  return <section className="mt-5 border-t py-6"><h2 className="mb-4 text-lg font-semibold">Completed work · receipts</h2>{q.isError && <p className="text-sm text-destructive">Couldn't load receipts.</p>}{!q.isLoading && !q.isError && !q.data?.length && <p className="text-sm text-muted-foreground">No completed actions recorded yet.</p>}<div className="space-y-4">{q.data?.map((r) => <article key={r.id} className="rounded-lg border bg-card p-4"><div className="flex items-start gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-primary" /><h3 className="font-medium break-words">{r.action}</h3></div><p className="mt-2 text-sm text-muted-foreground">{r.platform} · {r.account_name}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(r.completed_at).toLocaleString()}</p>{r.details && <p className="mt-2 text-sm text-muted-foreground">{r.details}</p>}<p className="mt-2 text-xs text-primary">{r.approval_required ? `Approval required · received${r.approved_at ? ` ${new Date(r.approved_at).toLocaleString()}` : ""}` : "No approval required"}</p>{r.object_url && /^https?:\/\//.test(r.object_url) ? <a href={r.object_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm text-primary">View result on {r.platform}<ExternalLink className="h-4 w-4" /></a> : <p className="mt-2 text-xs text-muted-foreground">Platform did not return a result link.</p>}</article>)}</div></section>;
}
