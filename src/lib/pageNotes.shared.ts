/**
 * Page notes: what the live browser saw on each page, kept as step notes so the
 * final research summary still has every vendor's prices and contacts after the
 * browser has moved on. Pure so the browser loop and tests share it.
 */
const SEARCH_HOST = /(^|\.)(duckduckgo\.com|google\.[a-z.]+|bing\.com|search\.yahoo\.com|yahoo\.com)$/i;
const FACT = /\$\s?\d|\d+\s*(?:people|guests|persons|ppl|attendees)\b|\bper (?:person|guest|head|hour|plate)\b|\bminimum\b|\bmin\.|\bcapacity\b|\bserves?\b\s+\d|\bpackages?\b|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}|\b(?:open|closed|hours)\b/i;

export function isSearchPage(url: string): boolean {
  try { return SEARCH_HOST.test(new URL(url).hostname); } catch { return true; }
}

/** Lines from a page's full text that carry prices, minimums, capacity, hours or contact details. */
export function pageFactLines(text: string, max = 25): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 4 || line.length > 220 || !FACT.test(line)) continue;
    const k = line.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

const NOTE_PREFIX = "Notes from ";

/** One step note for the current page, or null for search results, blank pages or a page already noted on this goal. */
export function pageNote(page: { url: string; title?: string | undefined }, modelNotes: unknown, facts: string[], priorNotes: string[]): string | null {
  if (!/^https?:\/\//.test(page.url) || isSearchPage(page.url)) return null;
  const given = typeof modelNotes === "string" ? modelNotes.replace(/\s+/g, " ").trim() : "";
  if (!given && priorNotes.some((n) => n.startsWith(NOTE_PREFIX) && n.includes(` — ${page.url}:`))) return null;
  const body = given || facts.slice(0, 12).join(" · ") || "no prices or contact details shown";
  const title = (page.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "page";
  return `${NOTE_PREFIX}${title} — ${page.url}: ${body}`.slice(0, 1200);
}

export function isPageNote(note: string): boolean {
  return note.startsWith(NOTE_PREFIX);
}
