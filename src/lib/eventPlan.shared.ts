// The event plan Civi runs. Pure logic only: the scheduler, approvals and UI share these rules.
import { zonedInstant, safeTimeZone, DEFAULT_TIME_ZONE } from "./zonedTime.shared";
import { DECLINED, NEEDS_ATTENTION } from "./stepStatus.shared";

export type StepKey =
  | "essentials" | "venue" | "rsvp" | "eventbrite" | "linkedin_event" | "x_post" | "linkedin_post"
  | "facebook" | "instagram" | "tiktok" | "email_invites" | "reminder_week" | "reminder_day"
  | "recap" | "feedback" | "thank_you";
export type Channel = "none" | "forms" | "eventbrite" | "linkedin" | "x" | "facebook" | "instagram" | "tiktok" | "gmail" | "social";
export type StepState = "waiting" | "ready" | "running" | "awaiting_approval" | "awaiting_reply" | "done" | "skipped" | "failed"
  | "interrupted" | "declined" | "on_hold" | "waiting_on" | "your_pick";

/** A time relative to the event date, on the organization's own wall clock. */
type Timing = { days: number; hour: number; closesDays?: number };
export type StepDef = { key: StepKey; title: string; channel: Channel; dependsOn: StepKey[]; when?: Timing; after?: boolean; info: string };

