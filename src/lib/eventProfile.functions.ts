import { noLongDashes, withNoDashes } from "./punctuation.shared";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Fresh, event-specific ideas from what Civi knows about this event; saved on the event so they persist until refreshed. */
export const refreshEventSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ goalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: goal } = await db.from("tasks").select("id, title, thread_id").eq("id", data.goalId).eq("user_id", context.userId).eq("kind", "goal").maybeSingle();
    if (!goal) throw new Error("Event not found");
    const [{ data: org }, { data: profile }, { data: steps }, { data: msgs }] = await Promise.all([
      db.from("organizations").select("name, mission, address").eq("user_id", context.userId).maybeSingle(),
      db.from("event_profiles").select("*").eq("goal_id", goal.id).maybeSingle(),
      db.from("tasks").select("title, done").eq("goal_id", goal.id),
      goal.thread_id ? db.from("messages").select("role, content").eq("thread_id", goal.thread_id).order("created_at", { ascending: false }).limit(12) : Promise.resolve({ data: [] as { role: string; content: string }[] }),
    ]);
    const { generateResponse } = await import("@lovable.dev/ai-gateway");
    const res = await generateResponse({
      model: "openai/gpt-6.1-terra",
      instructions: withNoDashes('You suggest practical next ideas for a community event. Return only JSON {"items":[{"title":"short","detail":"one sentence"}]} with 5 specific, creative, doable ideas (venue, vendors, outreach, budget savings, attendee experience, follow-up). No emojis.'),
      input: `Org: ${JSON.stringify(org ?? {})}\nEvent: ${goal.title}\nProfile: ${JSON.stringify(profile ?? {})}\nSteps: ${JSON.stringify(steps ?? [])}\nRecent chat:\n${(msgs ?? []).map((m) => `${m.role}: ${m.content.slice(0, 800)}`).join("\n")}`,
    });
    let text = "";
    for (const item of res.output ?? []) if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text") text += noLongDashes(c.text);
    let items: { title: string; detail: string }[] = [];
    try { items = (JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).items ?? []).slice(0, 6).map((i: { title?: unknown; detail?: unknown }) => ({ title: String(i.title ?? "").slice(0, 120), detail: String(i.detail ?? "").slice(0, 400) })).filter((i: { title: string }) => i.title); } catch { items = []; }
    const { error } = await db.from("event_profiles").upsert({ goal_id: goal.id, user_id: context.userId, suggestions: items, suggestions_at: new Date().toISOString() }, { onConflict: "goal_id" });
    if (error) throw new Error("Could not save suggestions");
    return { items };
  });
