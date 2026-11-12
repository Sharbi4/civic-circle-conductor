import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  EVENT_PLAN, PLAN_KEYS, decideStep, keyForTitle, nudgeDelayMinutes, parseStepRun, planStatus, skipDraft, stepDef, triggerAt,
  isAutomatedPrompt, type Channel, type PlanRow, type StepKey,
} from "./eventPlan.shared";
import { chatIsIdle } from "./resume.shared";
import { scopedDb } from "./scopedDb.server";

type Db = SupabaseClient<Database>;
type Task = Database["public"]["Tables"]["tasks"]["Row"];
const MAX_QUEUED_PER_EVENT = 3;

/** Which channels this organization can act on right now. */
export async function planConnections(db: Db, userId: string): Promise<(c: Channel) => boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [eb, x, creds] = await Promise.all([
    supabaseAdmin.from("connector_connections").select("id").eq("user_id", userId).eq("connector", "eventbrite").maybeSingle(),
    supabaseAdmin.from("app_user_connections").select("id").eq("user_id", userId).eq("connector_id", "x").maybeSingle(),
    db.from("site_credentials").select("domain").eq("user_id", userId),
  ]);
  const { getDirectLinkedInConnection } = await import("./linkedinDirect.server");
  const { linkedInTokenUsable } = await import("./linkedinDirect.shared");
  const li = await getDirectLinkedInConnection(userId).catch(() => null);
  const linkedin = !!(li && linkedInTokenUsable(li.token));
  const { connectedGoogle } = await import("./googleActions.server");
  const google = await connectedGoogle(userId).catch(() => null);
  const browser = !!(process.env["LOVABLE_API_KEY"] && process.env["UDC_BROWSERBASE_API_KEY"]);
  const facebook = browser && (creds.data ?? []).some((c) => /facebook\.com/i.test(c.domain));
  const map: Record<Channel, boolean> = {
    none: true, forms: true, eventbrite: !!eb.data, linkedin, x: !!x.data, facebook, instagram: false, tiktok: false,
    gmail: !!google?.gmail, social: linkedin || !!x.data || facebook,
  };
  return (c) => map[c];
}

/** Brings an event goal's checklist in line with the plan: keys, dependencies and trigger times. Idempotent. */
export async function ensurePlan(db: Db, userId: string, goal: { id: string; thread_id: string | null }, eventDate: string | null): Promise<Task[]> {
  const load = async () => (await db.from("tasks").select("*").eq("goal_id", goal.id).eq("user_id", userId).order("created_at")).data ?? [];
  let rows = await load();
  const taken = new Set(rows.map((r) => r.step_key).filter(Boolean));
  let changed = false;
  for (const r of rows) {
    if (r.step_key) continue;
    const k = keyForTitle(r.title);
    if (!k || taken.has(k)) continue;
    const def = stepDef(k)!;
    const { error } = await db.from("tasks").update({ step_key: k, title: def.title, depends_on: def.dependsOn, trigger_at: triggerAt(def, eventDate) }).eq("id", r.id).eq("user_id", userId).is("step_key", null);
    if (!error) { taken.add(k); changed = true; }
  }
  const missing = EVENT_PLAN.filter((d) => !taken.has(d.key));
  for (const d of missing) {
    const { error } = await db.from("tasks").insert({ user_id: userId, kind: "task", title: d.title, created_by: "civi", goal_id: goal.id, thread_id: goal.thread_id, step_key: d.key, depends_on: d.dependsOn, trigger_at: triggerAt(d, eventDate) });
    if (!error) changed = true;
  }
  if (changed) rows = await load();
  for (const r of rows) {
    const def = stepDef(r.step_key);
    if (!def?.when || r.done) continue;
    const want = triggerAt(def, eventDate);
    if ((want ? Date.parse(want) : null) !== (r.trigger_at ? Date.parse(r.trigger_at) : null)) {
      await db.from("tasks").update({ trigger_at: want }).eq("id", r.id).eq("user_id", userId);
      r.trigger_at = want;
    }
  }
  return rows;
}

