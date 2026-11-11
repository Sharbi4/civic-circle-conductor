import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { buildCoverBytes as buildCoverBytesShared, loadEventImage } from "@/lib/eventCover.server";
const API_BASE = "https://www.eventbriteapi.com/v3";
const EventPayload = z.object({
  kind: z.literal("eventbrite_create"),
  title: z.string().min(1).max(200),
  start: z.string().min(10),
  end: z.string().min(10),
  timezone: z.string().default("America/Phoenix"),
  location: z.string().default("Online"),
  capacity: z.coerce.number().int().positive().default(100),
  price: z.coerce.number().min(0).default(0),
  description: z.string().default(""),
  image_prompt: z.string().max(2000).optional(),
  cover_image: z.string().max(300).optional(),
  inspiration_image: z.string().max(300).optional(),
});

const buildCoverBytes = async (opts: Parameters<typeof buildCoverBytesShared>[1]) =>
  buildCoverBytesShared("Eventbrite", opts);

/** Uploads cover bytes to Eventbrite. Returns media id + url. */
async function createEventCover(cover: { bytes: Uint8Array<ArrayBuffer>; type: string }, eb: (path: string, init?: RequestInit) => Promise<any>) {
  const bytes = cover.bytes;
  const up = await eb("/media/upload/?type=image-event-logo");
  const form = new FormData();
  for (const [k, v] of Object.entries(up.upload_data ?? {})) form.append(k, String(v));
  form.append(up.file_parameter_name ?? "file", new Blob([bytes], { type: cover.type }), cover.type === "image/png" ? "cover.png" : "cover.jpg");
  const put = await fetch(up.upload_url, { method: "POST", body: form });
  if (!put.ok) throw new Error(`Cover upload failed [${put.status}]`);
  const { imageSize, bannerCrop } = await import("@/lib/eventCover.server");
  const size = imageSize(bytes);
  const media = await eb("/media/upload/", {
    method: "POST",
    // Crop to Eventbrite's 2:1 banner so the photo shows properly on the listing.
    body: JSON.stringify({ upload_token: up.upload_token, ...(size ? { crop_mask: bannerCrop(size.width, size.height) } : {}) }),
  });
  return { id: media.id as string, url: (media.url ?? media.original?.url) as string | undefined };
}


