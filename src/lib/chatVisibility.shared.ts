/**
 * Civi talks to itself to keep work moving (a research hand-back, a resumed or
 * scheduled step). Those turns are saved as role "system" so the model still
 * sees them, but chat never shows them as if the organizer had typed them.
 */
export const HIDDEN_ROLE = "system";

const LEGACY_PROMPT = /^\[(Research finished|Plan step|Resume)\b|^Scheduled task: [\s\S]*Do the organizing work now/;

/** True for any automatic instruction turn, including older rows saved before hidden turns existed. */
export function isHiddenTurn(m: { role: string; content: string }): boolean {
  return m.role === HIDDEN_ROLE || (m.role === "user" && LEGACY_PROMPT.test(m.content));
}

/** A short pill to show in place of a hidden turn, or null to show nothing at all. */
export function hiddenTurnLabel(content: string): string | null {
  const step = content.match(/^\[Plan step[^\n]*Step (\d+) of (\d+): "([^"]+)"/);
  if (step) return `Civi picked up step ${step[1]} of ${step[2]} — ${step[3]}`;
  if (/^\[Resume\b/.test(content)) return "Civi picked up where this left off";
  if (/^Scheduled task: /.test(content)) return `Scheduled task ran — ${content.slice(16).split("\n")[0]!.slice(0, 80)}`;
  return null;
}