type EventInfo = { title: string; date: string | null; location: string; eventbrite: string | null; rsvp: string | null };
function eventInfo(goalTitle: string, date: string | null, venue: string | null | undefined, rows: Task[]): EventInfo {
  const url = (k: StepKey) => rows.find((r) => r.step_key === k)?.result_url ?? null;
  return { title: goalTitle.replace(/^(Event|Launch):\s*/, ""), date, location: venue ?? "", eventbrite: url("eventbrite"), rsvp: url("rsvp") };
}

/**
 * Every scheduler run: for each event, works out every step's state from the saved plan and queues
 * every step that's ready (not only the first), so independent steps run in parallel.
 */
export async function advanceEventPlans(admin: Db, onlyUserId?: string) {
  let threadQuery = admin.from("threads").select("id, user_id, event_date").eq("kind", "event");
  if (onlyUserId) threadQuery = threadQuery.eq("user_id", onlyUserId);
  const { data: threads } = await threadQuery.order("updated_at", { ascending: false }).limit(300);
  if (!threads?.length) return;
  const byThread = new Map(threads.map((t) => [t.id, t]));
  const { data: goals } = await admin.from("tasks").select("id, user_id, title, due_date, thread_id").eq("kind", "goal").eq("done", false).in("thread_id", threads.map((t) => t.id));
  const conns = new Map<string, (c: Channel) => boolean>();
  const seen = new Set<string>();
  for (const goal of goals ?? []) {
    const thread = byThread.get(goal.thread_id ?? "");
    if (!thread || thread.user_id !== goal.user_id || seen.has(thread.id)) continue;
    seen.add(thread.id);
    try {
      const { data: paused } = await admin.from("autopilot_state").select("paused_reason").eq("user_id", goal.user_id).maybeSingle();
      if (paused?.paused_reason) continue;
      const db = scopedDb(admin, goal.user_id) as Db;
      if (!conns.has(goal.user_id)) conns.set(goal.user_id, await planConnections(db, goal.user_id));
      await advanceGoal(db, goal.user_id, { ...goal, thread_id: thread.id }, goal.due_date ?? thread.event_date, conns.get(goal.user_id)!);
    } catch (e) { console.error("Event plan advance failed", goal.id, e instanceof Error ? e.message : e); }
  }
}

