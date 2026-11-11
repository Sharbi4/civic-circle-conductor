import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activitySchema, planSnapshot } from "./activities.shared";

export const saveActivity = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().optional(), activity: activitySchema }).parse(d))
  .handler(async ({ data, context }) => {
    const row = { ...data.activity, user_id: context.userId };
    const q = data.id ? context.supabase.from("activities").update(row).eq("id", data.id) : context.supabase.from("activities").insert(row);
    const { data: saved, error } = await q.select("id").single();
    if (error) throw new Error("Couldn't save the activity.");
    return saved;
  });

export const approveActivityPlan = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: a, error } = await context.supabase.from("activities").select("*").eq("id", data.id).single();
    if (error || !a) throw new Error("Activity not found.");
    if (!a.proposed_date || !a.location || !a.description) throw new Error("Add the date, location and description before approving the shared plan.");
    const { data: saved, error: saveError } = await context.supabase.from("activities").update({ approved_plan: planSnapshot(a), plan_approved_at: new Date().toISOString() }).eq("id", data.id).eq("updated_at", a.updated_at).select("id").maybeSingle();
    if (saveError || !saved) throw new Error("The plan changed. Review it before approving again.");
    return { ok: true };
  });

export const retainActivityLessons = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: a } = await context.supabase.from("activities").select("title, lessons, budget, attendance, follow_up").eq("id", data.id).single();
    if (!a) throw new Error("Activity not found.");
    const lessons = a.lessons as Record<string, string>;
    const facts = Object.entries(lessons).filter(([, v]) => v.trim()).map(([k, v]) => `${a.title} — ${k}: ${v}`);
    if (a.follow_up) facts.push(`${a.title} — follow-up: ${a.follow_up}`);
    if (!facts.length) throw new Error("Save your lessons first.");
    const { data: existing } = await context.supabase.from("memories").select("content").eq("source", "activity");
    const known = new Set(existing?.map((m) => m.content));
    const rows = facts.filter((content) => !known.has(content)).map((content) => ({ user_id: context.userId, content, source: "activity" }));
    if (rows.length) {
      const { error } = await context.supabase.from("memories").insert(rows);
      if (error) throw new Error("Couldn't retain the lessons.");
    }
    return { saved: rows.length };
  });