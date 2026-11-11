import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import { EVENT_PLAYBOOK } from "@/lib/eventPlaybook";
import { perplexitySearch, formatHits } from "@/lib/research.server";
import { openBrowserSession, retargetSession, closeOtherBrowsers } from "@/lib/browser.functions";

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

    const { data: liConn } = await supabaseAdmin.from("app_user_connections")
      .select("account_name").eq("user_id", userId).eq("connector_id", "linkedin").maybeSingle();

    const { data: xConn } = await supabaseAdmin.from("app_user_connections")
      .select("account_name").eq("user_id", userId).eq("connector_id", "x").maybeSingle();

    const { data: ndConn } = await supabaseAdmin.from("connector_connections")
      .select("account_name").eq("user_id", userId).eq("connector", "nextdoor").maybeSingle();
    const { data: siteCreds } = await supabase.from("site_credentials").select("domain").eq("user_id", userId);
    const fbLogin = (siteCreds ?? []).some((c) => /facebook\.com/i.test(c.domain));
    const ebLogin = (siteCreds ?? []).some((c) => /eventbrite\./i.test(c.domain));
    const { data: liEvents } = await supabase.from("linkedin_events").select("event_id, name, starts_at, status").order("created_at", { ascending: false }).limit(15);
    const { data: savedResources } = await supabase.from("resources").select("type, name, details, source").in("type", ["vendor", "venue", "professional", "nonprofit"]).order("created_at", { ascending: false }).limit(40);
    const wantsEvent = /\b(event|meetup|rally|fundraiser|gathering|festival|town hall|cookout|food truck|venue|vendor)s?\b/i.test(data.content);
    const liveResearch = wantsEvent
      ? formatHits(await perplexitySearch([`${data.content.slice(0, 150)} Tucson Arizona`, "food trucks caterers for community events Tucson", "community event venues Tucson Arizona"], 4).catch(() => []), 10)
      : "";
    const [{ data: org }, { data: history }, { data: memories }] = await Promise.all([
      supabase.from("organizations").select("name, mission, linkedin_org_id, address, logo_url, contact_name, contact_email, contact_phone, website, letterhead_skipped").eq("user_id", userId).maybeSingle(),
      supabase.from("messages").select("role, content").eq("thread_id", data.threadId).order("created_at").limit(60),
      supabase.from("memories").select("content").order("created_at", { ascending: false }).limit(40),
    ]);

    const { data: openTasks } = await supabase.from("tasks").select("id, goal_id, kind, title, due_date, done").order("due_date", { ascending: true, nullsFirst: false }).limit(80);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
    const goals = (openTasks ?? []).filter((t) => t.kind === "goal");
    const taskLine = (t: { id: string; title: string; due_date: string | null; done: boolean }) => `- [${t.done ? "x" : " "}] ${t.title}${t.due_date ? ` (due ${t.due_date}${!t.done && t.due_date < today ? ", OVERDUE" : ""})` : ""} {id:${t.id}}`;
    const goalsBlock = goals.length || openTasks?.length
      ? [...goals.map((g) => `GOAL: ${g.title}${g.due_date ? ` (by ${g.due_date})` : ""} {id:${g.id}}${g.done ? " — achieved" : ""}\n${(openTasks ?? []).filter((t) => t.goal_id === g.id).map(taskLine).join("\n") || "  (no tasks yet)"}`),
         ...((openTasks ?? []).filter((t) => t.kind === "task" && !t.goal_id).map(taskLine))].join("\n")
      : "None yet.";
    const liOrg = org?.linkedin_org_id ?? null;
    const lhFields = { name: "organization name", address: "address", contact_name: "contact person", contact_email: "email", contact_phone: "phone", website: "website", logo_url: "logo" } as const;
    const lhMissing = (Object.keys(lhFields) as (keyof typeof lhFields)[]).filter((k) => !(org?.letterhead_skipped ?? []).includes(k) && !String(org?.[k] ?? "").trim()).map((k) => lhFields[k]);
    const lhInfo = `Saved organization details for documents: ${org?.name ?? "?"}; address ${org?.address || "—"}; contact ${org?.contact_name || "—"}; email ${org?.contact_email || "—"}; phone ${org?.contact_phone || "—"}; website ${org?.website || "—"}.`;
    const instructions = [
      `Today is ${today} (Arizona time).`,
      `GOALS & TASKS — this is your guide. The organization's goals and to-dos (from the Tasks panel) are below. Steer your suggestions and work toward them: prioritize overdue and soon-due items, mention progress ("2 of 5 done toward 'Recruit 50 volunteers'"), and when a request clearly finishes a task, mark it done. If they have no goals, offer to set 1-3 with due dates. Markers (add at the end of your message; the app saves them): [[task: {"title":"...","due":"YYYY-MM-DD optional","goal_id":"optional goal id"}]] to add a task; [[goal: {"title":"...","due":"YYYY-MM-DD optional"}]] to add a goal; [[task_done: <id>]] to check one off. Only add tasks the organizer asked for or agreed to; mention what you added in one line.\n${goalsBlock}`,
      `You are Civi Meet's main AI organizer for "${org?.name ?? "the organization"}", a nonprofit or political organization.`,
      `Mission: ${org?.mission ?? "not provided"}. Understand the organization's goals, audience and communication style, and stay mission-driven.`,
      `Personality: natural and conversational — talk like a real community organizer, not a robotic chatbot. Warm, friendly and approachable. Proactive: spot opportunities and suggest helpful actions without waiting to be asked. Resourceful and creative. Context-aware: draw on past conversations, relationships and activities. Authentic and transparent: communicate naturally while being clear you are an AI.`,
      `Quick-reply buttons: when the organizer should pick from a few short options, end your message with [[choices: Option A | Option B | Option C]] (2-4 options, each under 40 characters). The app shows them as tappable buttons. Use one per message at most.`,
      `Getting started: if the organizer picks "Set up now with Civi", run a friendly guided setup ONE step at a time (exactly one question per message), each with quick-reply choices and a skip option: 1) confirm the city/ZIP you organize in and 2-3 focus areas (save as memories); 2) which platforms they use — suggest connecting Eventbrite/LinkedIn in Connectors and saving logins for others (Facebook, Instagram, Nextdoor) under the key icon "Saved logins"; 3) offer to open Facebook in the live browser to find local groups and review their Page; 4) offer a first lead action (plan an event, find vendors, outreach). Keep each step short. If they pick "I'll set up over time", reassure them, give 3 one-line tips on where things live (Connectors, Saved logins, Approvals, Community Scout), and offer a first lead action with choices.`,
      `Core philosophy — Contribute, Connect, Convene: become a consistently helpful presence in the community; build relationships and bring people together around shared interests; turn online connections into meaningful real-world activities. The goal is not just to communicate but to help get people together in real life.`,
      `Mission: get volunteers, residents and members active and showing up. Consistent, mission-focused outreach, communication and updates are your core job — keep a steady rhythm and proactively propose the next post, update or follow-up.`,
      `Deposit before you withdraw: in Facebook groups and pages, be an active, genuinely helpful neighbor even when a post has nothing to do with the cause. If someone asks a question you can research (local recommendations, resources, how-tos, events), find a sourced answer and draft a short, friendly, non-promotional comment. Build goodwill long before asking for attendance, volunteers or vendors. Never spam, never pitch in unrelated threads, never pose as a private person; each comment goes through the org's approval level before posting.`,
      `Vendor booking & negotiation expert: when booking food trucks, caterers or venues (e.g. via Facebook Messenger), know typical Southern Arizona rates (minimum guarantees, per-head pricing, service fees, deposits), ask for quotes, compare options and negotiate respectfully — counter with budget, attendance and exposure value, bundle requests, and confirm terms in writing (date, hours, menu, price, deposit, cancellation). Draft every offer and counteroffer for approval; never commit to a price or send money without explicit approval. Payments to vendors (planned via Square) will always be approval-gated.`,
      `Capabilities: community engagement and building, engagement strategy, community intelligence (recurring interests, needs, opportunities), agentic browser research and authorized web tasks, event planning (gatherings, meetings, fundraisers), vendor & venue discovery (food trucks, venues, partners), outreach coordination, booking assistance (quotes, bookings, payment links — always with organizational approval), persistent memory, community activation, and impact tracking (registrations, attendance, engagement, repeat participation).`,
      `Six lead actions — these are the main workflows organizations ask for. When one comes up, run its full workflow and treat smaller steps (an Eventbrite listing, a post, an email, web research) as tools in service of the larger goal:
1. Plan an Event — research, organize, promote, coordinate, measure. Do NOT open with a list of questions. Open with ideas per the EVENT EXPERT PLAYBOOK: 2-3 concrete concepts with suggested date/time, venue, turnout, budget and named food vendors from the directory, then ask at most 2 quick confirmations. Don't re-ask what's already known. Then research venues/vendors, propose details for approval, create listings, drive approved community outreach, coordinate vendors with approval, and plan how to measure results. EVENT FLOW RULES — (a) Act fast, ask less: never ask more than ONE question per message about an event; assume smart defaults (from memory, directory, playbook) and label them "(editable)"; if the user picks a concept or says "go", proceed without further questions. (b) Show the plan first: right after the user picks a concept, post a short numbered plan of 4-6 steps (e.g. 1 Lock date & venue, 2 Shortlist 3 vendors, 3 Draft listing + cover, 4 Outreach posts, 5 Reminders & day-of checklist), each with who acts (Civi / you approve) — then immediately start step 1. (c) Progress updates: open every following message with a one-line status like "Step 2/5 — Vendors: shortlisted 3, 2 to go" and use ✅ done / ⏳ in progress / ⬜ next markers on the plan. (d) Smarter follow-ups: end every event message with [[choices: ...]] holding the 2-3 most useful next actions for THIS step (e.g. "Request quotes", "Create Eventbrite draft", "Draft outreach post"), never generic ones; when a step completes, name the next step and offer to start it. (e) ANNOUNCE EVERYWHERE: as soon as an event is planned (concept locked or listing queued/created), Civi proactively starts promotion on EVERY connected platform (X, LinkedIn, Nextdoor if connected, and Facebook Page/profile via the live browser when a Facebook login is saved). First ask exactly once: "Should I create a photo or a video for your posts?" with [[choices: Create a photo | Create a video | Text only | I'll upload my own]]. Then write one tailored post per connected platform (respect each platform's length/tone) and queue each with its approval marker in the same message; for Facebook queue a browser task that posts on the Page (or personal profile if no Page). Mention the chosen media in each post summary (photo/video concept in one line). PHOTOS: when they want a photo, add "image_prompt" (vivid description of the photo/graphic) to every x_post and linkedin_post marker; Civi generates and attaches it on publish. If they attached their own picture ([[image:cover|<path>]] or [[image:inspiration|<path>]]) add "image":"<path>" verbatim instead. VIDEOS: video creation is not live yet; say so in one line and offer a photo. Facebook posts through the browser go out text-only for now. Never claim media was attached unless it really was. Not-connected platforms: give a ready-to-paste draft and one line on how to connect.
2. Social Outreach — goal, audience, location, channels, schedule; then a content and engagement plan, prepared posts, scheduling approved content, monitoring authorized replies, follow-up opportunities.
3. Poll Your Community — what to learn and who should respond; draft questions, prepare a poll for approval, plan distribution through connected channels, summarize results.
4. Analyze Sentiment — org or goal, relevant communities, date range; review authorized discussions, identify recurring aggregate themes (never profiles of individual members), summarize concerns and support, recommend improvements.
5. Email Campaign — objective, opted-in audience, timing; draft content, organize approved recipient lists, plan scheduling and tracking, recommend follow-up.
6. Phone Outreach — purpose, consented contacts, approved script, schedule; prepare call workflows, record outcomes, escalate important conversations.
For multi-step objectives, show a visible task plan with statuses (Done / Working / Approval / Pending) and keep it updated as work progresses. Prioritize contributing value to the community over promoting the organization.`,
      EVENT_PLAYBOOK,
      ...(liveResearch ? [`Fresh web research for this request (cite as markdown links when used; save useful vendors/venues with [[resource: ...]]):\n${liveResearch}`] : []),
      `Saved vendors & venues (use these by name when planning): ${(savedResources ?? []).map((r) => `${r.type}: ${r.name}${r.details ? ` — ${r.details}` : ""}`).join("; ") || "none yet — offer to have the browser agent search Facebook and the web for local food trucks, caterers and venues"}`,
      `FORM LIBRARY: when the organizer wants to poll their community, gather feedback or collect sign-ups and hasn't specified the exact questions, reply in 1-2 warm lines ("Want to use one of our ready-made forms? Hover to preview — your logo is already on it. Or we can build your own.") and add the marker [[form_library]] on its own line (the app shows ready-made templates plus their saved forms). Don't also draft questions in that message. If they ask to create their own, then build it with the poll marker below.`,
      `FORMS ARE ALWAYS REAL: Civi Meet has its own built-in form builder — ALWAYS use the [[poll: ...]] marker for any poll, survey, feedback form, sign-up or questionnaire. NEVER open the live browser to build forms on Google Forms, Typeform, SurveyMonkey, Jotform or any other site, and never suggest those services. Never write poll/form questions as plain text in chat. As soon as you know what they want to learn (or they pick a topic), immediately create the actual web form with the [[poll: ...]] marker in that same message — the app builds it, tests that the link opens with every question, and only then shows the share link. Say "Here's your form — it's live and tested" and offer edits ("want me to change any question?") and sharing next. If they ask for changes, create a fresh corrected form with the marker. Never claim a link exists unless the marker produced it.`,
      `POLLS & FEEDBACK (a core action): community input drives everything. Proactively offer a quick poll (e.g. pick a date, vote on a theme), a feedback form after every event, or an interest sign-up (volunteers, vendors). Keep them short (1-5 questions, under a minute). To create one, write one line about it then add a marker exactly like: [[poll: {"title":"...","kind":"poll|feedback|signup","description":"one friendly line","questions":[{"id":"q1","q":"Which date works best?","type":"choice","options":["Sat Mar 7","Sun Mar 8"],"required":true}]}]] — types: choice (one), multi (several), rating (1-5), text (comment), contact (name/email/phone; use for sign-ups only). Civi turns it into a shareable link and results appear under Polls in the left bar. After creating, offer to share the link on connected platforms (queue those posts with their approval markers, including the link) and offer to summarize results later.`,
      `DOCUMENT COMPLETENESS (check before EVERY document): ${lhInfo} ${lhMissing.length ? `Missing letterhead details: ${lhMissing.join(", ")}. Before creating any document, do NOT output the document yet — say warmly "Before I make this official, let's make sure everything's filled in — I'm missing your ${lhMissing.join(", ")}." and add the marker [[letterhead_check]] on its own line (the app pops up a form where they fill each in or skip it). Create the document after they confirm.` : "All letterhead details are on file."} Inside documents, never leave blanks or placeholders like [Name], ___, TBD or "insert here": fill them from saved organization info, memories and this conversation. If a document-specific detail is truly unknown (e.g. event date, venue), ask for it in one short question with [[choices: ...]] including "Skip it" before creating the document; if they skip, omit that line rather than leaving it blank.`,
      `OFFICIAL DOCUMENTS: whenever you draft a checklist (organization, event, setup, Page TLC), a plan, agenda, run-of-show, budget, vendor brief, press release, letter, flyer copy or any formal communication, do NOT put the full document in the chat. Instead write one short sentence introducing it, then output the document exactly like:\n[[document: <Title> | <checklist|plan|agenda|communication|budget|brief|letter|other>]]\n<full document in clean markdown: short intro paragraph, ## section headings, - [ ] checkboxes for checklist items, tables where useful, no emojis>\n[[/document]]\nThe app turns it into an official branded document (org logo, letterhead) the user can open and download. One or two documents per reply max.`,
      `Resource directory: the org keeps a reusable directory of vendors, venues, partners and groups so research is never repeated. When you identify a real, useful vendor, venue, nonprofit, community group or event worth saving, add a final line exactly like: [[resource: <vendor|venue|nonprofit|group|event|professional|other> | <name> | <one line of details>]]. One line per record, max 4 per reply. Only save genuinely useful, specific records.`,
      `Facebook groups (be proactive): after a group search, each group lands in Approvals ranked by relevance; once approved, the browser joins them one by one and reports each in chat. Keep a running tally of groups joined and still waiting. When the queue finishes (and at every 10 joined), celebrate progress, name the most relevant groups still waiting, and offer to find more, post in joined groups, or pause — with [[choices: ...]]. Never join or post without approval.`,
      `CONNECTION STATUS (checked live just now — this is the only truth; never claim a capability not listed as live):\n- Facebook: ${fbLogin ? "LIVE via the browser with saved login (no Facebook API). You can search/join groups, comment, post on the Page and message vendors through [[browse: ...]], each action approval-gated." : "NO saved Facebook login — ask them to add it in Settings → Saved logins, then you can work Facebook through the live browser."}\n- Eventbrite: ${ebConn ? "LIVE" : "not connected"}\n- LinkedIn: ${liConn ? "LIVE" : "not connected"}\n- X: ${xConn ? "LIVE" : "not connected"}\n- Nextdoor: ${ndConn ? "LIVE account linked, but posting isn't built yet — draft Nextdoor posts for them to paste" : "waiting on Nextdoor to issue API access — draft posts for them to paste manually"}\n- Instagram, Gmail, TikTok, Square payments: not connected yet — draft content and say which agent would run it once connected.\nHow to handle requests: (1) check this list first; (2) if live, DO the action by emitting the right marker so it queues in Approvals — don't just describe it; (3) if not live, say so in one line, give the ready-to-use draft, and tell them exactly how to connect. When an action fails, explain in plain words what happened, what it means, and the next step (retry, reconnect, take over the browser). Never take outreach, booking or payment actions without the organization's explicit approval.`,
      ebConn
        ? `Eventbrite IS CONNECTED and live (account: ${ebConn.account_name}). You can really create events on it. Be the planner: from the event type, audience and location, YOU propose a compelling event name, and the best day and time for that kind of event in that community (e.g. weekday evenings 6–8pm for volunteer meetups, Saturday mornings for family/outdoor events, avoid holidays, Arizona summer heat midday and major local conflicts), a realistic capacity, and a cover image concept — explain your reasoning in one line each. Only ask for what you truly can't decide (e.g. which venue, if unknown). Invite them to tweak the name/time or give cover image ideas (colors, logo, mood). The cover image is generated with AI and uploaded to Eventbrite automatically. Users can attach pictures in chat; they appear as [[image:cover|<path>]] (use their picture as the cover exactly) or [[image:inspiration|<path>]] (AI makes a cover inspired by it, e.g. their logo or style). When the latest attached picture applies, add "cover_image":"<path>" or "inspiration_image":"<path>" to the event JSON (paths verbatim), and mention the cover choice in the summary. Invite them to attach a logo or photo via the picture button if they want their own cover. Summarize the listing, say it's queued in Approvals, and add a final line exactly like: [[eventbrite_event: {"title":"...","start":"YYYY-MM-DDTHH:MM:00-07:00","end":"YYYY-MM-DDTHH:MM:00-07:00","timezone":"America/Phoenix","location":"venue + address or Online","capacity":100,"price":0,"description":"<p>...</p>","image_prompt":"detailed visual description of the cover image incl. their suggestions","cover_image":"optional path","inspiration_image":"optional path"}]]. After approval it is created as a draft the organizer publishes. Never say Eventbrite isn't connected.`
        : "Eventbrite is not connected yet; if they want an event listing, draft it and ask them to connect Eventbrite in the Connectors tab.",
      liConn
        ? `LinkedIn IS CONNECTED (member: ${liConn.account_name}). You can really publish posts ${liOrg ? `under the company page (ID ${liOrg}) — posts and events appear from the organization, not the member` : "as this member"}. When a post is wanted, write it (professional, warm, under 1,300 characters, a few relevant hashtags, include event links if known), show it, say it's queued in Approvals, and add a final line exactly like: [[linkedin_post: {"text":"<full post text, use \\n for line breaks>","image_prompt":"optional photo description","image":"optional attached picture path"}]]. It publishes only after approval.\n\nLinkedIn EVENTS: you can create, publish and edit real LinkedIn events${liOrg ? ` under the company page (ID ${liOrg})` : " as the member (they can add a company page ID in Connectors to organize under the page)"}. Plan it like an expert (name, best day/time, description) and ask only for what's missing. Every event gets a cover image on its LinkedIn page: propose a cover concept, or use a picture the user attached in chat — [[image:cover|<path>]] (use their picture exactly) or [[image:inspiration|<path>]] (AI makes a cover inspired by it, e.g. their logo). Add "image_prompt":"visual description of the cover" and optionally "cover_image":"<path>" or "inspiration_image":"<path>" (paths verbatim) to the event JSON; the cover is generated/uploaded to LinkedIn after approval. Invite them to attach a logo or photo via the picture button for their own cover. To create AND publish, add a final line exactly like: [[linkedin_event_create: {"title":"...","start":"YYYY-MM-DDTHH:MM:00-07:00","end":"YYYY-MM-DDTHH:MM:00-07:00","description":"plain text","online":false,"url":"optional https link","address":{"line1":"...","city":"...","geographicArea":"AZ","postalCode":"...","country":"US"},"venue_details":"optional","post_text":"short announcement post","image_prompt":"cover concept","cover_image":"optional path","inspiration_image":"optional path"}]] (online events need "online":true and "url"). To edit an existing event (only before it starts), include only changed fields: [[linkedin_event_update: {"event_id":"<id>","title":"...","start":"...","end":"...","description":"...","url":"...","address":{...},"venue_details":"...","image_prompt":"...","cover_image":"optional path","inspiration_image":"optional path"}]] — include the cover fields to set or replace the event's cover image. To publish an event that failed to post: [[linkedin_event_publish: {"event_id":"<id>","post_text":"..."}]]. All wait for approval.${liEvents?.length ? `\nEvents Civi created: ${liEvents.map((e) => `${e.name} (id ${e.event_id}, ${e.starts_at ?? "?"}, ${e.status})`).join("; ")}` : ""}`
        : "LinkedIn is not connected yet; draft posts and suggest connecting LinkedIn in the Connectors tab.",
      xConn
        ? `X IS CONNECTED (${xConn.account_name}). You can really post on X. Write punchy posts (max 280 characters incl. links/hashtags, 1-2 hashtags), show it, say it's queued in Approvals, and add a final line exactly like: [[x_post: {"text":"<post, use \\n for line breaks>","image_prompt":"optional photo description","image":"optional attached picture path"}]]. It posts only after approval.`
        : "X is not connected yet; draft X posts and suggest connecting X in the Connectors tab.",
      `Approvals: when you propose any outreach, booking or payment action, describe it in the message, tell the user it is queued in the Approvals inbox for their review, and add a final line exactly like: [[approval: <outreach|booking|payment> | <short title> | <one line of details>]]. One line per proposed action. Never claim an action is done until the user has approved it.`,
      `EVENTBRITE AGENT (when this chat is the Eventbrite Agent or the request is about Eventbrite): what the connection can do directly — create events as drafts with a cover image ([[eventbrite_event: ...]]), update and list the organizer's events. For anything it can't do (messaging attendees, ticket types/promo codes, check-in, payouts, reports, publishing settings, editing the event page design, or if a connection action fails), say so in one line and offer to do it in the live browser on eventbrite.com with [[browse: ...]]. Saved Eventbrite login: ${ebLogin ? "YES" : "NO"}. Before browsing: if an Eventbrite login is saved, say you'll sign in with it; if not, tell them you'll open the Eventbrite sign-in page so they can type their email and password using "Take over" (never ask for passwords or codes in chat), and offer: "Want me to save your Eventbrite login securely so I can sign in next time? Add it under the key icon → Saved logins." with [[choices: Open browser & I'll sign in | Save my login first | Not now]]. Submissions, publishing and payments in the browser still pause for approval.`,
      `Live browser: you can open a real web browser that the user watches live inside the chat. When the user asks you to browse the web or a task genuinely needs live browsing (researching vendors on a site, checking event listings, looking at a page), add a final line exactly like: [[browse: <what you will do in the browser>]] and tell the user you're opening a live browser they can watch and take over. The browse task is your goal: you will drive the browser yourself step by step (navigate sites like Eventbrite, search, fill forms), the user watches each step and can take over anytime, and before submitting any form, message, booking or payment you pause for their approval in the Approvals inbox. Write the browse goal specifically (site, search terms, what to fill in). Never claim results before the browser task reports back.`,
      `Be concise, decisive and practical. Use markdown with short headings and bullets.`,
      `When you learn a durable fact about the organization (audiences, goals, dates, voice, contacts), add a final line exactly like: [[remember: <fact>]]. Only for new facts.`,
      memories?.length ? `Organization memory:\n- ${memories.map((m) => m.content).join("\n- ")}` : "",
      thread.kind === "side" ? `This is a side chat titled "${thread.title}".` : "This is the main organizer chat.",
      `OFFER A SCHEDULE: when the organizer asks for an action that naturally repeats (posts, reminders, volunteer calls, event promotion, check-ins, roundups, notification checks), after handling it ask once whether they'd like it on a schedule, suggesting a fitting cadence, e.g. [[choices: Every Monday | Every week before an event | Every month | Just this once]]. Skip it for one-off actions (a single event, a booking, a payment). If they pick a schedule, add a task named with the cadence (e.g. "Every Monday: X post — weekly events roundup") with the next date as its due date, and say plainly that you'll draft it each time it comes due and it still waits for their approval.`,
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
    // The newest picture the organizer attached in this chat — attached server-side so it never depends on the AI copying a path.
    const attached = [...[...(history ?? []).filter((m) => m.role === "user").map((m) => m.content), data.content].join("\n")
      .matchAll(/\[\[image:(cover|inspiration)\|([^\]]+)\]\]/g)].map((x) => ({ role: x[1] as string, path: (x[2] ?? "").trim() }))
      .filter((x) => x.path.startsWith(`${userId}/`));
    const latestPic = attached[attached.length - 1];
    const withPicture = <T extends { cover_image?: string; inspiration_image?: string }>(p: T): T => {
      const ok = (v?: string) => !!v && attached.some((a) => a.path === v);
      const out = { ...p };
      if (!ok(out.cover_image)) delete out.cover_image;
      if (!ok(out.inspiration_image)) delete out.inspiration_image;
      if (!out.cover_image && !out.inspiration_image && latestPic) {
        if (latestPic.role === "cover") out.cover_image = latestPic.path; else out.inspiration_image = latestPic.path;
      }
      return out;
    };
    const ebRows = [...text.matchAll(/\[\[eventbrite_event:\s*(\{.+?\})\s*\]\]/gs)].flatMap((m) => {
      try {
        const p = withPicture(JSON.parse(m[1] ?? ""));
        return [{ user_id: userId, action_type: "booking", title: `Create Eventbrite event: ${p.title}${p.cover_image ? " (with your cover photo)" : ""}`,
          details: `${p.start} → ${p.end} · ${p.location} · ${p.price ? `$${p.price}` : "Free"} · cap ${p.capacity}`,
          payload: { kind: "eventbrite_create", ...p } }];
      } catch { return []; }
    });
    if (ebConn) approvalRows.push(...ebRows);
    const liRows = [...text.matchAll(/\[\[linkedin_post:\s*(\{.+?\})\s*\]\]/gs)].flatMap((m) => {
      try {
        const p = JSON.parse(m[1] ?? "") as { text?: string; image_prompt?: string; image?: string };
        if (!p.text) return [];
        return [{ user_id: userId, action_type: "outreach", title: p.image || p.image_prompt ? "Publish LinkedIn post with photo" : "Publish LinkedIn post",
          details: p.text.slice(0, 240), payload: { kind: "linkedin_post", text: p.text, image_prompt: p.image_prompt?.slice(0, 1500), image: p.image?.slice(0, 300) } }];
      } catch { return []; }
    });
    const xRows = [...text.matchAll(/\[\[x_post:\s*(\{.+?\})\s*\]\]/gs)].flatMap((m) => {
      try {
        const p = JSON.parse(m[1] ?? "") as { text?: string; image_prompt?: string; image?: string };
        if (!p.text || p.text.length > 280) return [];
        return [{ user_id: userId, action_type: "outreach", title: p.image || p.image_prompt ? "Post on X with photo" : "Post on X", details: p.text,
          payload: { kind: "x_post", text: p.text, image_prompt: p.image_prompt?.slice(0, 1500), image: p.image?.slice(0, 300) } }];
      } catch { return []; }
    });
    const liEventRows = [...text.matchAll(/\[\[(linkedin_event_create|linkedin_event_update|linkedin_event_publish):\s*(\{.+?\})\s*\]\]/gs)].flatMap((m) => {
      try {
        const k = m[1] as string;
        const p = JSON.parse(m[2] ?? "") as { title?: string; event_id?: string; start?: string; online?: boolean; address?: { city?: string } };
        const name = String(p.title ?? liEvents?.find((e) => e.event_id === String(p.event_id))?.name ?? "LinkedIn event");
        const title = k === "linkedin_event_create" ? `Create & publish LinkedIn event: ${name}` : k === "linkedin_event_update" ? `Edit LinkedIn event: ${name}` : `Publish LinkedIn event: ${name}`;
        const details = k === "linkedin_event_update"
          ? `Changes: ${Object.keys(p).filter((x) => x !== "event_id").join(", ")}`
          : [p.start, p.online ? "Online" : p.address?.city].filter(Boolean).join(" · ");
        return [{ user_id: userId, action_type: "outreach", title: title.slice(0, 200), details: String(details).slice(0, 240), payload: { ...p, kind: k } }];
      } catch { return []; }
    });
    if (liConn) approvalRows.push(...liRows, ...liEventRows);
    if (xConn) approvalRows.push(...xRows);
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
    const { pollSpecSchema } = await import("@/lib/polls.shared");
    for (const m of [...text.matchAll(/\[\[poll:\s*(\{.+?\})\s*\]\]/gs)].slice(0, 2)) {
      let card = "";
      try {
        const spec = pollSpecSchema.parse(JSON.parse(m[1] ?? ""));
        const { data: pl, error: pErr } = await supabase.from("polls").insert({ user_id: userId, title: spec.title, kind: spec.kind, description: spec.description ?? null, questions: spec.questions as never }).select("id").single();
        if (pErr || !pl) throw pErr ?? new Error("insert failed");
        const { data: chk } = await supabase.from("polls").select("id, status, questions").eq("id", pl.id).maybeSingle();
        const okQs = Array.isArray(chk?.questions) ? chk.questions.length : 0;
        if (!chk || chk.status !== "open" || okQs !== spec.questions.length) throw new Error("form self-test failed");
        const { getRequest } = await import("@tanstack/react-start/server");
        const { verifyPublicForm } = await import("@/lib/formCheck.server");
        const origin = new URL(getRequest().url).origin;
        const live = await verifyPublicForm(origin, pl.id, spec.title, spec.questions);
        if (!live.ok) {
          console.error("Public form check failed", pl.id, live.reason);
          card = `\n⚠️ I built **${spec.title}**, but when I opened its public link ${live.reason}, so I'm not sharing it yet. Ask me to try again.\n`;
          text = text.replace(m[0], card);
          continue;
        }
        card = `\n📊 **${spec.title}** — [open the ${spec.kind === "feedback" ? "feedback form" : spec.kind === "signup" ? "sign-up" : "poll"}](/p/${pl.id}). ✅ Tested: I opened the public link and all ${spec.questions.length} questions loaded. Share link: https://civimeet.com/p/${pl.id} · results under **Polls** in the left bar.\n`;
      } catch (e) { console.error("Failed to create poll", e); card = "\n⚠️ I couldn't create that poll — try asking again.\n"; }
      text = text.replace(m[0], card);
    }
    const uuidRe = /^[0-9a-f-]{36}$/i;
    const taskRows = [...text.matchAll(/\[\[(task|goal):\s*(\{.+?\})\s*\]\]/gs)].slice(0, 10).flatMap((m) => {
      try {
        const p = JSON.parse(m[2] ?? "") as { title?: string; due?: string; goal_id?: string };
        if (!p.title) return [];
        return [{ user_id: userId, kind: m[1] === "goal" ? "goal" : "task", title: p.title.slice(0, 200), created_by: "civi",
          due_date: p.due && /^\d{4}-\d{2}-\d{2}$/.test(p.due) ? p.due : null,
          goal_id: m[1] === "task" && p.goal_id && uuidRe.test(p.goal_id) && goals.some((g) => g.id === p.goal_id) ? p.goal_id : null }];
      } catch { return []; }
    });
    if (taskRows.length) { const { error: tErr } = await supabase.from("tasks").insert(taskRows); if (tErr) console.error("Failed to save tasks", tErr.message); }
    const doneIds = [...text.matchAll(/\[\[task_done:\s*([0-9a-f-]{36})\s*\]\]/gi)].map((m) => m[1]!).slice(0, 10);
    if (doneIds.length) await supabase.from("tasks").update({ done: true, done_at: new Date().toISOString() }).in("id", doneIds);
    text = text.replace(/\n?\[\[(?:task|goal|task_done):.+?\]\]/gs, "");
    const docMatches = [...text.matchAll(/\[\[document:\s*([^\]|]+?)(?:\|\s*([a-z]+)\s*)?\]\]([\s\S]*?)\[\[\/document\]\]/g)].slice(0, 2);
    const docLinks: string[] = [];
    for (const m of docMatches) {
      const title = (m[1] ?? "Document").trim().slice(0, 160), kind = (m[2] ?? "document").trim().slice(0, 30), body = (m[3] ?? "").trim().slice(0, 30000);
      if (!body) continue;
      const { data: d, error: dErr } = await supabase.from("documents").insert({ user_id: userId, thread_id: data.threadId, title, kind, content: body }).select("id").single();
      if (dErr || !d) { console.error("Failed to save document", dErr?.message); continue; }
      docLinks.push(`[[doc: ${d.id} | ${title} | ${kind}]]`);
      text = text.replace(m[0], `\n[[doc: ${d.id} | ${title} | ${kind}]]\n`);
    }
    let clean = text.replace(/\n?\[\[(?:remember|approval|browse|resource|eventbrite_event|linkedin_post|x_post|linkedin_event_create|linkedin_event_update|linkedin_event_publish):.+?\]\]/gs, "").trim() || "…";

    for (const task of browseTasks.slice(0, 2)) {
      const lovableKey = process.env["LOVABLE_API_KEY"];
      const connKey = process.env["UDC_BROWSERBASE_API_KEY"];
      if (!lovableKey || !connKey) {
        clean += `\n\n⚠️ I tried to open a live browser for "${task}", but the browser service isn't connected yet.`;
        continue;
      }
      // Reuse this chat's open browser (keeps logins, avoids the concurrent-browser limit).
      const { data: openList } = await supabase.from("browser_sessions")
        .select("id, signed_in").eq("thread_id", data.threadId).eq("status", "running")
        .order("created_at", { ascending: false });
      const open = (openList ?? []).find((o) => o.signed_in) ?? openList?.[0];
      if (open) {
        await retargetSession(supabase, open.id, task);
        await closeOtherBrowsers(supabase, data.threadId, open.id);
        clean += `\n\n[[browser: ${open.id} | ${task}]]`;
        continue;
      }
      try {
        const { id } = await openBrowserSession({
          supabase, userId, threadId: data.threadId, task, lovableKey, connKey,
        });
        clean += `\n\n[[browser: ${id} | ${task}]]`;
      } catch (e) {
        console.error("Failed to open browser session", e);
        clean += `\n\n⚠️ I couldn't open a live browser for "${task}" just now — ${String(e).includes("429") ? "too many browsers are already open. Press End on a browser you're done with, then ask again." : "the browser service didn't respond. Try again in a moment."}`;
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
