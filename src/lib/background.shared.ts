// Rules for the background job service that keeps each organization's work moving while nobody
// has Civi open. Every limit here exists to keep AI spend tied to real, waiting work.

/** Event that wakes one organization's background worker. */
export const WAKE_EVENT = "civi/owner.work_due";
/** How often the background sweep looks for waiting work. */
export const SWEEP_CRON = "3-59/15 * * * *";
/** Queued tasks one wake may run; the rest wait for the next sweep. */
export const RUNS_PER_WAKE = 3;
/** Browser steps one wake may drive; a browser that still has work continues on the next sweep. */
export const BROWSER_STEPS_PER_WAKE = 20;
/** Organizations one sweep may wake. */
export const MAX_OWNERS_PER_SWEEP = 50;
/** A driving browser nobody has stepped for this long has no open chat driving it. */
export const UNATTENDED_BROWSER_MS = 90_000;
const SLOT_MS = 15 * 60_000;

/** One wake per organization per 15-minute slot: a repeated sweep in the same slot is dropped as a duplicate. */
export function wakeEventId(userId: string, now = Date.now()): string {
  return `owner-work-${userId}-${Math.floor(now / SLOT_MS)}`;
}

/** Organizations with waiting work, without paused ones or duplicates, capped per sweep. */
export function ownersToWake(
  input: { queued: (string | null)[]; browsers: (string | null)[]; paused: (string | null)[] },
  max = MAX_OWNERS_PER_SWEEP,
): string[] {
  const skip = new Set(input.paused.filter(Boolean));
  const out: string[] = [];
  for (const id of [...input.queued, ...input.browsers]) {
    if (!id || skip.has(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/** True when a driving browser has no open chat stepping it, so background work should take over. */
export function browserIsUnattended(s: { driver_lease: string | null; last_step_at: string | null }, now = Date.now()): boolean {
  if (s.driver_lease && Date.parse(s.driver_lease) > now) return false;
  return !s.last_step_at || now - Date.parse(s.last_step_at) >= UNATTENDED_BROWSER_MS;
}

/** A planning review is worth an AI call only when the organizer wrote something or a task finished since the last one. */
export function reviewHasNews(lastReviewAt: string | null, latestUserMessageAt: string | null, latestTaskDoneAt: string | null): boolean {
  if (!lastReviewAt) return true;
  const since = Date.parse(lastReviewAt);
  return [latestUserMessageAt, latestTaskDoneAt].some((t) => !!t && Date.parse(t) > since);
}

/** A day with no messages and no waiting approvals gets no report. */
export function dailyReportIsQuiet(messagesToday: number, pendingApprovals: number): boolean {
  return messagesToday === 0 && pendingApprovals === 0;
}
