import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import { openBrowserSession } from "@/lib/browser.functions";

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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ebConn } = await supabaseAdmin.from("connector_connections")
      .select("account_name").eq("user_id", userId).eq("connector", "eventbrite").maybeSingle();

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
      `Six lead actions — these are the main workflows organizations ask for. When one comes up, run its full workflow and treat smaller steps (an Eventbrite listing, a post, an email, web research) as tools in service of the larger goal:
1. Plan an Event — research, organize, promote, coordinate, measure. First gather: kind of event, where (default to the org's primary area), when, attendance target, budget, venue status, vendor needs, audience, goal. Don't re-ask what's already known. Then research venues/vendors, propose details for approval, create listings, drive approved community outreach, coordinate vendors with approval, and plan how to measure results.
2. Social Outreach — goal, audience, location, channels, schedule; then a content and engagement plan, prepared posts, scheduling approved content, monitoring authorized replies, follow-up opportunities.
3. Poll Your Community — what to learn and who should respond; draft questions, prepare a poll for approval, plan distribution through connected channels, summarize results.
4. Analyze Sentiment — org or goal, relevant communities, date range; review authorized discussions, identify recurring aggregate themes (never profiles of individual members), summarize concerns and support, recommend improvements.
5. Email Campaign — objective, opted-in audience, timing; draft content, organize approved recipient lists, plan scheduling and tracking, recommend follow-up.
6. Phone Outreach — purpose, consented contacts, approved script, schedule; prepare call workflows, record outcomes, escalate important conversations.
For multi-step objectives, show a visible task plan with statuses (Done / Working / Approval / Pending) and keep it updated as work progresses. Prioritize contributing value to the community over promoting the organization.`,
      `Resource directory: the org keeps a reusable directory of vendors, venues, partners and groups so research is never repeated. When you identify a real, useful vendor, venue, nonprofit, community group or event worth saving, add a final line exactly like: [[resource: <vendor|venue|nonprofit|group|event|professional|other> | <name> | <one line of details>]]. One line per record, max 4 per reply. Only save genuinely useful, specific records.`,
      `You coordinate channel sub-agents (Facebook, Instagram, Instagram DMs, X, Nextdoor, Gmail, TikTok). Those connections are not live yet; when a task needs one, draft the exact content and say which agent would run it once connected. Never take outreach, booking or payment actions without the organization's explicit approval.`,
      ebConn
        ? `Eventbrite IS CONNECTED and live (account: ${ebConn.account_name}). You can really create events on it. Be the planner: from the event type, audience and location, YOU propose a compelling event name, and the best day and time for that kind of event in that community (e.g. weekday evenings 6–8pm for volunteer meetups, Saturday mornings for family/outdoor events, avoid holidays, Arizona summer heat midday and major local conflicts), a realistic capacity, and a cover image concept — explain your reasoning in one line each. Only ask for what you truly can't decide (e.g. which venue, if unknown). Invite them to tweak the name/time or give cover image ideas (colors, logo, mood). The cover image is generated with AI and uploaded to Eventbrite automatically. Summarize the listing, say it's queued in Approvals, and add a final line exactly like: [[eventbrite_event: {"title":"...","start":"YYYY-MM-DDTHH:MM:00-07:00","end":"YYYY-MM-DDTHH:MM:00-07:00","timezone":"America/Phoenix","location":"venue + address or Online","capacity":100,"price":0,"description":"<p>...</p>","image_prompt":"detailed visual description of the cover image incl. their suggestions"}]]. After approval it is created as a draft the organizer publishes. Never say Eventbrite isn't connected.`
        : "Eventbrite is not connected yet; if they want an event listing, draft it and ask them to connect Eventbrite in the Connectors tab.",
      `Approvals: when you propose any outreach, booking or payment action, describe it in the message, tell the user it is queued in the Approvals inbox for their review, and add a final line exactly like: [[approval: <outreach|booking|payment> | <short title> | <one line of details>]]. One line per proposed action. Never claim an action is done until the user has approved it.`,
      `Live browser: you can open a real web browser that the user watches live inside the chat. When the user asks you to browse the web or a task genuinely needs live browsing (researching vendors on a site, checking event listings, looking at a page), add a final line exactly like: [[browse: <what you will do in the browser>]] and tell the user you're opening a live browser they can watch and take over. The browse task is your goal: you will drive the browser yourself step by step (navigate sites like Eventbrite, search, fill forms), the user watches each step and can take over anytime, and before submitting any form, message, booking or payment you pause for their approval in the Approvals inbox. Write the browse goal specifically (site, search terms, what to fill in). Never claim results before the browser task reports back.`,
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
    const ebRows = [...text.matchAll(/\[\[eventbrite_event:\s*(\{.+?\})\s*\]\]/gs)].flatMap((m) => {
      try {
        const p = JSON.parse(m[1] ?? "");
        return [{ user_id: userId, action_type: "booking", title: `Create Eventbrite event: ${p.title}`,
          details: `${p.start} → ${p.end} · ${p.location} · ${p.price ? `$${p.price}` : "Free"} · cap ${p.capacity}`,
          payload: { kind: "eventbrite_create", ...p } }];
      } catch { return []; }
    });
    if (ebConn) approvalRows.push(...ebRows);
    const browseTasks = [...text.matchAll(/\[\[browse:\s*(.+?)\]\]/g)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
    const resourceRows = [...text.matchAll(/\[\[resource:\s*(.+?)\]\]/g)]
      .map((m) => (m[1] ?? "").split("|").map((s) => s.trim()))
      .filter((p) => p[0] && p[1])
      .slice(0, 4)
      .map(([type, name, details]) => ({
        user_id: userId,
        type: ["vendor", "venue", "nonprofit", "group", "event", "professional"].includes(type ?? "") ? type! : "other",
        name: name!,
        details: details ?? "",
        source: "Civi chat",
        status: "suggested",
      }));
    let clean = text.replace(/\n?\[\[(?:remember|approval|browse|resource|eventbrite_event):.+?\]\]/gs, "").trim() || "…";

    for (const task of browseTasks.slice(0, 2)) {
      const lovableKey = process.env["LOVABLE_API_KEY"];
      const connKey = process.env["UDC_BROWSERBASE_API_KEY"];
      if (!lovableKey || !connKey) {
        clean += `\n\n⚠️ I tried to open a live browser for "${task}", but the browser service isn't connected yet.`;
        continue;
      }
      try {
        const { id } = await openBrowserSession({
          supabase, userId, threadId: data.threadId, task, lovableKey, connKey,
        });
        clean += `\n\n[[browser: ${id} | ${task}]]`;
      } catch (e) {
        console.error("Failed to open browser session", e);
        clean += `\n\n⚠️ I couldn't open a live browser for "${task}" just now — the browser service didn't respond. Try again in a moment.`;
      }
    }

    if (facts.length) {
      await supabase.from("memories").insert(facts.map((content) => ({ user_id: userId, content })));
    }
    if (approvalRows.length) {
      const { error: apErr } = await supabase.from("approvals").insert(approvalRows);
      if (apErr) console.error("Failed to queue approvals", apErr.message);
    }
    if (resourceRows.length) {
      const { error: rErr } = await supabase.from("resources").insert(resourceRows);
      if (rErr) console.error("Failed to save resources", rErr.message);
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
