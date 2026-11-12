const SUFFIX = "(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Hwy|Highway|Cir|Circle|Ter|Terrace|Sq|Square|Trl|Trail|Loop)";
const ADDRESS = new RegExp(
  `\\b\\d{1,6}\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Z0-9][\\w'.-]*\\s+){0,4}${SUFFIX}\\.?(?:\\s+(?:#|Suite|Ste\\.?|Unit)\\s*[\\w-]+)?(?:,\\s*[A-Z][\\w .'-]+)?(?:,\\s*[A-Z]{2}(?:\\s+\\d{5}(?:-\\d{4})?)?)?`,
  "g",
);

/** Google Maps URL that shows the place with a Directions button. */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

/** Wraps street addresses in markdown links to Google Maps, leaving existing links and code alone. */
export function linkAddresses(markdown: string): string {
  return markdown.split(/(`[^`]*`|\[[^\]]*\]\([^)]*\)|https?:\/\/\S+)/g).map((seg, i) =>
    i % 2 === 1 ? seg : seg.replace(ADDRESS, (m) => `[${m}](${mapsUrl(m)})`),
  ).join("");
}
