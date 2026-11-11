/** Server-only: fetch the organizer's recent + upcoming Eventbrite events so Civi can offer them by name. */
export type EbEvent = { id: string; name: string; start: string | null; status: string; url: string; venue: string | null };

export async function listEventbriteEvents(ciphertext: string): Promise<EbEvent[]> {
  const { decryptToken } = await import("@/lib/tokenCrypto.server");
  const token = decryptToken(ciphertext);
  const get = async (path: string) => {
    const r = await fetch(`https://www.eventbriteapi.com/v3${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Eventbrite ${r.status}`);
    return r.json() as Promise<any>;
  };
  const orgs = await get("/users/me/organizations/");
  const orgId = orgs.organizations?.[0]?.id;
  if (!orgId) return [];

  const res = await get(`/organizations/${orgId}/events/?order_by=start_asc&page_size=20&expand=venue&time_filter=current_future`);
  return (res.events ?? []).map((e: any) => ({
    id: String(e.id), name: e.name?.text ?? "Untitled", start: e.start?.local ?? null, status: e.status ?? "",
    url: e.url ?? "", venue: e.online_event ? "Online" : [e.venue?.name, e.venue?.address?.localized_address_display].filter(Boolean).join(", ") || null,
  }));
}
