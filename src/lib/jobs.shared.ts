export const JOB_CADENCE = { scheduler: "*/15 * * * *", recovery: "*/30 * * * *", reports: "0 7 * * *" } as const;
export function recoveryDecision(run: { phase: string; attempt: number }) {
  if (run.phase !== "not_started" && run.phase !== "claimed") return "needs_review";
  return run.attempt < 3 ? "queued" : "failed";
}
export function nextTaskOccurrence(from: string, repeat: string | null): string | null {
  if (!repeat) return null;
  const d = new Date(from);
  if (repeat === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (repeat === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (repeat === "biweekly") d.setUTCDate(d.getUTCDate() + 14);
  else if (repeat === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else return null;
  return d.toISOString();
}