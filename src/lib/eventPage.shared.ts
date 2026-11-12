/**
 * Markers Civi uses to write research results onto the event page:
 * [[event_venue: {...}]], [[event_contact: {...}]], [[event_vendor: {...}]].
 * Parsing and merging are pure so chat, browser research and tests share them.
 */
type Opt<T> = T | undefined;
export type PagePerson = { name: string; role?: Opt<string>; phone?: Opt<string>; email?: Opt<string>; booked?: Opt<boolean>; url?: Opt<string>; price?: Opt<string>; status?: Opt<string> };
export type PageVenue = { name: string; address?: Opt<string>; terms?: Opt<string> };
export type EventPageMarkers = { venue: PageVenue | null; contacts: PagePerson[]; vendors: PagePerson[] };

export const VENDOR_STATUSES = ["suggested", "contacted", "quoted", "booked", "declined"] as const;
const MARKER = /\n?\[\[event_(venue|contact|vendor):\s*(\{[\s\S]*?\})\s*\]\]/g;

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : undefined);
const email = (v: unknown) => { const s = str(v, 160); return s && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s) ? s : undefined; };
const phone = (v: unknown) => { const s = str(v, 40); return s && (s.match(/\d/g) ?? []).length >= 7 ? s : undefined; };
const link = (v: unknown) => { const s = str(v, 400); return s && /^https:\/\/[^\s]+\.[^\s]+/.test(s) ? s : undefined; };
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function parseEventPageMarkers(text: string): EventPageMarkers {
  const out: EventPageMarkers = { venue: null, contacts: [], vendors: [] };
  for (const m of text.matchAll(MARKER)) {
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(m[2] ?? "") as Record<string, unknown>; } catch { continue; }
    if (!raw || typeof raw !== "object") continue;
    const name = str(raw["name"], 120);
    if (!name || name.length < 2) continue;
    if (m[1] === "venue") out.venue = clean({ name, address: str(raw["address"], 200), terms: str(raw["terms"], 800) });
    else if (m[1] === "contact") out.contacts.push(clean({ name, role: str(raw["role"], 80), phone: phone(raw["phone"]), email: email(raw["email"]) }));
    else {
      const status = str(raw["status"], 20)?.toLowerCase();
      out.vendors.push(clean({
        name, role: str(raw["type"], 80), url: link(raw["url"]), price: str(raw["price_range"] ?? raw["price"], 80),
        phone: phone(raw["phone"]), email: email(raw["email"]),
        status: status && (VENDOR_STATUSES as readonly string[]).includes(status) ? status : "suggested",
      }));
    }
  }
  out.contacts = out.contacts.slice(0, 10);
  out.vendors = out.vendors.slice(0, 15);
  return out;
}

export function stripEventPageMarkers(text: string): string {
  return text.replace(MARKER, "");
}

const key = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Adds new people and fills in missing details for known ones; never drops anyone or un-books a vendor. */
export function mergePeople(existing: PagePerson[], incoming: PagePerson[]): PagePerson[] {
  const list = existing.map((p) => ({ ...p }));
  for (const p of incoming) {
    const i = list.findIndex((x) => key(x.name) === key(p.name));
    if (i < 0) { list.push({ ...p, ...(p.status === "booked" ? { booked: true } : {}) }); continue; }
    const cur = list[i]!;
    const booked = cur.booked || cur.status === "booked";
    list[i] = { ...p, ...clean(cur), role: cur.role ?? p.role, phone: cur.phone ?? p.phone, email: cur.email ?? p.email, url: cur.url ?? p.url,
      price: p.price ?? cur.price, status: booked ? "booked" : p.status ?? cur.status, ...(booked || p.status === "booked" ? { booked: true } : {}) };
    list[i] = clean(list[i]!);
  }
  return list.slice(0, 40);
}

/** Venue fields for the event page; a venue already marked booked is never replaced. */
export function venuePagePatch(v: PageVenue | null, current: { venue_status?: string | null } | null): { venue?: string; venue_details?: string; venue_status?: string } {
  if (!v || current?.venue_status === "booked") return {};
  const details = [v.address, v.terms].filter(Boolean).join("\n");
  return { venue: v.name, ...(details ? { venue_details: details } : {}), ...(!current?.venue_status ? { venue_status: "searching" } : {}) };
}

/** One line telling the organizer what landed on the event page. */
export function savedToPageLine(parts: { venue?: string | undefined; vendors: number; contacts: number }): string | null {
  const bits = [parts.venue ? `venue (${parts.venue})` : "", parts.vendors ? `${parts.vendors} vendor${parts.vendors === 1 ? "" : "s"}` : "", parts.contacts ? `${parts.contacts} contact${parts.contacts === 1 ? "" : "s"}` : ""].filter(Boolean);
  return bits.length ? `📋 Saved to the event page: ${bits.join(", ")}.` : null;
}
