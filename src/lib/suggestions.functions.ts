import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { generateSuggestions } = await import("@/lib/suggestions.server");
    try {
      return { items: await generateSuggestions(context.supabase, context.userId, data.threadId) };
    } catch (e) {
      console.error("suggestions failed", e);
      return { items: [] };
    }
  });

export const setAutonomy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ level: z.enum(["manual", "assisted", "auto"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("organizations").update({ autonomy: data.level }).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Writes a proactive, org-specific opening message into an empty platform agent chat. */
export const writeAgentWelcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    threadId: z.string().uuid(), agent: z.enum(["eventbrite", "x", "linkedin", "nextdoor"]),
    accountName: z.string().max(200), fallback: z.string().max(4000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase.from("messages").select("id", { count: "exact", head: true }).eq("thread_id", data.threadId);
    if (count) return { ok: true };
    const { buildAgentWelcome } = await import("@/lib/agentWelcome.server");
    const content = await buildAgentWelcome(context.supabase, context.userId, data.agent, data.accountName, data.fallback);
    const { count: again } = await context.supabase.from("messages").select("id", { count: "exact", head: true }).eq("thread_id", data.threadId);
    if (!again) await context.supabase.from("messages").insert({ thread_id: data.threadId, user_id: context.userId, role: "assistant", content });
    return { ok: true };
  });