async function advanceGoal(db: Db, userId: string, goal: { id: string; title: string; thread_id: string }, eventDate: string | null, connected: (c: Channel) => boolean) {
  const rows = await ensurePlan(db, userId, goal, eventDate);
  const { data: prof } = await db.from("event_profiles").select("budget, headcount, venue, venue_status").eq("goal_id", goal.id).maybeSingle();
  // Details entered on the event page finish the matching steps without waiting on the chat.
  const now = new Date().toISOString();
  const auto: StepKey[] = [];
  if (prof && prof.budget != null && prof.headcount != null && eventDate) auto.push("essentials");
  if (prof?.venue_status === "booked") auto.push("venue");
  for (const k of auto) {
    const r = rows.find((x) => x.step_key === k && !x.done);
    if (!r) continue;
    await db.from("tasks").update({ done: true, done_at: now, step_state: "done", step_note: null, scheduled_for: null }).eq("id", r.id).eq("user_id", userId).eq("done", false);
    Object.assign(r, { done: true, step_state: "done", scheduled_for: null });
  }

  const plan = rows.filter((r) => stepDef(r.step_key));
  const ids = plan.map((r) => r.id);
  const { data: aps } = ids.length ? await db.from("approvals").select("status, run_state, payload").eq("user_id", userId).filter("payload->>launch_task_id", "in", `(${ids.join(",")})`) : { data: [] };
  const approvalOpen = new Set<string>();
  for (const a of aps ?? []) {
    const id = (a.payload as { launch_task_id?: string } | null)?.launch_task_id;
    if (id && (a.status === "pending" || (a.status === "approved" && (!a.run_state || a.run_state === "running" || a.run_state === "queued")))) approvalOpen.add(id);
  }
  const { data: recent } = await db.from("messages").select("created_at, role, content").eq("thread_id", goal.thread_id).eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  const lastAny = recent?.[0]?.created_at ?? null;
  const lastHuman = recent?.find((m) => m.role === "user" && !isAutomatedPrompt(m.content))?.created_at ?? null;
  const repliedSince = new Set(plan.filter((r) => lastHuman && lastHuman > (r.last_run_at ?? r.created_at)).map((r) => r.id));

  const byKey = new Map<string, PlanRow>(plan.map((r) => [r.step_key!, r]));
  const ordered = [...plan].sort((a, b) => PLAN_KEYS.indexOf(a.step_key as StepKey) - PLAN_KEYS.indexOf(b.step_key as StepKey));
  const ctx = { now: Date.now(), eventDate, connected, approvalOpen, repliedSince };
  const skippedDrafts: string[] = [];
  const ready: Task[] = [];
  const info = eventInfo(goal.title, eventDate, prof?.venue, rows);
  for (const r of ordered) {
    const d = decideStep(r, byKey, ctx);
    const def = stepDef(r.step_key)!;
    if (d.state === "skipped" && !r.done) {
      await db.from("tasks").update({ done: true, done_at: now, step_state: "skipped", step_note: d.reason ?? null, scheduled_for: null }).eq("id", r.id).eq("user_id", userId).eq("done", false);
      Object.assign(r, { done: true, step_state: "skipped" });
      if (def.channel !== "none" && !connected(def.channel)) skippedDrafts.push(`**${def.title}** — ${d.reason}\n\n\`\`\`\n${skipDraft(def, { title: info.title, date: eventDate, location: info.location, link: info.eventbrite ?? info.rsvp })}\n\`\`\``);
      else skippedDrafts.push(`**${def.title}** — ${d.reason}.`);
      continue;
    }
    if (d.state === "ready") ready.push(r);
    const note = d.reason ?? null;
    if (r.step_state !== d.state || (r.step_note ?? null) !== note) {
      await db.from("tasks").update({ step_state: d.state, step_note: note }).eq("id", r.id).eq("user_id", userId);
      Object.assign(r, { step_state: d.state, step_note: note });
    }
  }
  if (skippedDrafts.length) {
    await db.from("messages").insert({ user_id: userId, thread_id: goal.thread_id, role: "assistant", content: `⏭️ I skipped ${skippedDrafts.length === 1 ? "a step" : `${skippedDrafts.length} steps`} so the rest of the plan keeps moving:\n\n${skippedDrafts.join("\n\n")}\n\nConnect a channel in **Connectors** any time and ask me to run its step.` });
  }
  // Don't talk over the organizer: queued steps wait for a short quiet spell in the event chat.
  if (!ready.length || !chatIsIdle(lastAny, Date.now(), 10)) return;
  for (const r of ready.slice(0, MAX_QUEUED_PER_EVENT)) {
    await db.from("tasks").update({ job_kind: "launch_step", scheduled_for: new Date().toISOString(), step_state: "running", step_note: null, last_error: null })
      .eq("id", r.id).eq("user_id", userId).eq("done", false).is("scheduled_for", null);
  }
}

