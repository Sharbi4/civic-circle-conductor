/** How event steps and executed actions read in the event page's "What Civi has done" list. */
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
