export const DOCUMENT_STANDARD = `ENTERPRISE DOCUMENT STANDARD — applies to every agent and every formal deliverable:
Create a substantive, decision-ready document specific to this organization, its mission, audience and the actual request. Never save a thin generic summary as a finished report. For reports, community spotlights, briefs and strategic plans, aim for 900–1,600 words when evidence supports it, with an executive summary, purpose and scope, thoroughly developed findings, implications for the organization, prioritized recommendations, an actionable next-step table (action, responsible role, timing and success measure), risks and open questions, and sources. Scale letters, agendas, budgets and checklists to their actual purpose rather than padding them to a report length. Use clear professional headings, concise substantive paragraphs, comparison tables, evidence and precise operational detail. Distinguish verified facts, proposals and unknowns. Never fabricate quotes, metrics, partnerships, availability, prices or research; cite actual supplied or retrieved sources at the claim level and in a sources section. If research is unavailable, say which facts still need confirming inside the relevant section and give practical verification steps — the document itself is still complete.
COMPLETENESS: every document is finished when saved — every section fully written with real organization and event details, nothing for the organizer to fill in, no "draft" sections or placeholders. Where a detail isn't known, give a clear recommendation labeled "(recommended)" or "(to confirm)".
PHOTOGRAPHY: the app adds a real, openly licensed photograph with credit, or when none fits, a clearly labeled illustration Civi creates — every document has one. Never write image tags, invent image URLs or add notes about photos yourself, and never suggest an image shows actual attendees or a confirmed partner. No decorative emoji, fake testimonials, filler, blank placeholders or repeated introductory copy.`;

export function documentPhotoQuery(title: string, body: string) {
  const location = body.match(/\b(Tucson|Phoenix|Arizona|Chicago|Seattle|Boston|Denver|Atlanta|Detroit|Philadelphia|San Francisco|New York)\b/i)?.[0];
  return location ? `${location} city` : title.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).slice(0, 6).join(" ");
}

export function safeWikimediaPhoto(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname) && !url.username && !url.password && /\.(jpe?g|png|webp)$/i.test(url.pathname);
  } catch { return false; }
}

export function reusablePhotoLicense(value: string) {
  return /^(CC BY(?:-SA)? [\d.]+|CC0(?: [\d.]+)?|Public domain)$/i.test(value.trim());
}

const GENERIC = new Set("the a an and or of for to in on at with by from our your this that dec nov oct jan feb mar apr may jun jul aug sep sept run show agenda plan report brief letter invitation invite announcement checklist budget daily document update spotlight community meetup meeting event volunteer volunteers tucson arizona phoenix city connections exploring opportunities engagement".split(" "));

/** Distinctive words in a document title (places, programs) a real photo must match to be relevant. */
export function photoSubjectWords(title: string): string[] {
  return [...new Set(title.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter((w) => w.length > 3 && !/^\d+$/.test(w) && !GENERIC.has(w)))];
}

/** A contextual photo is only used when its own title names the document's subject; otherwise Civi illustrates it. */
export function photoMatchesSubject(photoTitle: string, words: string[]): boolean {
  const t = photoTitle.toLowerCase();
  return words.length > 0 && words.some((w) => t.includes(w));
}
