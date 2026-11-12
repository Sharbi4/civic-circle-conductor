// The event plan Civi runs. Pure logic only: the scheduler, approvals and UI share these rules.

export type StepKey =
  | "essentials" | "venue" | "rsvp" | "eventbrite" | "linkedin_event" | "x_post" | "linkedin_post"
  | "facebook" | "instagram" | "tiktok" | "email_invites" | "reminder_week" | "reminder_day"
  | "recap" | "feedback" | "thank_you";
export type Channel = "none" | "forms" | "eventbrite" | "linkedin" | "x" | "facebook" | "instagram" | "tiktok" | "gmail" | "social";
export type StepState = "waiting" | "ready" | "running" | "awaiting_approval" | "awaiting_reply" | "done" | "skipped" | "failed";

/** A time relative to the event date, in Arizona time (no daylight saving, UTC-7). */
type Timing = { days: number; hour: number; closesDays?: number };
export type StepDef = { key: StepKey; title: string; channel: Channel; dependsOn: StepKey[]; when?: Timing; after?: boolean; info: string };

export const EVENT_PLAN: readonly StepDef[] = [
  { key: "essentials", title: "Pick the date, budget & helpers", channel: "none", dependsOn: [], info: "Set the date, budget and expected turnout — tap to fill in what you know." },
  { key: "venue", title: "Book the venue", channel: "none", dependsOn: ["essentials"], info: "Find, check availability and reserve the space." },
  { key: "rsvp", title: "RSVP sign-up", channel: "forms", dependsOn: ["essentials"], info: "A shareable sign-up so you know who's coming." },
  { key: "eventbrite", title: "Eventbrite", channel: "eventbrite", dependsOn: ["venue"], info: "List the event and open ticketing." },
  { key: "linkedin_event", title: "LinkedIn event", channel: "linkedin", dependsOn: ["eventbrite", "rsvp"], info: "Create the event on your LinkedIn page." },
  { key: "x_post", title: "Post on X", channel: "x", dependsOn: ["eventbrite", "rsvp"], info: "Announce it to your followers on X." },
  { key: "linkedin_post", title: "Post on LinkedIn", channel: "linkedin", dependsOn: ["eventbrite", "rsvp"], info: "Share an update with a photo on LinkedIn." },
  { key: "facebook", title: "Facebook Page post", channel: "facebook", dependsOn: ["eventbrite", "rsvp"], info: "Post the event on your organization's Facebook Page." },
  { key: "instagram", title: "Instagram", channel: "instagram", dependsOn: ["eventbrite", "rsvp"], info: "Post the event photo and details." },
  { key: "tiktok", title: "TikTok", channel: "tiktok", dependsOn: ["eventbrite", "rsvp"], info: "A short video or photo post about the event." },
  { key: "email_invites", title: "Email invites", channel: "gmail", dependsOn: ["eventbrite", "rsvp"], info: "Invite your contacts by email." },
  { key: "reminder_week", title: "Reminder a week before", channel: "gmail", dependsOn: ["rsvp"], when: { days: -7, hour: 9, closesDays: -2 }, info: "Emails everyone who signed up, 7 days out." },
  { key: "reminder_day", title: "Reminder the day before", channel: "gmail", dependsOn: ["rsvp"], when: { days: -1, hour: 9, closesDays: 0 }, info: "Emails everyone who signed up, the day before." },
  { key: "recap", title: "Recap post", channel: "social", dependsOn: [], when: { days: 1, hour: 10 }, after: true, info: "A thank-you recap on your connected channels the day after." },
  { key: "feedback", title: "Feedback poll", channel: "forms", dependsOn: [], when: { days: 1, hour: 10 }, after: true, info: "A short feedback form for attendees." },
  { key: "thank_you", title: "Thank-you email", channel: "gmail", dependsOn: ["feedback"], when: { days: 1, hour: 11 }, after: true, info: "Thanks everyone who signed up, with the feedback link." },
];

export const PLAN_KEYS = EVENT_PLAN.map((s) => s.key);
export const stepDef = (key: string | null | undefined) => EVENT_PLAN.find((s) => s.key === key) ?? null;

