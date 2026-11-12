/** Rules for documents the live browser opens (rental PDFs, fee schedules, Word forms). */

export type EventFacts = { title: string; date: string | null; headcount: number | null; venue: string | null; budget: number | null; time?: string | null };

export function isDocumentUrl(url: string | null | undefined, contentType?: string | null): boolean {
  if (contentType && /application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml)/i.test(contentType)) return true;
  if (!url) return false;
  try { return /\.(pdf|docx?)$/i.test(new URL(url).pathname); } catch { return false; }
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DAY = "(sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?s?";

function dayIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 3);
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(w);
}

/** Weekday of a YYYY-MM-DD event date (0 = Sunday), or null. */
export function eventWeekday(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.getUTCDay();
}

function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Clear conflicts between a document's text and the event: closed that weekday, weekday-only hours, too small a room. */
export function documentConflicts(text: string, ev: EventFacts | null): string[] {
  if (!ev) return [];
  const out: string[] = [];
  const t = text.replace(/\s+/g, " ");
  const wd = eventWeekday(ev.date);
  if (wd !== null && ev.date) {
    const closedRe = new RegExp(`closed(?: on| every| all day)?:?\\s+((?:${DAY}(?:\\s*(?:,|and|&|/|or)\\s*)?)+)`, "gi");
    for (const m of t.matchAll(closedRe)) {
      const days = [...(m[1] ?? "").matchAll(new RegExp(DAY, "gi"))].map((d) => dayIndex(d[0]));
      if (days.includes(wd)) { out.push(`The document says it's closed on ${DAYS[wd]![0]!.toUpperCase()}${DAYS[wd]!.slice(1)}s — your event is ${longDate(ev.date)}.`); break; }
    }
    const weekdaysOnly = /\b(?:open|hours|available|reservations?)\b[^.]{0,40}\bmon(?:day)?\s*(?:-|–|—|to|through|thru)\s*fri(?:day)?\b(?![^.]{0,40}\b(?:sat|sun)(?:urday|day)?\b)/i.test(t);
    if (weekdaysOnly && (wd === 0 || wd === 6) && !out.length) out.push(`Hours listed are Monday–Friday only — your event is ${longDate(ev.date)}.`);
  }
  if (ev.headcount) {
    const cap = t.match(/\b(?:maximum (?:capacity|occupancy)|max(?:imum)?\.? (?:of )?|capacity|occupancy|seats|holds|accommodates)\D{0,20}(\d{1,5})\b/i);
    const n = cap ? Number(cap[1]) : NaN;
    if (Number.isFinite(n) && n >= 5 && n < ev.headcount) out.push(`It lists a capacity of ${n} — you're expecting ${ev.headcount}.`);
  }
  return out;
}
