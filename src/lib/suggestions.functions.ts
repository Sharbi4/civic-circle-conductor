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
