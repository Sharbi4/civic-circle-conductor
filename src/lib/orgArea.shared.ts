// Where an organization works, read from its own address, so drafts and searches never assume one city.

/** "Phoenix, AZ" from "1202 N 3rd St, Phoenix, AZ 85004"; null when no city and state can be read. */
export function cityState(address: string | null | undefined): string | null {
  const m = (address ?? "").match(/,\s*([A-Za-z][A-Za-z .'-]*?),\s*([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  return m ? `${m[1]!.trim()}, ${m[2]}` : null;
}

/** "#Phoenix" for a location ending in a city and state; empty when the city is unknown. */
export function cityHashtag(location: string | null | undefined): string {
  const city = cityState(location)?.split(",")[0]?.replace(/[^A-Za-z]/g, "");
  return city ? `#${city}` : "";
}

/** The area to research for an organization: its city from the address, else its ZIP, else nothing specific. */
export function researchArea(address: string | null | undefined, zip: string | null | undefined): string {
  return cityState(address) ?? (zip?.trim() || "");
}
