/** Back-off for resuming a stalled event step: 30 min, 2 h, 6 h, 1 day, then pause and wait for the organizer. */
const DELAYS = [30, 120, 360, 1440];
export function resumeDelayMinutes(attempts: number): number | null {
  return attempts >= 0 && attempts < DELAYS.length ? DELAYS[attempts]! : null;
}
/** Only resume when the chat has been quiet long enough that Civi is not mid-conversation. */
export function chatIsIdle(lastMessageAt: string | null | undefined, now = Date.now(), minutes = 30): boolean {
  if (!lastMessageAt) return true;
  return now - new Date(lastMessageAt).getTime() >= minutes * 60000;
}
export function parseResumeState(raw: string | null | undefined): { attempts: number; [k: string]: unknown } {
  try { const v = JSON.parse(raw ?? "{}"); return { ...v, attempts: Number.isFinite(v?.attempts) ? Number(v.attempts) : 0 }; }
  catch { return { attempts: 0 }; }
}