export const EVENT_PLAN: readonly StepDef[] = [
  { key: "essentials", title: "Pick the date, budget & helpers", channel: "none", dependsOn: [], info: "Set the date, budget and expected turnout, tap to fill in what you know." },
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

/** UTC instant for a day offset + local hour from the event date (YYYY-MM-DD), in the organization's time zone. */
export function atEventOffset(eventDate: string, days: number, hour: number, tz: string = DEFAULT_TIME_ZONE): Date {
  const [y, m, d] = eventDate.split("-").map(Number);
  return zonedInstant(y!, m!, d! + days, hour, tz);
}
export function triggerAt(def: StepDef, eventDate: string | null, tz: string = DEFAULT_TIME_ZONE): string | null {
  if (!def.when || !eventDate) return null;
  return atEventOffset(eventDate, def.when.days, def.when.hour, tz).toISOString();
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
  /** The organization's time zone; step times are its wall clock. */
  timeZone?: string;
  /** How each step's latest approval ended, when it has one. */
  approvalOutcome?: Map<string, "declined" | "failed" | "succeeded">;
  /** An approval is still waiting in this event chat without being tied to a step. */
  threadApprovalOpen?: boolean;
};
export type Decision = { state: StepState; reason?: string };

export const isResolved = (s: string | null | undefined) => s === "done" || s === "skipped";
const RETRY_MIN = [30, 120, 360, 1440];
/** Back-off for a step that ran without finishing: 30 min, 2 h, 6 h, 1 day, then wait for the organizer. */
export function nudgeDelayMinutes(attempts: number): number | null { return attempts >= 0 && attempts < RETRY_MIN.length ? RETRY_MIN[attempts]! : null; }
export type StepRun = { attempts: number; nudge_at: string | null; after: StepKey | null; retry: "retry" | "resume" | "another" | null; queued_at: string | null };
export function parseStepRun(raw: string | null | undefined): StepRun {
  try {
    const v = JSON.parse(raw ?? "{}");
    return {
      attempts: Number.isFinite(v?.attempts) ? Number(v.attempts) : 0,
      nudge_at: typeof v?.nudge_at === "string" ? v.nudge_at : null,
      after: PLAN_KEYS.includes(v?.after) ? v.after : null,
      retry: ["retry", "resume", "another"].includes(v?.retry) ? v.retry : null,
      queued_at: typeof v?.queued_at === "string" ? v.queued_at : null,
    };
  } catch { return { attempts: 0, nudge_at: null, after: null, retry: null, queued_at: null }; }
}
/** States where the step is parked until something specific happens; the scheduler keeps their note. */
export const PARKED: readonly string[] = ["awaiting_reply", "failed", "awaiting_approval", "interrupted", "declined", "on_hold", "waiting_on", "your_pick"];

/** Decides what a step should be doing right now. The code decides what's next, not the chat. */
export function decideStep(row: PlanRow, byKey: Map<string, PlanRow>, ctx: PlanCtx): Decision {
  const def = stepDef(row.step_key);
  if (!def) return { state: (row.step_state as StepState) ?? "waiting" };
  if (row.done) return { state: row.step_state === "skipped" ? "skipped" : "done" };
  if (row.scheduled_for) return { state: "running" };
  if (ctx.approvalOpen.has(row.id) || (row.step_state === "awaiting_approval" && ctx.threadApprovalOpen)) return { state: "awaiting_approval", reason: "Waiting for your approval" };
  const tz = safeTimeZone(ctx.timeZone);

  if (ctx.eventDate) {
    const over = atEventOffset(ctx.eventDate, 1, 0, tz).getTime();
    if (!def.after && ctx.now >= over) return { state: "skipped", reason: "The event has already happened" };
    if (def.when?.closesDays !== undefined && ctx.now >= atEventOffset(ctx.eventDate, def.when.closesDays, 0, tz).getTime())
      return { state: "skipped", reason: "Too close to the event for this one" };
  }
  const blockers = def.dependsOn.filter((k) => { const dep = byKey.get(k); return !!dep && !dep.done && !isResolved(dep.step_state); });
  if (blockers.length) return { state: "waiting", reason: `Waiting for ${blockers.map((k) => stepDef(k)!.title).join(", ")}` };
  if (def.when) {
    if (!ctx.eventDate) return { state: "waiting", reason: "Needs the event date" };
    const at = atEventOffset(ctx.eventDate, def.when.days, def.when.hour, tz);
    if (ctx.now < at.getTime()) return { state: "waiting", reason: `Runs ${at.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` };
  }
  if (def.channel !== "none" && def.channel !== "forms" && !ctx.connected(def.channel))
    return { state: "skipped", reason: `${channelName(def.channel)} isn't connected, ready-to-paste draft is in the chat` };

  const st = row.step_state ?? "";
  if (PARKED.includes(st)) {
    // A new message from the organizer is what every parked step waits for.
    if (ctx.repliedSince.has(row.id)) return { state: "ready" };
    const run = parseStepRun(row.run_prompt);
    const nudgeDue = !!run.nudge_at && ctx.now >= Date.parse(run.nudge_at);
    if (st === "awaiting_approval") {
      // No approval is open any more: read how the last one ended instead of guessing.
      const outcome = ctx.approvalOutcome?.get(row.id);
      if (outcome === "failed") return { state: "failed", reason: NEEDS_ATTENTION };
      if (outcome === "succeeded") return { state: "ready" };
      return { state: "declined", reason: DECLINED };
    }
    if (st === "on_hold") {
      const dep = run.after ? byKey.get(run.after) : null;
      return dep && (dep.done || isResolved(dep.step_state)) ? { state: "ready" } : { state: "on_hold" };
    }
    if ((st === "awaiting_reply" || st === "waiting_on") && nudgeDue) return { state: "ready" };
    // Failed, interrupted, declined and "your pick" never replay on their own; the organizer decides.
    return { state: st as StepState };
  }
  return { state: "ready" };
}

/** One-line plan status for Civi and the chat, e.g. "Step 6 of 16, ✅ Eventbrite · ⏳ Post on X …". */
export function planStatus(rows: { step_key: string | null; title: string; step_state: string | null; done: boolean; result_url: string | null }[]): string {
  const ordered = [...rows].filter((r) => stepDef(r.step_key)).sort((a, b) => PLAN_KEYS.indexOf(a.step_key as StepKey) - PLAN_KEYS.indexOf(b.step_key as StepKey));
  const icon = (r: (typeof ordered)[number]) => r.step_state === "skipped" ? "⏭️" : r.done ? "✅" : r.step_state === "awaiting_approval" ? "🟦 approval" : r.step_state === "awaiting_reply" ? "💬 waiting on reply" : r.step_state === "waiting_on" ? "📨 waiting on an outside reply" : r.step_state === "on_hold" ? "⏸️ on hold" : r.step_state === "your_pick" ? "🗳️ organizer's pick" : r.step_state === "declined" ? "↩️ last proposal declined" : r.step_state === "interrupted" ? "⏸️ interrupted" : r.step_state === "failed" ? "⚠️ failed" : r.step_state === "ready" || r.step_state === "running" ? "⏳" : "⬜";
  return ordered.map((r, i) => `${i + 1}. ${icon(r)} ${r.title}${r.result_url ? ` (${r.result_url})` : ""}`).join("\n");
}

/** Ready-to-paste copy for a channel that isn't connected, so it never blocks the rest of the plan. */
export function skipDraft(def: StepDef, ev: { title: string; date: string | null; location: string; link: string | null }): string {
  const when = ev.date ? new Date(`${ev.date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }) : "soon";
  const where = ev.location ? ` at ${ev.location}` : "";
  const link = ev.link ? `\nRSVP: ${ev.link}` : "";
  if (def.key === "tiktok") return `Caption: Come hang out with us! ${ev.title}, ${when}${where}. Free, friendly, and all are welcome 💙${link} #community #Tucson`;
  if (def.key === "instagram") return `📅 ${ev.title}\n${when}${where}\n\nBring a friend, everyone's welcome.${link ? `\nLink in bio · ${ev.link}` : ""}\n#community #Tucson #getinvolved`;
  if (def.channel === "gmail") return `Subject: ${def.key === "thank_you" ? `Thank you for coming to ${ev.title}` : def.key.startsWith("reminder") ? `Reminder: ${ev.title} is ${def.key === "reminder_day" ? "tomorrow" : "next week"}` : `You're invited: ${ev.title}`}\n\nHi there,\n\n${def.key === "thank_you" ? `Thank you for being part of ${ev.title}. We'd love to hear how it went.` : `Join us for ${ev.title} on ${when}${where}.`}${link}\n\nSee you there!`;
  return `📅 ${ev.title}, ${when}${where}.${link}`;
}

/** Check-ins the scheduler writes into a chat on Civi's behalf; they are not the organizer replying. */
export function isAutomatedPrompt(content: string): boolean {
  return /^\[(Plan step|Resume|Research finished)\b/.test(content);
}

/** The checklist rows a new event goal starts with. */
export function planInsertRows(userId: string, goalId: string, threadId: string, eventDate: string | null, tz: string = DEFAULT_TIME_ZONE) {
  return EVENT_PLAN.map((d) => ({ user_id: userId, kind: "task", title: d.title, created_by: "civi", goal_id: goalId, thread_id: threadId, step_key: d.key, depends_on: [...d.dependsOn], trigger_at: triggerAt(d, eventDate, tz) }));
}

/** The short line a chat shows in place of an automatic check-in prompt. */
export function automatedPromptLabel(content: string): string {
  const step = content.match(/Step (\d+) of (\d+): "([^"]+)"/);
  if (step) return `Civi picked up step ${step[1]} of ${step[2]} · ${step[3]}`;
  return "Civi picked up where this left off";
}

export type EventDetails = { venue?: string; venue_details?: string; budget?: number; budget_note?: string; headcount?: number; venue_booked?: boolean };

/** Validates details Civi settled on in chat into an event-page patch; never clears a field. */
export type EventPagePatch = Partial<{ venue: string; venue_details: string; venue_status: string; budget: number; budget_notes: string; headcount: number }>;
export function eventDetailsPatch(raw: unknown, current: { venue_status?: string | null } | null): EventPagePatch {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => { const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : NaN; return Number.isFinite(n) && n >= 0 && n < 1e8 ? n : null; };
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const patch: EventPagePatch = {};
  const booked = current?.venue_status === "booked";
  const venue = str(r["venue"], 200);
  if (venue && !booked) { patch.venue = venue; if (!current?.venue_status) patch.venue_status = "searching"; }
  const details = str(r["venue_details"], 1000);
  if (details && !booked) patch.venue_details = details;
  if (r["venue_booked"] === true && (venue || booked)) patch.venue_status = "booked";
  const budget = num(r["budget"]);
  if (budget !== null) patch.budget = budget;
  const note = str(r["budget_note"], 300);
  if (note) patch.budget_notes = note;
  const head = num(r["headcount"]);
  if (head !== null) patch.headcount = Math.round(head);
  return patch;
}
