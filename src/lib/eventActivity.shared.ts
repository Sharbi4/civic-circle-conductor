/** How event steps and executed actions read in the event page's "What Civi has done" list. */
import type { StepKey } from "./eventPlan.shared";
import { approvalKind, isRunnableApproval } from "./approvals.shared";

export type ActivityItem = { id: string; text: string; state: string; at: string; url: string | null };

export function actionForStep(s: { id: string; title: string; step_state?: string | null; step_note?: string | null; done_at: string | null; result_url?: string | null }): ActivityItem {
  // A channel that isn't connected leaves a ready-to-paste draft; anything else skipped (too late, event over) has none.
  if (s.step_state === "skipped") return { id: s.id, text: s.title, state: /isn.t connected/.test(s.step_note ?? "") ? "not_connected" : "skipped", at: s.done_at ?? "", url: null };
  return { id: s.id, text: s.title, state: "done", at: s.done_at ?? "", url: s.result_url && /^https:\/\//.test(s.result_url) ? s.result_url : null };
}

export function actionStateLabel(state: string): string {
  switch (state) {
    case "done": return "Done";
    case "not_connected": return "Not connected";
    case "skipped": return "Skipped";
    case "failed": return "Needs attention";
    case "declined": return "Declined";
    case "waiting": return "Waiting for your OK";
    default: return "In progress";
  }
}

/** The public link an executed approval saved (post, event, doc), if any. */
export function resultUrlOf(payload: unknown): string | null {
  const v = payload && typeof payload === "object" ? (payload as Record<string, unknown>)["result_url"] : null;
  return typeof v === "string" && /^https:\/\//.test(v) ? v : null;
}

/** Which event step an executed action belongs to, so its link lands on the right row. */
export function stepKeyForAction(kind: string): StepKey | null {
  switch (kind) {
    case "linkedin_post": return "linkedin_post";
    case "x_post": return "x_post";
    case "linkedin_event_create":
    case "linkedin_event_update":
    case "linkedin_event_publish": return "linkedin_event";
    case "eventbrite_create":
    case "eventbrite_publish": return "eventbrite";
    default: return null;
  }
}

/** What to write on an event step once its action really went out. */
export type StepResultPatch = {
  done?: boolean;
  done_at?: string | null;
  last_error?: string | null;
  step_state?: string | null;
  step_note?: string | null;
  scheduled_for?: string | null;
  result_url?: string | null;
};

export function stepResultPatch(step: { done?: boolean | null; result_url?: string | null }, url: string | null, now = new Date().toISOString()): StepResultPatch | null {
  // A step that already finished only needs the link it was never given; a link it has is left alone.
  if (step.done) return url && !step.result_url ? { result_url: url } : null;
  return { done: true, done_at: now, last_error: null, step_state: "done", step_note: null, scheduled_for: null, ...(url ? { result_url: url } : {}) };
}

/** An approved go-ahead with nothing left to run can never finish, so it must not read as "In progress". */
export function isDeadApproval(a: { status?: string | null; run_state?: string | null; payload?: unknown }): boolean {
  return !a.run_state && a.status === "approved" && !isRunnableApproval(approvalKind(a.payload));
}
