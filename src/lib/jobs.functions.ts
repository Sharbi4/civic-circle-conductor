import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** While the app is open, keeps the signed-in organization's event plan and due tasks moving. */
export const runMyDueWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runOwnerDueWork } = await import("./jobs.server");
    return runOwnerDueWork(context.userId);
  });

/** Why the signed-in organization's background work is paused, if it is. */
export const getBackgroundStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("autopilot_state").select("paused_reason").eq("user_id", context.userId).maybeSingle();
    return { pausedReason: data?.paused_reason ?? null };
  });

/** The organization owner lifts their own background pause. */
export const resumeBackgroundWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("autopilot_state").update({ paused_reason: null }).eq("user_id", context.userId);
    if (error) throw new Error("Couldn't resume background work");
    return { ok: true };
  });
