// Quick-reply buttons Civi adds at the end of a reply: [[choices: A | B | C]].
// Models sometimes write a JSON list instead ([[choices: ["A", "B"]]]); both must render as buttons, never raw text.
import { plainChoice } from "./browserProgress.shared";

const MARKER_SOURCE = String.raw`\[\[choices:\s*(\[[^\]]*\]|[^\]]*?)\s*\]\]`;
export const CHOICES_MARKER = new RegExp(MARKER_SOURCE);
const ALL_MARKERS = new RegExp(MARKER_SOURCE, "g");

function rawItems(raw: string): string[] {
  const s = raw.trim();
  if (s.startsWith("[")) {
    try {
      const v: unknown = JSON.parse(s.endsWith("]") ? s : `${s}]`);
      if (Array.isArray(v)) return v.map((x) => String(x));
    } catch { /* not valid JSON, fall back to splitting */ }
    const inner = s.replace(/^\[/, "").replace(/\]$/, "");
    return inner.split(inner.includes("|") ? "|" : ",");
  }
  return s.split("|");
}

/** The button labels in a reply, or null when it has no quick replies. */
export function choicesIn(text: string): string[] | null {
  const m = text.match(CHOICES_MARKER);
  if (!m) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of rawItems(m[1] ?? "")) {
    const label = plainChoice(item.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")).trim();
    if (label && !seen.has(label)) { seen.add(label); out.push(label); }
  }
  return out.length ? out : null;
}

/** The reply text without any quick-reply markers. */
export function stripChoices(text: string): string {
  return text.replace(ALL_MARKERS, "");
}