export async function executeEventbriteApproval(supabase: SupabaseClient<Database>, userId: string, approvalId: string) {
    const { data: ap } = await supabase.from("approvals").select("id, status, payload").eq("id", approvalId).maybeSingle();
    if (!ap || ap.status !== "approved") throw new Error("This action isn't approved.");
    const p = EventPayload.parse(ap.payload);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptToken } = await import("@/lib/tokenCrypto.server");
    const { data: conn } = await supabaseAdmin.from("connector_connections")
      .select("access_token_ciphertext").eq("user_id", userId).eq("connector", "eventbrite").maybeSingle();
    if (!conn) throw new Error("Eventbrite isn't connected — connect it in the Connectors tab.");
    const token = decryptToken(conn.access_token_ciphertext);

    const eb = async (path: string, init?: RequestInit) => {
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(`Eventbrite ${path} failed [${res.status}]`, body);
        throw new Error(`Eventbrite said: ${(body as { error_description?: string }).error_description ?? res.status}`);
      }
      return body as any;
    };
    const utc = (s: string) => new Date(s).toISOString().replace(/\.\d{3}Z$/, "Z");

    const orgs = await eb("/users/me/organizations/");
    const orgId = orgs.organizations?.[0]?.id;
    if (!orgId) throw new Error("No Eventbrite organization found on this account.");
    const online = /online|virtual|zoom/i.test(p.location);
    const desc = `${p.description}${online ? "" : `<p><b>Location:</b> ${p.location}</p>`}`;

    let cover: { id: string; url?: string | undefined } | null = null;
    try {
      const load = (path?: string) => loadEventImage(supabase, userId, path);
      const own = await load(p.cover_image);
      const insp = own ? undefined : await load(p.inspiration_image);
      const built = own ?? await buildCoverBytes({
        prompt: p.image_prompt || `${p.title}. ${p.description.replace(/<[^>]+>/g, " ")}`, inspiration: insp,
      });
      cover = await createEventCover(built, eb);
    } catch (e) {
      console.error("Event cover failed", e);
    }

    const ev = await eb(`/organizations/${orgId}/events/`, {
      method: "POST",
      body: JSON.stringify({ event: {
        name: { html: p.title },
        description: { html: desc || p.title },
        start: { timezone: p.timezone, utc: utc(p.start) },
        end: { timezone: p.timezone, utc: utc(p.end) },
        currency: "USD", online_event: online, capacity: p.capacity, listed: true,
        ...(cover ? { logo_id: cover.id } : {}),
      } }),
    });
    // Preserve the provider receipt before later steps so drafts remain addressable.
    const { error: receiptError } = await supabase.from('approvals').update({ payload: { ...p, event_id: String(ev.id) } }).eq('id', approvalId).eq('user_id', userId);
    if (receiptError) throw new Error('Eventbrite created the draft, but its receipt could not be saved. Review Eventbrite before retrying.');
    // Make sure the cover really is on the Eventbrite listing; set it again if Eventbrite dropped it.
    let coverOnListing = false;
    if (cover) {
      try {
        let check = await eb(`/events/${ev.id}/`);
        if (!check.logo_id && !check.logo) {
          await eb(`/events/${ev.id}/`, { method: "POST", body: JSON.stringify({ event: { logo_id: cover.id } }) });
          check = await eb(`/events/${ev.id}/`);
        }
        coverOnListing = !!(check.logo_id || check.logo);
        if (check.logo?.original?.url || check.logo?.url) cover.url = check.logo.original?.url ?? check.logo.url;
      } catch (e) { console.error("Cover check failed", e); }
    }
    await eb(`/events/${ev.id}/ticket_classes/`, {
      method: "POST",
      body: JSON.stringify({ ticket_class: p.price > 0
        ? { name: "General Admission", quantity_total: p.capacity, cost: `USD,${Math.round(p.price * 100)}` }
        : { name: "General Admission", quantity_total: p.capacity, free: true } }),
    });

    // Every Eventbrite event gets a linked RSVP sign-up form that shows the event details.
    let rsvpId: string | null = null;
    try {
      const { RSVP_QUESTIONS } = await import("@/lib/polls.shared");
      const { data: rsvp } = await supabase.from("polls").insert({
        user_id: userId, kind: "signup", title: `RSVP: ${p.title}`,
        description: "Let us know you're coming — it takes less than a minute.",
        questions: RSVP_QUESTIONS as never,
        event: { title: p.title, start: p.start, end: p.end, timezone: p.timezone, location: p.location, url: ev.url, ...(cover?.url ? { image: cover.url } : {}) } as never,
      }).select("id").single();
      rsvpId = rsvp?.id ?? null;
    } catch (e) { console.error("RSVP form failed", e); }

    const { data: thread } = await supabase.from("threads").select("id").eq("kind", "side").eq("title", "Eventbrite Agent").maybeSingle();
    const { data: main } = await supabase.from("threads").select("id").eq("kind", "main").maybeSingle();
    const threadId = thread?.id ?? main?.id;
    if (threadId) {
      await supabase.from("messages").insert({
        thread_id: threadId, user_id: userId, role: "assistant",
        content: `🎉 Created **${p.title}** on Eventbrite as a draft.${coverOnListing ? `\n\n${p.cover_image ? "Your photo is the cover on the Eventbrite listing:" : "Cover image on the Eventbrite listing:"}${cover?.url ? `\n\n![Event cover](${cover.url})` : ""}` : cover ? "\n\n(I uploaded the cover, but Eventbrite didn't attach it — add it from the event's Images section on Eventbrite.)" : `\n\n(I couldn't ${p.cover_image ? "upload your photo" : "make a cover image"} this time — you can add one on Eventbrite.)`}\n\n- [Review & publish it on Eventbrite](https://www.eventbrite.com/myevent?eid=${ev.id})\n- Public page (live after you publish): ${ev.url}${rsvpId ? `\n- 📋 RSVP sign-up with the event details: [open it](/p/${rsvpId}) · share link https://civimeet.com/p/${rsvpId} (replies show under **Polls**)` : ""}`,
      });
    }
    // The event exists — automatically start the launch chain (LinkedIn event, Facebook event, share posts,
    // calendar link, group outreach) with per-step tasks and connect/skip prompts for missing platforms.
    const { startEventLaunchChain } = await import("@/lib/eventLaunch.server");
    await startEventLaunchChain(supabase, userId, {
      title: p.title, start: p.start, end: p.end, timezone: p.timezone, location: p.location,
      description: p.description, url: ev.url as string, rsvpId, threadId: threadId ?? null,
    });
    return { eventId: ev.id as string, url: ev.url as string, threadId };
}
