import type { SupabaseClient } from "@supabase/supabase-js";
import { mergePeople, savedToPageLine, venuePagePatch, type EventPageMarkers, type PagePerson } from "./eventPage.shared";

type Db = Pick<SupabaseClient, "from">;

/** Writes venue, contacts and vendors Civi found onto the event page for this chat's event. Returns a chat line, or null. */
export async function applyEventPageMarkers(db: Db, userId: string, threadId: string, marks: EventPageMarkers): Promise<string | null> {
  if (!marks.venue && !marks.contacts.length && !marks.vendors.length) return null;
  try {
    const { data: goal } = await db.from("tasks").select("id").eq("thread_id", threadId).eq("user_id", userId).eq("kind", "goal").order("created_at").limit(1).maybeSingle();
    if (!goal) return null;
    const { data: cur } = await db.from("event_profiles").select("goal_id, venue_status, contacts, vendors").eq("goal_id", goal.id).maybeSingle();
    const venue = venuePagePatch(marks.venue, cur);
    const patch: Record<string, unknown> = { ...venue, updated_at: new Date().toISOString() };
    const oldVendors = (Array.isArray(cur?.vendors) ? cur.vendors : []) as PagePerson[];
    const oldContacts = (Array.isArray(cur?.contacts) ? cur.contacts : []) as PagePerson[];
    if (marks.vendors.length) patch["vendors"] = mergePeople(oldVendors, marks.vendors);
    if (marks.contacts.length) patch["contacts"] = mergePeople(oldContacts, marks.contacts);
    const { error } = cur
      ? await db.from("event_profiles").update(patch).eq("goal_id", goal.id).eq("user_id", userId)
      : await db.from("event_profiles").insert({ goal_id: goal.id, user_id: userId, ...patch });
    if (error) { console.error("Event page save failed", error.message); return null; }
    return savedToPageLine({ venue: venue.venue, vendors: marks.vendors.length, contacts: marks.contacts.length });
  } catch (e) { console.error("Event page markers failed", e instanceof Error ? e.message : e); return null; }
}
