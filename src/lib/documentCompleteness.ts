// What a finished document must contain. Pure rules shared by document creation and its tests.

export type DocKind = "agenda" | "letter" | "checklist" | "budget" | "status" | "report";

export function docKind(kind: string, title: string): DocKind {
  const t = `${kind} ${title}`.toLowerCase();
  if (/daily report|status update|weekly report/.test(t)) return "status";
  if (/agenda|run of show|run-of-show|itinerary|schedule/.test(t)) return "agenda";
  if (/budget|cost|estimate/.test(t)) return "budget";
  if (/checklist|to-?do|setup list/.test(t)) return "checklist";
  if (/letter|invitation|invite|announcement|communication|press release|flyer|email/.test(t)) return "letter";
  return "report";
}

export const MIN_WORDS: Record<DocKind, number> = { letter: 200, agenda: 380, checklist: 320, budget: 220, status: 220, report: 750 };

export const KIND_REQUIREMENTS: Record<DocKind, string> = {
  agenda: "Event details block (event name, day and date, start and end time, full venue address, host organization); purpose and intended outcomes; a timed agenda TABLE (Time | Segment | Lead | Details) covering the whole event from setup to cleanup in realistic increments; roles and responsibilities table; materials and room setup checklist; accessibility, parking and safety notes; contingency plan (late start, low turnout, venue issue); follow-up actions table (Action | Owner | Due | Success measure).",
  letter: "A complete, ready-to-send piece: subject or headline, warm greeting, what/when/where with the full date, time and address, why it matters to this community, what attendees can expect, how to RSVP or respond (real link if supplied), accessibility and parking information, a named contact with real email or phone from the organization record, and a sign-off with the real sender name and organization.",
  checklist: "Grouped sections (e.g. Planning, Promotion, Logistics, Day-of, Follow-up), each item as '- [ ]' with an owner role and a due date or timing relative to the event, plus a short purpose line per section and a final 'Done means' definition.",
  budget: "A line-item TABLE (Item | Quantity | Unit cost | Estimate | Notes) with a total row, assumptions, labeled estimates versus confirmed costs, cost-saving options, and approval/next steps.",
  status: "Summary of the day, progress by event or goal, what went out (with real links supplied), what is waiting on approval or replies, risks or blockers, and prioritized next steps for tomorrow.",
  report: "Executive summary, purpose and scope, developed findings, implications for the organization, prioritized recommendations, a next-step table (Action | Responsible role | Timing | Success measure), risks and open questions, and sources.",
};

const PLACEHOLDER = /\[(?:name|date|time|venue|address|insert[^\]]*|your [^\]]*|organization[^\]]*|contact[^\]]*|link)\]|_{3,}|\bTBD\b|\bTBA\b|\binsert (?:here|name|date)\b|lorem ipsum|\bXX:XX\b/i;

export function wordCount(body: string) {
  return body.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/[#*|`>-]/g, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Reasons a document isn't finished yet; empty when it's ready to save. */
export function documentGaps(kind: string, title: string, body: string): string[] {
  const k = docKind(kind, title);
  const gaps: string[] = [];
  const words = wordCount(body);
  if (words < MIN_WORDS[k]) gaps.push(`too short (${words} words; a finished ${k} needs at least ${MIN_WORDS[k]})`);
  const ph = body.match(PLACEHOLDER);
  if (ph) gaps.push(`contains a placeholder ("${ph[0]}")`);
  const headings = (body.match(/^#{2,3} /gm) ?? []).length;
  if (k !== "letter" && headings < 3) gaps.push("needs at least three ## sections");
  if ((k === "agenda" || k === "budget") && !/^\s*\|.+\|\s*$/m.test(body)) gaps.push(`needs a ${k === "agenda" ? "timed agenda" : "line-item"} table`);
  if (/photography note|could not be retrieved|no generated or unverified image/i.test(body)) gaps.push("contains a note about a missing photo");
  return gaps;
}

/** A document is never saved with an empty picture slot. */
export function hasDocumentImage(body: string) {
  return /!\[[^\]]*\]\(document-photo:[^)]+\)/.test(body);
}
