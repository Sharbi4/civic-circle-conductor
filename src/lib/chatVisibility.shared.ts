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
  if (step) return `Civi picked up step ${step[1]} of ${step[2]} · ${step[3]}`;
  if (/^\[Resume\b/.test(content)) return "Civi picked up where this left off";
  if (/^Scheduled task: /.test(content)) return `Scheduled task ran · ${content.slice(16).split("\n")[0]!.slice(0, 80)}`;
  return null;
}

/**
 * Which "Civi picked up …" pills to show: only those followed by something Civi actually said or did,
 * and never the same pill twice in a row. Pickups that produced nothing are just clutter.
 */
export function pillsToShow(messages: { id: string; role: string; content: string }[]): Set<string> {
  const show = new Set<string>();
  let lastShown: string | null = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (!isHiddenTurn(m)) { if (m.role === "user") lastShown = null; continue; }
    const label = hiddenTurnLabel(m.content);
    const next = messages[i + 1];
    if (!label || !next || isHiddenTurn(next) || next.role !== "assistant") continue;
    if (label === lastShown) continue;
    show.add(m.id);
    lastShown = label;
  }
  return show;
}

/** Step headings Civi wrote the old way ("🔁 Step 5 of 16 — LinkedIn event") read as "Step 5 of 16 · LinkedIn event". */
export function tidyStepHeading(content: string): string {
  return content
    .replace(/^(\**)🔁\s*/gm, "$1")
    .replace(/^(\**)(Step \d+ of \d+)\s+—\s+/gm, "$1$2 · ");
}
