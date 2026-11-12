import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatIsIdle, parseResumeState, resumeDelayMinutes } from "./resume.shared";
type Db = SupabaseClient<Database>;
type Task = Database["public"]["Tables"]["tasks"]["Row"];

/** Marks the first open step of each event goal for resumption when its chat has gone quiet. */
export async function queueStalledEventSteps(db: Db) {
  const { data: open } = await db.from("tasks").select("id, user_id, goal_id, thread_id, job_kind, scheduled_for, last_run_at, created_at")
    .eq("kind", "task").eq("done", false).is("step_key", null).not("goal_id", "is", null).not("thread_id", "is", null)
    .order("created_at").limit(500);
  const firstPerGoal = new Map<string, NonNullable<typeof open>[number]>();
  for (const t of open ?? []) if (!firstPerGoal.has(t.goal_id!)) firstPerGoal.set(t.goal_id!, t);
  for (const t of firstPerGoal.values()) {
    const pausedForReply = t.job_kind === "launch_step" && !t.scheduled_for;
    if (t.job_kind && !pausedForReply) continue; // already scheduled (launch step, reminder, etc.)
    const { data: last } = await db.from("messages").select("created_at").eq("thread_id", t.thread_id!).eq("user_id", t.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    // A paused step only restarts after the organizer has replied and the chat has settled.
    if (pausedForReply) {
      const { data: reply } = await db.from("messages").select("id").eq("thread_id", t.thread_id!).eq("user_id", t.user_id).eq("role", "user").gt("created_at", t.last_run_at ?? t.created_at).limit(1).maybeSingle();
      if (!reply) continue;
    }
    if (!chatIsIdle(last?.created_at)) continue;
    const q = db.from("tasks").update({ job_kind: "launch_step", scheduled_for: new Date().toISOString(), run_prompt: JSON.stringify({ attempts: 0 }), last_error: null }).eq("id", t.id).eq("user_id", t.user_id);
    await (pausedForReply ? q.is("scheduled_for", null) : q.is("job_kind", null));
  }
}

/** Picks a stalled step back up in its chat. Returns the next run time, or 'infinity' when the step is finished. */
export async function runResumeStep(db: Db, userId: string, task: Task, threadId: string): Promise<string> {
  const state = parseResumeState(task.run_prompt);
  const { data: goal } = task.goal_id ? await db.from("tasks").select("title").eq("id", task.goal_id).eq("user_id", userId).maybeSingle() : { data: null };
  const { runOrganizer } = await import("./organizer.server");
  await runOrganizer(db, userId, {
    hidden: true,
    threadId,
    content: `[Resume, picked up automatically] Event: ${goal?.title ?? "this event"}. Step: "${task.title}" (task id ${task.id}).\nContinue exactly where this chat left off; do not restart research already done. Start with one line: "Picking up where I left off: ${task.title}". Then take the next concrete action now (browse, fill an application, draft, or queue an approval). If you are waiting on an answer from the organizer, do not repeat earlier messages, send a one-line reminder of the single thing you need. When this step is complete, emit [[task_done: ${task.id}]].`,
  });
  const { data: after } = await db.from("tasks").select("done").eq("id", task.id).eq("user_id", userId).maybeSingle();
  if (after?.done) return "infinity";
  const attempts = state.attempts + 1;
  const delay = resumeDelayMinutes(attempts);
  if (delay === null) return "pause";
  await db.from("tasks").update({ run_prompt: JSON.stringify({ ...state, attempts }) }).eq("id", task.id).eq("user_id", userId);
  return new Date(Date.now() + delay * 60000).toISOString();
}