const STEP_WORK: Record<StepKey, string> = {
  essentials: `Lock the date, budget, expected turnout and helpers. Use what's already known (event page, memory, this chat) and ask only for what's missing, in one question with [[choices: ...]]. Add [[event_chat: ...]] as soon as the date is decided. When date, budget and turnout are all known, emit [[task_done: ID]].`,
  venue: `Secure the venue (EXECUTE THE FOUNDATION FIRST): verify availability and terms for the date, then prepare the inquiry, application or reservation for approval. If you're waiting on the venue, say in one line exactly what you're waiting for. Only when the venue is confirmed booked, emit [[task_done: ID]].`,
  rsvp: `Create the RSVP sign-up now with one [[poll: ...]] marker of kind "signup" that includes the "event" block (title, start, end, timezone, location).`,
  eventbrite: `Queue the Eventbrite listing now with [[eventbrite_event: ...]], cover image_prompt included.`,
  linkedin_event: `Queue [[linkedin_event_create: ...]] with the RSVP or Eventbrite link and a cover image_prompt.`,
  x_post: `Queue one [[x_post: ...]] (280 characters max) with the RSVP or Eventbrite link and an image_prompt.`,
  linkedin_post: `Queue one [[linkedin_post: ...]] with the RSVP or Eventbrite link and an image_prompt.`,
  facebook: `Queue one [[browse: ...]] task that creates the event or an announcement post on the organization's official Facebook Page only (saved login), with the details and RSVP link, pausing for approval before publishing. Never send personal messages, DMs, friend requests or group invitations from the browser — Meta suspends accounts for automated messaging. Personal invitations go by email.`,
  instagram: `Prepare the Instagram caption and photo concept for approval.`,
  tiktok: `Prepare the TikTok caption and photo concept for approval.`,
  email_invites: `Queue the invitation with [[gmail_send: ...]]: "to" = the organization's own email, invitees in "bcc" so nobody sees anyone else's address. Only email people who have a relationship with the organization (event-page contacts, members, partners). If you don't have an invite list yet, ask once who should get it, with [[choices: ...]]. Include date, place and the RSVP link.`,
  reminder_week: `Queue a friendly one-week reminder with [[gmail_send: ...]] to everyone who signed up: "to" = the organization's own email, "bcc" = the RSVP emails below. If nobody has signed up, say so in one line and emit [[task_done: ID]].`,
  reminder_day: `Queue a short "see you tomorrow" reminder with [[gmail_send: ...]] to everyone who signed up: "to" = the organization's own email, "bcc" = the RSVP emails below, with the address and start time. If nobody has signed up, say so in one line and emit [[task_done: ID]].`,
  recap: `The event has happened. Queue a short thank-you recap post for each connected social channel (x_post / linkedin_post with image_prompt) and ask in one line if they'd rather use real photos from the day.`,
  feedback: `The event has happened. Create the feedback form now with one [[poll: ...]] marker of kind "feedback" (3-5 quick questions).`,
  thank_you: `Queue the thank-you email with [[gmail_send: ...]] to everyone who signed up ("to" = the organization's own email, "bcc" = the RSVP emails below), including the feedback form link. If nobody signed up, say so in one line and emit [[task_done: ID]].`,
};

async function rsvpEmails(db: Db, userId: string, rsvpUrl: string | null): Promise<string[]> {
  const id = rsvpUrl?.match(/\/p\/([0-9a-f-]{36})/i)?.[1];
  if (!id) return [];
  const { data: poll } = await db.from("polls").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!poll) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("poll_responses").select("answers").eq("poll_id", poll.id).limit(500);
  const found = new Set<string>();
  for (const r of data ?? []) for (const m of JSON.stringify(r.answers).matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) found.add(m[0].toLowerCase());
  return [...found].slice(0, 300);
}

