import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const usageLimitsSchema = z.object({
  automation_paused: z.boolean(), daily_ai_limit: z.number().int().min(0).max(10000),
  daily_browser_minutes: z.number().int().min(0).max(1440), daily_browser_sessions: z.number().int().min(0).max(100),
  browser_session_minutes: z.number().int().min(1).max(60),
});
export const saveUsageLimits = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => usageLimitsSchema.parse(d)).handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("organizations").update(data).eq("user_id", context.userId);
    if (error) throw new Error("Couldn't save usage controls."); return { ok: true };
  });
export const resumePaidWork = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("organizations").update({ usage_pause_reason: null, automation_paused: false }).eq("user_id", context.userId);
    if (error) throw new Error("Couldn't resume paid work.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await db.from("autopilot_state").update({ paused_reason: null }).eq("user_id", context.userId);
    return { ok: true };
  });