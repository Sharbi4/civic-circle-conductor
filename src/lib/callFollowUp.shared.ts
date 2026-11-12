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