/** Runs one ready step in its event chat, reading the saved plan instead of rereading the chat. */
export async function runPlanStep(db: Db, userId: string, task: Task, threadId: string): Promise<"infinity" | "hold"> {
  const def = stepDef(task.step_key)!;
  const [{ data: goal }, { data: rows }, { data: prof }, { data: org }] = await Promise.all([
    db.from("tasks").select("title, due_date").eq("id", task.goal_id ?? "").eq("user_id", userId).maybeSingle(),
    db.from("tasks").select("*").eq("goal_id", task.goal_id ?? "").eq("user_id", userId),
    db.from("event_profiles").select("venue").eq("goal_id", task.goal_id ?? "").maybeSingle(),
    db.from("organizations").select("contact_email").eq("user_id", userId).maybeSingle(),
  ]);
  const { data: thread } = await db.from("threads").select("event_date").eq("id", threadId).maybeSingle();
  const all = rows ?? [];
  const info = eventInfo(goal?.title ?? "this event", goal?.due_date ?? thread?.event_date ?? null, prof?.venue, all);
  const planOnly = all.filter((r) => stepDef(r.step_key));
  const n = [...planOnly].sort((a, b) => PLAN_KEYS.indexOf(a.step_key as StepKey) - PLAN_KEYS.indexOf(b.step_key as StepKey)).findIndex((r) => r.id === task.id) + 1;
  const emails = def.channel === "gmail" && def.key !== "email_invites" ? await rsvpEmails(db, userId, info.rsvp) : [];
  const content = [
    `[Plan step — picked up automatically] Event: ${info.title}${info.date ? ` on ${info.date}` : ""}. Step ${n} of ${planOnly.length}: "${def.title}" (task id ${task.id}).`,
    `Saved plan state (this is the truth — don't redo finished steps):\n${planStatus(all)}`,
    `Links: Eventbrite ${info.eventbrite ?? "—"} · RSVP ${info.rsvp ?? "—"} · Venue ${info.location || "—"} · Organization email ${org?.contact_email || "—"}`,
    ...(def.channel === "gmail" && def.key !== "email_invites" ? [`RSVP emails (${emails.length}): ${emails.join(", ") || "nobody has signed up yet"}`] : []),
    `Do this step now, in this one message: ${STEP_WORK[def.key].replaceAll("ID", task.id)}`,
    `Start with one line: "🔁 Step ${n} of ${planOnly.length} — ${def.title}". Don't repeat earlier messages. Every publish stays approval-gated; queue it with its marker and the app finishes this step when it really goes out. If you need one answer from the organizer, ask exactly one question.`,
  ].join("\n\n");

  const { runOrganizer } = await import("./organizer.server");
  const res = await runOrganizer(db, userId, { threadId, content, planStepId: task.id });
  const { data: after } = await db.from("tasks").select("done").eq("id", task.id).eq("user_id", userId).maybeSingle();
  if (after?.done) {
    await db.from("tasks").update({ step_state: "done", step_note: null }).eq("id", task.id).eq("user_id", userId);
    return "infinity";
  }
  if ((def.key === "rsvp" || def.key === "feedback") && res.pollIds.length) {
    await db.from("tasks").update({ step_state: "done", step_note: null, result_url: `https://civimeet.com/p/${res.pollIds[0]}` }).eq("id", task.id).eq("user_id", userId);
    return "infinity";
  }
  if (res.approvalsQueued) {
    // Waiting on the organizer's approval never uses up retries.
    await db.from("tasks").update({ step_state: "awaiting_approval", step_note: "Waiting for your approval", run_prompt: JSON.stringify({ attempts: 0, nudge_at: null }) }).eq("id", task.id).eq("user_id", userId);
    return "hold";
  }
  const st = parseStepRun(task.run_prompt);
  const delay = nudgeDelayMinutes(st.attempts);
  const nudgeAt = delay === null ? null : new Date(Date.now() + delay * 60000).toISOString();
  await db.from("tasks").update({ step_state: "awaiting_reply", step_note: nudgeAt ? "Waiting on an answer — I'll check back" : "Paused until you reply in the event chat", run_prompt: JSON.stringify({ attempts: st.attempts + 1, nudge_at: nudgeAt }) }).eq("id", task.id).eq("user_id", userId);
  if (!nudgeAt) await db.from("messages").insert({ user_id: userId, thread_id: threadId, role: "assistant", content: `⏸️ I've paused **${def.title}** until you reply here. The other steps keep going.` });
  return "hold";
}

/** Marks a plan step done from outside the chat (e.g. the Eventbrite listing was created). */
export async function finishPlanStep(db: Db, userId: string, goalId: string, key: StepKey, url: string | null) {
  await db.from("tasks").update({ done: true, done_at: new Date().toISOString(), step_state: "done", step_note: null, scheduled_for: null, ...(url ? { result_url: url } : {}) })
    .eq("goal_id", goalId).eq("user_id", userId).eq("step_key", key).eq("done", false);
}
