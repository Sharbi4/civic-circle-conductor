// Rules for the background job service that keeps each organization's work moving while nobody
// has Civi open. Every limit here exists to keep AI spend tied to real, waiting work.

/** Event that wakes one organization's background worker. */
export const WAKE_EVENT = "civi/owner.work_due";
/** Event that runs a shared job's bookkeeping (scheduler, recovery, reports) in the background service. */
export const SHARED_JOB_EVENT = "civi/shared-job.due";
export type SharedJobKind = "scheduler" | "recovery" | "reports";
/** Backup check, 7 minutes after each scheduler tick, in case a tick never reached the background service. */
export const SCHEDULER_BACKUP_CRON = "7-59/15 * * * *";
/** The backup does nothing when the scheduler finished this recently. */
export const SCHEDULER_FRESH_MS = 10 * 60_000;

/** True when the backup check should run the scheduler because the last tick didn't finish recently. */
export function schedulerNeedsBackup(lastCompletedAt: string | null, now = Date.now()): boolean {
  return !lastCompletedAt || now - Date.parse(lastCompletedAt) > SCHEDULER_FRESH_MS;
}
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

/** One background run per shared job per 15-minute slot, however many callers ask for it. */
export function sharedJobEventId(kind: SharedJobKind, now = Date.now()): string {
  return `shared-${kind}-${Math.floor(now / SLOT_MS)}`;
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

/** Pause reasons saved when the AI or a provider stops background work. */
export const PAUSE_CREDITS = "AI or browser credits exhausted";
export const PAUSE_ACCESS = "Provider access denied, restore access before resuming";
export const PAUSE_RATE = "Rate limited, background work paused for review";

/** Credit and rate-limit pauses may be tested with one task per sweep; an access denial waits for the owner. */
export function pauseCanProbe(reason: string | null | undefined): boolean {
  return reason === PAUSE_CREDITS || reason === PAUSE_RATE;
}

/** Paused organizations that have waiting work and may try one task to see if they can resume. */
export function ownersToProbe(queued: (string | null)[], paused: { user_id: string | null; paused_reason: string | null }[], max = MAX_OWNERS_PER_SWEEP): string[] {
  const waiting = new Set(queued.filter(Boolean));
  return [...new Set(paused.filter((p) => p.user_id && waiting.has(p.user_id) && pauseCanProbe(p.paused_reason)).map((p) => p.user_id as string))].slice(0, max);
}

/** Internal jobs whose outcome is known when the AI refuses before answering, so they can simply run again later. */
export function rerunAfterQuotaStop(jobKind: string | null | undefined): boolean {
  return jobKind === "review" || jobKind === "daily_report";
}

/** Plain words for the owner about why background work is paused. */
export function pauseMessage(reason: string | null | undefined): string | null {
  if (!reason) return null;
  if (reason === PAUSE_CREDITS) return "Civi paused its background work because the AI balance ran out. Add AI balance in your workspace settings, then press Resume. Civi also checks again every 15 minutes.";
  if (reason === PAUSE_ACCESS) return "Civi paused its background work because a connected service refused access. Reconnect that service, then press Resume.";
  if (reason === PAUSE_RATE) return "Civi paused its background work because too many requests went out at once. It tries again on its own within 15 minutes.";
  return "Civi paused its background work. Press Resume when you're ready for it to continue.";
}
