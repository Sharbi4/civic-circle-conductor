import { EVENT_PLAN, PLAN_KEYS, keyForTitle, stepDef, type StepKey } from "./eventPlan.shared";

// Plain-language checklist every event goal starts with, in the order Civi works it.
export const EVENT_STEPS = EVENT_PLAN.map((s) => s.title);

// Short descriptions shown under each step. Steps are completed by Civi, not ticked by the user.
export function stepInfo(title: string, key?: string | null): string | null {
  return stepDef(key ?? keyForTitle(title))?.info ?? null;
}
export function isEssentialsStep(title: string, key?: string | null): boolean {
  return (key ?? keyForTitle(title)) === "essentials";
}
export function sortSteps<T extends { title: string; created_at: string; step_key?: string | null }>(steps: T[]): T[] {
  const idx = (t: T) => { const i = PLAN_KEYS.indexOf((t.step_key ?? keyForTitle(t.title)) as StepKey); return i < 0 ? 99 : i; };
  return [...steps].sort((a, b) => idx(a) - idx(b) || a.created_at.localeCompare(b.created_at));
}

/** Human label for a step's live state, shown under the step in Goals and on the event page. */
export function stepStateLabel(state: string | null | undefined, done: boolean): string | null {
  if (state === "skipped") return "Skipped";
  if (done) return null;
  switch (state) {
    case "ready": case "running": return "Working on it";
    case "awaiting_approval": return "Waiting for your approval";
    case "awaiting_reply": return "Waiting on a reply";
    case "failed": return "Didn't go through";
    default: return null;
  }
}
