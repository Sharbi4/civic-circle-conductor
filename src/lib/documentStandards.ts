export const DOCUMENT_STANDARD = `ENTERPRISE DOCUMENT STANDARD — applies to every agent and every formal deliverable:
Create a substantive, decision-ready document specific to this organization, its mission, audience and the actual request. Never save a thin generic summary as a finished report. For reports, community spotlights, briefs and strategic plans, aim for 900–1,600 words when evidence supports it, with an executive summary, purpose and scope, thoroughly developed findings, implications for the organization, prioritized recommendations, an actionable next-step table (action, responsible role, timing and success measure), risks and open questions, and sources. Scale letters, agendas, budgets and checklists to their actual purpose rather than padding them to a report length. Use clear professional headings, concise substantive paragraphs, comparison tables, evidence and precise operational detail. Distinguish verified facts, proposals and unknowns. Never fabricate quotes, metrics, partnerships, availability, prices or research; cite actual supplied or retrieved sources at the claim level and in a sources section. If research is unavailable, mark the document as a draft with evidence gaps and practical verification steps, not a completed investigation.
PHOTOGRAPHY: the app sources and stores real, openly licensed photographs with captions and source/license credit. Never invent remote image URLs or embed generated images as documentary evidence. If an exact subject photo isn't available, accept explicitly labeled contextual photography or ask for the organization's own photos; never suggest it shows actual attendees or a confirmed partner. Acknowledge if real photography could not be retrieved. No decorative emoji, fake testimonials, filler, blank placeholders or repeated introductory copy.`;

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