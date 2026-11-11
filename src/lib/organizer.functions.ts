import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendOrganizerMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: z.string().uuid(), content: z.string().min(1).max(8000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { runOrganizer } = await import("@/lib/organizer.server");
    return runOrganizer(context.supabase, context.userId, data);
  });
