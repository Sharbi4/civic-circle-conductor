/**
 * Civi never writes long dashes. A dash used as a pause becomes a comma; a dash in a number or time
 * range ("6–8 pm") becomes a plain hyphen. Real hyphens ("follow-up") are left alone.
 * Used on everything Civi writes before it's saved or sent, and on older text when it's shown.
 */
export function noLongDashes(text: string): string {
  if (!text || !/[—–]/.test(text)) return text;
  return text
    // Ranges: 6–8, 9:00–11:00, Dec 9–11 → hyphen.
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    // A dash standing alone as a list bullet or sign-off ("— Shawnna") at the start of a line.
    .replace(/^([ \t>*_]*)[—–][ \t]*/gm, "$1")
    // Trailing dash at the end of a line ("Next steps —").
    .replace(/[ \t]*[—–][ \t]*$/gm, "")
    // Right after other punctuation, the dash adds nothing: "Done. — next" → "Done. next".
    .replace(/([.,:;!?(])[ \t]*[—–][ \t]*/g, "$1 ")
    // Before closing punctuation: "word —)" → "word)".
    .replace(/[ \t]*[—–][ \t]*([),.;:!?])/g, "$1")
    // Before closing bold/italics: "**Next steps —**" → "**Next steps**".
    .replace(/[ \t]*[—–][ \t]*(\*\*|__|\*|_)(?=\s|$)/gm, "$1")
    // Everything else is a pause → comma.
    .replace(/[ \t]*[—–][ \t]*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\( /g, "(");
}

/** The writing rule every Civi prompt carries, so the model avoids long dashes in the first place. */
export const NO_DASHES_RULE =
  "PUNCTUATION: never use em dashes (—) or en dashes (–) in anything you write: chat replies, posts, emails, documents, step notes or headings. Where you'd use a dash as a pause, use a comma (or a period or colon if a comma doesn't fit). Use a plain hyphen only inside real hyphenated words (follow-up, sign-up, 25-30 people, 6-8 pm).";

/** Adds the no-dashes writing rule to a model's instructions. */
export const withNoDashes = (instructions: string): string => `${instructions}\n\n${NO_DASHES_RULE}`;
