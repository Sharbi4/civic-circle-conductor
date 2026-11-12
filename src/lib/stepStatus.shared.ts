/**
 * What an event step is waiting on, in plain words: what happened, what Civi is doing about it,
 * and what (if anything) the organizer needs to do. Pure; shared by the scheduler, chat and UI.
 */
import { zonedInstant, shortDay, safeTimeZone } from "./zonedTime.shared";

type PlanKey = "essentials" | "venue" | "rsvp" | "eventbrite";
export type StepStatusMarker =
  | { state: "waiting_on"; who: string; follow_up?: string }
  | { state: "on_hold"; until: string; after?: PlanKey }
  | { state: "your_pick"; note?: string }
  | { state: "needs_answer" };

const MARKER = /\n?\[\[step_status:\s*(\{[\s\S]*?\})\s*\]\]/i;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "").slice(0, n) : "");

function afterKey(text: string): PlanKey | undefined {
  if (/venue|room|space|booking/i.test(text)) return "venue";
  if (/eventbrite|listing|ticket/i.test(text)) return "eventbrite";
  if (/rsvp|sign-?up/i.test(text)) return "rsvp";
  if (/date|budget|turnout/i.test(text)) return "essentials";
  return undefined;
}

/** Reads Civi's [[step_status: {...}]] marker, if it wrote one. */
export function parseStepStatus(text: string): StepStatusMarker | null {
  const m = text.match(MARKER);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1] ?? "") as Record<string, unknown>;
    if (v["state"] === "waiting_on" && clip(v["who"], 60)) return { state: "waiting_on", who: clip(v["who"], 60), ...(typeof v["follow_up"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v["follow_up"]) ? { follow_up: v["follow_up"] } : {}) };
    if (v["state"] === "on_hold" && clip(v["until"], 80)) {
      const until = clip(v["until"], 80);
      const after = (["essentials", "venue", "rsvp", "eventbrite"] as const).find((k) => k === v["after"]) ?? afterKey(until);
      return { state: "on_hold", until, ...(after ? { after } : {}) };
    }
    if (v["state"] === "your_pick") return { state: "your_pick", ...(clip(v["note"], 80) ? { note: clip(v["note"], 80) } : {}) };
    if (v["state"] === "needs_answer") return { state: "needs_answer" };
  } catch { /* fall through */ }
  return null;
}
export const stripStepStatus = (text: string) => text.replace(new RegExp(MARKER.source, "gi"), "");

