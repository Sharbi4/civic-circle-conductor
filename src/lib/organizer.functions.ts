import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";

const MODEL = "openai/gpt-6.1-terra";

export const sendOrganizerMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: z.string().uuid(), content: z.string().min(1).max(8000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: thread, error: tErr } = await supabase
      .from("threads").select("id, title, kind").eq("id", data.threadId).maybeSingle();
    if (tErr || !thread) throw new Error("Chat not found");

    const { error: insErr } = await supabase.from("messages").insert({
      thread_id: data.threadId, user_id: userId, role: "user", content: data.content,
    });
    if (insErr) throw new Error(insErr.message);

    const [{ data: org }, { data: history }, { data: memories }] = await Promise.all([
      supabase.from("organizations").select("name, mission").eq("user_id", userId).maybeSingle(),
      supabase.from("messages").select("role, content").eq("thread_id", data.threadId).order("created_at").limit(60),
      supabase.from("memories").select("content").order("created_at", { ascending: false }).limit(40),
    ]);

    const instructions = [
      `You are Civi Meet's main AI organizer for "${org?.name ?? "the organization"}", a nonprofit or political organization.`,
      `Mission: ${org?.mission ?? "not provided"}. Understand the organization's goals, audience and communication style, and stay mission-driven.`,
      `Personality: natural and conversational — talk like a real community organizer, not a robotic chatbot. Warm, friendly and approachable. Proactive: spot opportunities and suggest helpful actions without waiting to be asked. Resourceful and creative. Context-aware: draw on past conversations, relationships and activities. Authentic and transparent: communicate naturally while being clear you are an AI.`,
      `Core philosophy — Contribute, Connect, Convene: become a consistently helpful presence in the community; build relationships and bring people together around shared interests; turn online connections into meaningful real-world activities. The goal is not just to communicate but to help get people together in real life.`,
      `Capabilities: community engagement and building, engagement strategy, community intelligence (recurring interests, needs, opportunities), agentic browser research and authorized web tasks, event planning (gatherings, meetings, fundraisers), vendor & venue discovery (food trucks, venues, partners), outreach coordination, booking assistance (quotes, bookings, payment links — always with organizational approval), persistent memory, community activation, and impact tracking (registrations, attendance, engagement, repeat participation).`,
      `You coordinate channel sub-agents (Facebook, Instagram, Instagram DMs, Eventbrite, X, Nextdoor, Gmail, TikTok). Those connections are not live yet; when a task needs one, draft the exact content and say which agent would run it once connected. Never take outreach, booking or payment actions without the organization's explicit approval.`,
      `Approvals: when you propose any outreach, booking or payment action, describe it in the message, tell the user it is queued in the Approvals inbox for their review, and add a final line exactly like: [[approval: <outreach|booking|payment> | <short title> | <one line of details>]]. One line per proposed action. Never claim an action is done until the user has approved it.`,
      `Be concise, decisive and practical. Use markdown with short headings and bullets.`,
      `When you learn a durable fact about the organization (audiences, goals, dates, voice, contacts), add a final line exactly like: [[remember: <fact>]]. Only for new facts.`,
      memories?.length ? `Organization memory:\n- ${memories.map((m) => m.content).join("\n- ")}` : "",
      thread.kind === "side" ? `This is a side chat titled "${thread.title}".` : "This is the main organizer chat.",
    ].filter(Boolean).join("\n\n");

    let text = "";
    try {
      const res = await generateResponse({
        model: MODEL,
        instructions,
        input: (history ?? []).map((m) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        })),
      });
      for (const item of res.output ?? []) {
        if (item.type === "message") {
          for (const c of item.content ?? []) if (c.type === "output_text") text += c.text;
        }
      }
    } catch (e) {
      if (e instanceof GatewayError) {
        console.error("AI error", e.code, e.httpStatus);
        if (e.httpStatus === 402) throw new Error("AI credits are used up. Add credits to keep chatting.");
        if (e.httpStatus === 429) throw new Error("The organizer is busy. Try again in a moment.");
      }
      throw new Error("The organizer couldn't reply. Please try again.");
    }

    const facts = [...text.matchAll(/\[\[remember:\s*(.+?)\]\]/g)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
    const approvalRows = [...text.matchAll(/\[\[approval:\s*(.+?)\]\]/g)]
      .map((m) => (m[1] ?? "").split("|").map((s) => s.trim()))
      .filter((p) => p[0] && p[1])
      .map(([type, title, details]) => ({
        user_id: userId,
        action_type: ["outreach", "booking", "payment"].includes(type ?? "") ? type! : "other",
        title: title!,
        details: details ?? "",
      }));
    const clean = text.replace(/\n?\[\[(?:remember|approval):.+?\]\]/g, "").trim() || "…";
    if (facts.length) {
      await supabase.from("memories").insert(facts.map((content) => ({ user_id: userId, content })));
    }
    if (approvalRows.length) {
      const { error: apErr } = await supabase.from("approvals").insert(approvalRows);
      if (apErr) console.error("Failed to queue approvals", apErr.message);
    }

    const { error: aErr } = await supabase.from("messages").insert({
      thread_id: data.threadId, user_id: userId, role: "assistant", content: clean,
    });
    if (aErr) throw new Error(aErr.message);

    const patch: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
    if (thread.kind === "side" && thread.title === "New chat") patch.title = data.content.slice(0, 40);
    await supabase.from("threads").update(patch).eq("id", data.threadId);

    return { content: clean, remembered: facts.length };
  });
