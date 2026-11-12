import { noLongDashes, withNoDashes } from "./punctuation.shared";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { eventLinkSchema, questionSchema } from "@/lib/polls.shared";

/** Public: the safe fields of an open poll, for the shareable /p/:id page. */
export const getPublicPoll = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("polls").select("id, user_id, title, kind, description, questions, status, event").eq("id", data.id).maybeSingle();
    if (!p) return null;
    const { data: org } = await supabaseAdmin.from("organizations").select("name, logo_url").eq("user_id", p.user_id).maybeSingle();
    return {
      id: p.id, title: p.title, kind: p.kind, description: p.description, status: p.status,
      questions: z.array(questionSchema).catch([]).parse(p.questions),
      event: eventLinkSchema.nullable().catch(null).parse(p.event ?? null),
      orgName: org?.name ?? null, logoUrl: org?.logo_url ?? null,
    };
  });

/** Public: records one response after checking it against the poll's questions. */
export const submitPollResponse = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), answers: z.record(z.string().max(40), z.unknown()) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("polls").select("questions, status").eq("id", data.id).maybeSingle();
    if (!p || p.status !== "open") throw new Error("This poll is closed.");
    const qs = z.array(questionSchema).catch([]).parse(p.questions);
    const clean: Record<string, unknown> = {};
    for (const q of qs) {
      const a = data.answers[q.id];
      let v: unknown;
      if (q.type === "choice") v = typeof a === "string" && q.options?.includes(a) ? a : undefined;
      else if (q.type === "multi") v = Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && !!q.options?.includes(x)) : undefined;
      else if (q.type === "rating") v = typeof a === "number" && a >= 1 && a <= 5 ? Math.round(a) : undefined;
      else if (q.type === "text") v = typeof a === "string" && a.trim() ? a.trim().slice(0, 2000) : undefined;
      else {
        const c = z.object({ name: z.string().max(120).optional(), email: z.string().max(255).optional(), phone: z.string().max(40).optional() }).catch({}).parse(a);
        if (c.email && !z.string().email().safeParse(c.email).success) throw new Error("Please enter a valid email.");
        v = c.name || c.email || c.phone ? c : undefined;
      }
      if ((v === undefined || (Array.isArray(v) && !v.length)) && q.required) throw new Error(`Please answer: ${q.q}`);
      if (v !== undefined) clean[q.id] = v;
    }
    if (!Object.keys(clean).length) throw new Error("Please answer at least one question.");
    const { error } = await supabaseAdmin.from("poll_responses").insert({ poll_id: data.id, answers: clean as never });
    if (error) throw new Error("Couldn't save your response. Please try again.");
    return { ok: true };
  });

/** Civi's short write-up of a poll's results. */
export const summarizePoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pollId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase.from("polls").select("title, questions").eq("id", data.pollId).maybeSingle();
    if (!p) throw new Error("Poll not found");
    const { data: rs } = await context.supabase.from("poll_responses").select("answers, created_at").eq("poll_id", data.pollId).order("created_at").limit(500);
    if (!rs?.length) return { summary: "No responses yet, share the link to start collecting answers." };
    const { generateResponse } = await import("@lovable.dev/ai-gateway");
    const res = await generateResponse({
      model: "openai/gpt-6.1-terra",
      instructions: withNoDashes("You are Civi, a community organizer. Summarize poll/feedback results for the organization in under 150 words: the headline result, 2-3 themes from comments, and 2 concrete next steps. Plain language, short bullets. Never include people's contact details."),
      input: [{ role: "user", content: JSON.stringify({ title: p.title, questions: p.questions, responses: rs.map((r) => r.answers) }).slice(0, 60000) }],
    });
    let text = "";
    for (const item of res.output ?? []) if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text") text += noLongDashes(c.text);
    return { summary: text.trim() || "Couldn't summarize right now." };
  });
