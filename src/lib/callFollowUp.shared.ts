/**
 * Decides whether a finished browser research goal should hand back to the
 * organizer for the phone-fallback step (a proposed, approval-gated call).
 * Shared so the browser step loop and tests use the same rule.
 */
export function needsCallFollowUp(goal: string, summary: string): boolean {
  if (goal.startsWith("NOTIFICATION CHECK") || goal.startsWith("APPROVED")) return false;
  if (!/availab|book|venue|room|reservation/i.test(goal)) return false;
  return !/confirmed available|is available|already booked|reservation confirmed|booking confirmed/i.test(summary);
}

export const CALL_FOLLOW_UP_NOTE =
  "Do not restart browser research. Do not place a call without approval; the venue_call marker only queues an approval card.";
