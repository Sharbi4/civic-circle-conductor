import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The organizer's Try again / Resume / Ask for another option on an event step: queues the step and runs it now. */
export const restartPlanStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: z.string().uuid(), mode: z.enum(["retry", "resume", "another"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: t } = await supabase.from("tasks").select("id, step_key, done, scheduled_for").eq("id", data.taskId).maybeSingle();
    if (!t || !t.step_key || t.done) throw new Error("This step can't be restarted.");
    if (!t.scheduled_for) {
      const now = new Date().toISOString();
      const { error } = await supabase.from("tasks").update({
        job_kind: "launch_step", scheduled_for: now, step_state: "running", step_note: null, last_error: null,
        run_prompt: JSON.stringify({ attempts: 0, nudge_at: null, after: null, retry: data.mode, queued_at: now }),
      }).eq("id", t.id).eq("user_id", userId).eq("done", false).is("scheduled_for", null);
      if (error) throw new Error("Couldn't restart this step. Try again in a moment.");
    }
    const { runOwnerDueWork } = await import("./jobs.server");
    await runOwnerDueWork(userId).catch((e) => console.error("Step restart run failed", e instanceof Error ? e.message : e));
    return { ok: true };
  });