const CHANNEL_NAMES: Record<Channel, string> = { none: "", forms: "Forms", eventbrite: "Eventbrite", linkedin: "LinkedIn", x: "X", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", gmail: "Gmail", social: "a social account" };
export const channelName = (c: Channel) => CHANNEL_NAMES[c];

/** Maps titles from older checklists (and the current ones) to plan keys. */
export function keyForTitle(title: string): StepKey | null {
  const exact = EVENT_PLAN.find((s) => s.title === title);
  if (exact) return exact.key;
  const t = title.toLowerCase();
  if (/budget|helpers/.test(t)) return "essentials";
  if (/venue/.test(t)) return "venue";
  if (/rsvp|sign-?up/.test(t)) return "rsvp";
  if (/eventbrite/.test(t)) return "eventbrite";
  if (/linkedin event/.test(t)) return "linkedin_event";
  if (/post on x|\bx\b/.test(t)) return "x_post";
  if (/post on linkedin/.test(t)) return "linkedin_post";
  if (/facebook/.test(t)) return "facebook";
  if (/instagram/.test(t)) return "instagram";
  if (/tiktok/.test(t)) return "tiktok";
  if (/email invite/.test(t)) return "email_invites";
  if (/week/.test(t) && /remind/.test(t)) return "reminder_week";
  if (/remind/.test(t)) return "reminder_day";
  if (/recap/.test(t)) return "recap";
  if (/thank/.test(t)) return "thank_you";
  if (/feedback/.test(t)) return "feedback";
  return null;
}

const AZ_OFFSET_H = 7;
/** UTC instant for a day offset + local hour from the event date (YYYY-MM-DD). */
export function atEventOffset(eventDate: string, days: number, hour: number): Date {
  const [y, m, d] = eventDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days, hour + AZ_OFFSET_H));
}
export function triggerAt(def: StepDef, eventDate: string | null): string | null {
  if (!def.when || !eventDate) return null;
  return atEventOffset(eventDate, def.when.days, def.when.hour).toISOString();
}

export type PlanRow = { id: string; step_key: string | null; done: boolean; step_state: string | null; scheduled_for: string | null; last_run_at: string | null; run_prompt: string | null };
export type PlanCtx = {
  now: number;
  eventDate: string | null;
  connected: (c: Channel) => boolean;
  /** Step ids with an approval waiting for the organizer or still executing. */
  approvalOpen: Set<string>;
  /** Step ids where the organizer has written in the chat since the step last ran. */
  repliedSince: Set<string>;
};
export type Decision = { state: StepState; reason?: string };

export const isResolved = (s: string | null | undefined) => s === "done" || s === "skipped";
const RETRY_MIN = [30, 120, 360, 1440];
/** Back-off for a step that ran without finishing: 30 min, 2 h, 6 h, 1 day, then wait for the organizer. */
export function nudgeDelayMinutes(attempts: number): number | null { return attempts >= 0 && attempts < RETRY_MIN.length ? RETRY_MIN[attempts]! : null; }
export function parseStepRun(raw: string | null | undefined): { attempts: number; nudge_at: string | null } {
  try { const v = JSON.parse(raw ?? "{}"); return { attempts: Number.isFinite(v?.attempts) ? Number(v.attempts) : 0, nudge_at: typeof v?.nudge_at === "string" ? v.nudge_at : null }; }
  catch { return { attempts: 0, nudge_at: null }; }
}

/** Decides what a step should be doing right now. The code decides what's next, not the chat. */
export function decideStep(row: PlanRow, byKey: Map<string, PlanRow>, ctx: PlanCtx): Decision {
  const def = stepDef(row.step_key);
  if (!def) return { state: (row.step_state as StepState) ?? "waiting" };
  if (row.done) return { state: row.step_state === "skipped" ? "skipped" : "done" };
  if (row.scheduled_for) return { state: "running" };
  if (ctx.approvalOpen.has(row.id)) return { state: "awaiting_approval", reason: "Waiting for your approval" };

  if (ctx.eventDate) {
    const over = atEventOffset(ctx.eventDate, 1, 0).getTime();
    if (!def.after && ctx.now >= over) return { state: "skipped", reason: "The event has already happened" };
    if (def.when?.closesDays !== undefined && ctx.now >= atEventOffset(ctx.eventDate, def.when.closesDays, 0).getTime())
      return { state: "skipped", reason: "Too close to the event for this one" };
  }
  const blockers = def.dependsOn.filter((k) => { const dep = byKey.get(k); return !!dep && !dep.done && !isResolved(dep.step_state); });
  if (blockers.length) return { state: "waiting", reason: `Waiting for ${blockers.map((k) => stepDef(k)!.title).join(", ")}` };
  if (def.when) {
    if (!ctx.eventDate) return { state: "waiting", reason: "Needs the event date" };
    const at = atEventOffset(ctx.eventDate, def.when.days, def.when.hour);
    if (ctx.now < at.getTime()) return { state: "waiting", reason: `Runs ${at.toLocaleString("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` };
  }
  if (def.channel !== "none" && def.channel !== "forms" && !ctx.connected(def.channel))
    return { state: "skipped", reason: `${channelName(def.channel)} isn't connected — ready-to-paste draft is in the chat` };

  if (row.step_state === "awaiting_reply" || row.step_state === "failed" || row.step_state === "awaiting_approval") {
    if (ctx.repliedSince.has(row.id)) return { state: "ready" };
    const { nudge_at } = parseStepRun(row.run_prompt);
    if (row.step_state === "awaiting_reply" && nudge_at && ctx.now >= Date.parse(nudge_at)) return { state: "ready" };
    if (row.step_state === "failed") return { state: "failed", reason: "Didn't go through — reply in the event chat to try again" };
    if (row.step_state === "awaiting_approval") return { state: "awaiting_reply", reason: "The approval was declined or dismissed — reply in the event chat to redo it" };
    return { state: "awaiting_reply", reason: nudge_at ? "Waiting on an answer — I'll check back" : "Paused until you reply in the event chat" };
  }
  return { state: "ready" };
}

