import { researchKind } from "./researchGoal.shared";
/**
 * Decides whether a finished browser research goal should hand back to the
 * organizer for the phone-fallback step (a proposed, approval-gated call).
 * Shared so the browser step loop and tests use the same rule.
 */
export function needsCallFollowUp(goal: string, summary: string): boolean {
  if (goal.startsWith("NOTIFICATION CHECK") || goal.startsWith("APPROVED")) return false;
  // Only venue goals hand back for a call; vendor or group searches never get the venue template.
  if (researchKind(goal) !== "venue") return false;
  return !/confirmed available|is available|already booked|reservation confirmed|booking confirmed/i.test(summary);
}

export const CALL_FOLLOW_UP_NOTE =
  "Do not restart browser research. Do not place a call without approval; the venue_call marker only queues an approval card. If the findings show an application or rental form, open and fill it next. Before proposing a call, ask whether to call now or put it in Approvals and confirm the callback number.";

/** Research found something that rules out the plan as asked (closed that day, too small, over budget). */
export function hasEventConflict(summary: string): boolean {
  return /\b(?:date conflict|conflicts? with the event|(?:listed|is|are|be) (?:as )?closed|closed (?:on )?(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*s?\b|too small|over (?:the )?budget|cannot be assumed available|not available on)\b/i.test(summary);
}

export const CONFLICT_FIRST_NOTE =
  "The findings show a conflict with the event as planned (for example the venue is closed on the event's day, too small or over budget). Lead with ways around it, decisively, before any call: (1) name one or two comparable accessible venues in the same part of town that are normally open on the event's day and time, marked 'to confirm' unless verified, and offer to check them in the live browser; (2) offer moving to the nearest date or time the original venue is open, using its listed hours (say exactly which day and time would work and what changes). Mention asking the venue about an exception only as the last option, and do not add a venue_call marker in this reply unless the organizer has already asked for a call. Save the venue's booking phone and email in the event_venue marker. Do not restart browser research by yourself. End with [[choices: ...]] such as Check open-Saturday venues | Move to a weekday | Ask about an exception.";
