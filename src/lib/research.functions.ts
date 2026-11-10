import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { researchOrganization } from "@/lib/research.server";

export const runOnboardingResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: org } = await supabase.from("organizations").select("name, mission, facebook_setup_location").eq("user_id", userId).maybeSingle();
    if (!org?.name) return { memories: 0, resources: 0 };
    const r = await researchOrganization(org.name, org.mission ?? "", org.facebook_setup_location ?? undefined);
    if (r.memories.length) await supabase.from("memories").insert(r.memories.map((content) => ({ user_id: userId, content: `🔎 ${content}` })));
    if (r.resources.length) {
      const allowed = new Set(["vendor", "venue", "nonprofit", "group", "event", "professional", "other"]);
      await supabase.from("resources").insert(r.resources.map((x) => ({
        user_id: userId, type: allowed.has(x.type) ? x.type : "other", name: String(x.name).slice(0, 160),
        details: String(x.details ?? "").slice(0, 400) || null, source: x.source?.startsWith("https://") ? x.source : null,
      })));
    }
    return { memories: r.memories.length, resources: r.resources.length };
  });