/** One-line plan status for Civi and the chat, e.g. "Step 6 of 16 — ✅ Eventbrite · ⏳ Post on X …". */
export function planStatus(rows: { step_key: string | null; title: string; step_state: string | null; done: boolean; result_url: string | null }[]): string {
  const ordered = [...rows].filter((r) => stepDef(r.step_key)).sort((a, b) => PLAN_KEYS.indexOf(a.step_key as StepKey) - PLAN_KEYS.indexOf(b.step_key as StepKey));
  const icon = (r: (typeof ordered)[number]) => r.step_state === "skipped" ? "⏭️" : r.done ? "✅" : r.step_state === "awaiting_approval" ? "🟦 approval" : r.step_state === "awaiting_reply" ? "💬 waiting on reply" : r.step_state === "failed" ? "⚠️ failed" : r.step_state === "ready" || r.step_state === "running" ? "⏳" : "⬜";
  return ordered.map((r, i) => `${i + 1}. ${icon(r)} ${r.title}${r.result_url ? ` (${r.result_url})` : ""}`).join("\n");
}

/** Ready-to-paste copy for a channel that isn't connected, so it never blocks the rest of the plan. */
export function skipDraft(def: StepDef, ev: { title: string; date: string | null; location: string; link: string | null }): string {
  const when = ev.date ? new Date(`${ev.date}T12:00:00-07:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "soon";
  const where = ev.location ? ` at ${ev.location}` : "";
  const link = ev.link ? `\nRSVP: ${ev.link}` : "";
  if (def.key === "tiktok") return `Caption: Come hang out with us! ${ev.title} — ${when}${where}. Free, friendly, and all are welcome 💙${link} #community #Tucson`;
  if (def.key === "instagram") return `📅 ${ev.title}\n${when}${where}\n\nBring a friend — everyone's welcome.${link ? `\nLink in bio · ${ev.link}` : ""}\n#community #Tucson #getinvolved`;
  if (def.channel === "gmail") return `Subject: ${def.key === "thank_you" ? `Thank you for coming to ${ev.title}` : def.key.startsWith("reminder") ? `Reminder: ${ev.title} is ${def.key === "reminder_day" ? "tomorrow" : "next week"}` : `You're invited: ${ev.title}`}\n\nHi there,\n\n${def.key === "thank_you" ? `Thank you for being part of ${ev.title}. We'd love to hear how it went.` : `Join us for ${ev.title} on ${when}${where}.`}${link}\n\nSee you there!`;
  return `📅 ${ev.title} — ${when}${where}.${link}`;
}

/** Check-ins the scheduler writes into a chat on Civi's behalf; they are not the organizer replying. */
export function isAutomatedPrompt(content: string): boolean {
  return /^\[(Plan step|Resume)\b/.test(content);
}

/** The checklist rows a new event goal starts with. */
export function planInsertRows(userId: string, goalId: string, threadId: string, eventDate: string | null) {
  return EVENT_PLAN.map((d) => ({ user_id: userId, kind: "task", title: d.title, created_by: "civi", goal_id: goalId, thread_id: threadId, step_key: d.key, depends_on: [...d.dependsOn], trigger_at: triggerAt(d, eventDate) }));
}

/** The short line a chat shows in place of an automatic check-in prompt. */
export function automatedPromptLabel(content: string): string {
  const step = content.match(/Step (\d+) of (\d+): "([^"]+)"/);
  if (step) return `Civi picked up step ${step[1]} of ${step[2]} — ${step[3]}`;
  return "Civi picked up where this left off";
}