/** When Civi forgot the marker, reads the same thing from what it wrote. Conservative: null when unsure. */
export function inferStepStatus(text: string): StepStatusMarker | null {
  const plain = text.replace(/\*\*/g, "");
  const hold = plain.match(/\b(?:hold(?:ing)?|pause|paus(?:e|ing)|keep(?:ing)?)\b[^.\n]{0,60}?\buntil\s+((?:the\s+)?[^.,;:\n]{3,60})/i);
  if (hold) { const until = clip(hold[1], 60); const after = afterKey(until); return { state: "on_hold", until, ...(after ? { after } : {}) }; }
  const wait = plain.match(/\bwaiting (?:on|for) (?:the )?((?:[A-Z0-9][\w&'’.-]*)(?:\s+(?:of\s+)?[A-Z0-9][\w&'’.-]*){0,5})/);
  if (wait && !/^(You|Your|Approval)\b/.test(wait[1] ?? "")) return { state: "waiting_on", who: clip((wait[1] ?? "").replace(/['’]s$/, ""), 60) };
  if (/\[\[choices:/.test(text)) {
    const n = (plain.match(/^\s*(?:\d+[.)]|[-*]\s+(?=[A-Z]))/gm) ?? []).length;
    const noun = /\bideas?\b/i.test(plain) ? "ideas" : "options";
    return { state: "your_pick", note: n >= 2 && n <= 9 ? `${n} ${noun} are ready in the event chat` : `${noun[0]!.toUpperCase()}${noun.slice(1)} are ready in the event chat` };
  }
  return null;
}

export type StepPatch = { step_state: "waiting_on" | "on_hold" | "your_pick"; step_note: string; run_prompt: string };
const DAY = 86_400_000;

/** Turns a step status into the saved step row: its state, its one-line note and when Civi looks again. */
export function stepStatusPatch(s: Exclude<StepStatusMarker, { state: "needs_answer" }>, now: number, tz: string): StepPatch {
  const zone = safeTimeZone(tz);
  if (s.state === "waiting_on") {
    let at: Date;
    if (s.follow_up) { const [y, m, d] = s.follow_up.split("-").map(Number); at = zonedInstant(y!, m!, d!, 9, zone); }
    else { const base = new Date(now + 3 * DAY); const [y, m, d] = base.toLocaleDateString("en-CA", { timeZone: zone }).split("-").map(Number); at = zonedInstant(y!, m!, d!, 9, zone); }
    const t = Math.min(Math.max(at.getTime(), now + DAY), now + 14 * DAY);
    return { step_state: "waiting_on", step_note: `Waiting on ${s.who} · Civi will follow up ${shortDay(t, zone)}`, run_prompt: JSON.stringify({ attempts: 0, nudge_at: new Date(t).toISOString() }) };
  }
  if (s.state === "on_hold") {
    const until = s.until.replace(/^the\s+/i, "the ");
    return { step_state: "on_hold", step_note: `On hold · Starts once ${until}`, run_prompt: JSON.stringify({ attempts: 0, nudge_at: null, after: s.after ?? null }) };
  }
  return { step_state: "your_pick", step_note: `Your pick · ${s.note ?? "Options are ready in the event chat"}`, run_prompt: JSON.stringify({ attempts: 0, nudge_at: null }) };
}

export const WAITING_FOR_ANSWER = "Waiting for your answer in the event chat";
export const checksAgainNote = (at: number, tz: string) => `Waiting to hear back · Civi checks again ${new Date(at).toLocaleString("en-US", { timeZone: safeTimeZone(tz), weekday: "short", hour: "numeric", minute: "2-digit" })}`;
export const NEEDS_ATTENTION = "Needs attention · Civi couldn't finish this step.";
export const INTERRUPTED = "Paused · Civi stopped partway.";
export const DECLINED = "You passed on Civi's last proposal.";

export type StepAction = "retry" | "resume" | "another" | "open_chat" | "copy_draft";
export type StepTone = "done" | "skipped" | "working" | "approval" | "waiting" | "attention" | "idle";

/** Older rows carry wording from before this vocabulary; read them the new way. */
function legacyNote(note: string | null | undefined): string | null {
  if (!note) return null;
  if (/^Didn.t go through|^Interrupted/.test(note)) return null;
  if (/declined or dismissed/.test(note)) return null;
  if (/^Waiting on an answer — I.ll check back/.test(note)) return "Waiting to hear back · Civi checks again soon";
  if (/^Paused until you reply/.test(note)) return WAITING_FOR_ANSWER;
  return note;
}

/** One line per step for Goals and the event page, its colour, and the buttons it offers. */
export function stepDisplay(state: string | null | undefined, done: boolean, rawNote: string | null | undefined): { text: string | null; tone: StepTone; actions: StepAction[] } {
  const note = legacyNote(rawNote);
  if (state === "skipped") {
    if (note && /isn.t connected/.test(note)) return { text: "Not connected", tone: "skipped", actions: ["copy_draft"] };
    return { text: note ? `Skipped · ${note}` : "Skipped", tone: "skipped", actions: [] };
  }
  if (done) return { text: null, tone: "done", actions: [] };
  switch (state) {
    case "ready": case "running": return { text: "Working on it", tone: "working", actions: [] };
    case "awaiting_approval": return { text: "Waiting for your approval", tone: "approval", actions: [] };
    case "awaiting_reply": return { text: note ?? WAITING_FOR_ANSWER, tone: "waiting", actions: ["open_chat"] };
    case "waiting_on": return { text: note ?? "Waiting to hear back", tone: "waiting", actions: [] };
    case "on_hold": return { text: note ?? "On hold", tone: "waiting", actions: [] };
    case "your_pick": return { text: note ?? "Your pick · Options are ready in the event chat", tone: "waiting", actions: ["open_chat"] };
    case "declined": return { text: DECLINED, tone: "attention", actions: ["another"] };
    case "interrupted": return { text: INTERRUPTED, tone: "attention", actions: ["resume"] };
    case "failed": return { text: NEEDS_ATTENTION, tone: "attention", actions: ["retry", "open_chat"] };
    default: return { text: note, tone: "idle", actions: [] };
  }
}

export const STEP_ACTION_LABEL: Record<StepAction, string> = {
  retry: "Try again", resume: "Resume", another: "Ask for another option", open_chat: "Open chat", copy_draft: "Copy draft",
};
