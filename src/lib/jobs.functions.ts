import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** While the app is open, keeps the signed-in organization's event plan and due tasks moving. */
export const runMyDueWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runOwnerDueWork } = await import("./jobs.server");
    return runOwnerDueWork(context.userId);
  });
