import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { buildCoverBytes, loadEventImage } from "@/lib/eventCover.server";
const GATEWAY = "https://connector-gateway.lovable.dev";
const SCOPES = ["openid", "profile", "w_member_social"];
const EVENT_SCOPES = ["r_events", "rw_events"];
// Company-page permissions: required to organize events under and post as a LinkedIn page.
const ORG_SCOPES = ["rw_organization_admin", "w_organization_social", "r_organization_social"];
const CONNECT_SCOPES = [...SCOPES, ...EVENT_SCOPES, ...ORG_SCOPES];
const LI_VERSION = "202609";

const addressSchema = z.object({
  line1: z.string().max(200).optional(), city: z.string().max(100).optional(),
  geographicArea: z.string().max(100).optional(), postalCode: z.string().max(20).optional(),
  country: z.string().length(2).optional(),
}).optional();

const coverFields = {
  image_prompt: z.string().max(2000).optional(),
  cover_image: z.string().max(300).optional(),
  inspiration_image: z.string().max(300).optional(),
};

const eventCreateSchema = z.object({
  kind: z.literal("linkedin_event_create"),
  title: z.string().min(1).max(255),
  start: z.string(), end: z.string(),
  description: z.string().max(5000).default(""),
  online: z.boolean().default(false),
  url: z.string().url().optional(),
  address: addressSchema,
  venue_details: z.string().max(500).optional(),
  post_text: z.string().max(3000).default(""),
  ...coverFields,
});

const eventUpdateSchema = z.object({
  kind: z.literal("linkedin_event_update"),
  event_id: z.string().regex(/^\d+$/),
  title: z.string().min(1).max(255).optional(),
  start: z.string().optional(), end: z.string().optional(),
  description: z.string().max(5000).optional(),
  url: z.string().url().optional(),
  address: addressSchema,
  venue_details: z.string().max(500).optional(),
  ...coverFields,
});

const ms = (iso: string) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`Invalid date: ${iso}`);
  return t;
};
const loc = (t: string) => ({ localized: { en_US: t } });
const rich = (t: string) => ({ localized: { en_US: { rawText: t } } });


export async function executeLinkedinApproval(supabase: SupabaseClient<Database>, userId: string, approvalId: string) {
    const { data: ap } = await supabase.from("approvals").select("status, payload").eq("id", approvalId).maybeSingle();
    if (!ap || ap.status !== "approved") throw new Error("This action isn't approved.");
    const kind = (ap.payload as { kind?: string } | null)?.kind;

    const { getConnectionForUser } = await import("@/lib/appUserConnections.server");
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const c = await getConnectionForUser(userId, "linkedin");
    if (!c) throw new Error("LinkedIn isn't connected — connect it in the Connectors tab.");
    const call = (path: string, init?: RequestInit, scopes = SCOPES) =>
      callAsAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: c.key, connectorId: "linkedin", path, ...(init ? { init } : {}), requiredScopes: scopes });
    const EVENT_ALL = [...SCOPES, ...EVENT_SCOPES];
    const ORG_ALL = [...EVENT_ALL, ...ORG_SCOPES];
    const rest = (path: string, method: string, body?: unknown, extra: Record<string, string> = {}, scopes: string[] = EVENT_ALL) =>
      call(path, {
        method,
        headers: { "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0", "LinkedIn-Version": LI_VERSION, ...extra },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }, scopes);
    const fail = async (res: Response, what: string) => {
      if (await appUserReconnectRequired(res)) throw new Error("Your LinkedIn access needs to be renewed — reconnect LinkedIn.");
      const body = await res.text();
      console.error(`LinkedIn ${what} failed [${res.status}]: ${body}`);
      let msg = "";
      try { msg = (JSON.parse(body) as { message?: string }).message ?? ""; } catch { /* not json */ }
      throw new Error(`LinkedIn couldn't ${what} [${res.status}]${msg ? `: ${msg}` : ""}`);
    };

    const { uploadLinkedInImage } = await import("@/lib/linkedinUpload.server");
    const putUpload = (uploadUrl: string, photo: { bytes: Uint8Array<ArrayBuffer>; type: string }, scopes = SCOPES) =>
      uploadLinkedInImage(uploadUrl, photo, (path, init) => call(path, init, scopes));

    const me = await call("/v2/userinfo");
    if (!me.ok) await fail(me, "look up your profile");
    const { sub } = (await me.json()) as { sub: string };
    const person = `urn:li:person:${sub}`;

    /** Registers + uploads cover bytes as a LinkedIn event background image; returns the asset URN. */
    const uploadEventCover = async (owner: string, cover: { bytes: Uint8Array<ArrayBuffer>; type: string }, scopes: string[]): Promise<string> => {
      const reg = await rest("/rest/assets?action=registerUpload", "POST", {
        registerUploadRequest: {
          owner,
          recipes: ["urn:li:digitalmediaRecipe:event-background-image"],
          serviceRelationships: [{ identifier: "urn:li:userGeneratedContent", relationshipType: "OWNER" }],
          supportedUploadMechanism: ["SYNCHRONOUS_UPLOAD"],
        },
      }, {}, scopes);
      if (!reg.ok) await fail(reg, "register the cover image");
      const v = ((await reg.json()) as { value?: { uploadMechanism?: Record<string, { uploadUrl?: string }>; asset?: string } }).value;
      const uploadUrl = v?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
      const asset = v?.asset;
      if (!uploadUrl || !asset) throw new Error("LinkedIn didn't return an upload URL for the cover image.");
      const up = await putUpload(uploadUrl, cover, scopes);
      if (!up.ok) await fail(up, "upload the cover image");
      return asset;
    };

    /** Picks/builds cover bytes from the approval payload (own upload > AI remix of inspiration > fresh AI image). */
    const buildEventCover = async (p: { title: string; description?: string | undefined; image_prompt?: string | undefined; cover_image?: string | undefined; inspiration_image?: string | undefined }) => {
      const own = await loadEventImage(supabase, userId, p.cover_image);
      const insp = own ? undefined : await loadEventImage(supabase, userId, p.inspiration_image);
      return own ?? await buildCoverBytes("LinkedIn", {
        prompt: p.image_prompt || `${p.title}. ${(p.description ?? "").replace(/<[^>]+>/g, " ").slice(0, 400)}`,
        inspiration: insp,
      });
    };

    const { data: sideThread } = await supabase.from("threads").select("id").eq("kind", "side").eq("title", "LinkedIn Agent").maybeSingle();
    const { data: main } = await supabase.from("threads").select("id").eq("kind", "main").maybeSingle();
    const threadId = sideThread?.id ?? main?.id;
    const say = async (content: string) => {
      if (threadId) await supabase.from("messages").insert({ thread_id: threadId, user_id: userId, role: "assistant", content });
    };

    if (kind === "linkedin_event_create") {
      const p = eventCreateSchema.parse(ap.payload);
      const { data: org } = await supabase.from("organizations").select("linkedin_org_id").eq("user_id", userId).maybeSingle();
      const organizer = org?.linkedin_org_id ? `urn:li:organization:${org.linkedin_org_id}` : person;
      const orgScopes = org?.linkedin_org_id ? ORG_ALL : EVENT_ALL;
      const startsAt = ms(p.start), endsAt = ms(p.end);
      if (startsAt <= Date.now()) throw new Error("The event start time must be in the future.");
      if (p.online && !p.url) throw new Error("Online events need a link where people join.");
      const type = p.online
        ? { online: { format: { external: { endsAt, url: p.url } } } }
        : { inPerson: { endsAt, ...(p.url ? { url: p.url } : {}), address: p.address ?? {}, ...(p.venue_details ? { venueDetails: rich(p.venue_details) } : {}) } };
      let backgroundImage: string | null = null;
      try {
        backgroundImage = await uploadEventCover(organizer, await buildEventCover(p), orgScopes);
      } catch (e) {
        console.error("LinkedIn event cover failed", e);
      }
      const created = await rest("/rest/events", "POST", {
        name: loc(p.title), organizer, startsAt, type,
        ...(p.description ? { description: rich(p.description) } : {}),
        ...(backgroundImage ? { backgroundImage } : {}),
      }, { "X-RestLi-Method": "create" }, orgScopes);
      if (!created.ok) await fail(created, "create the event");
      const ev = (await created.json().catch(() => ({}))) as { id?: number | string };
      const eventId = String(ev.id ?? created.headers.get("x-restli-id") ?? "");
      if (!eventId) throw new Error("LinkedIn created the event but didn't return its ID.");

      // LinkedIn events only become visible once posted.
      const post = await rest("/rest/posts", "POST", {
        author: organizer, commentary: p.post_text, visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { reference: { id: `urn:li:event:${eventId}` } },
        lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
      }, {}, orgScopes);
      const postUrn = post.ok ? post.headers.get("x-restli-id") : null;
      if (!post.ok) console.error(`LinkedIn event post failed [${post.status}]: ${await post.text()}`);
      await supabase.from("linkedin_events").insert({
        user_id: userId, event_id: eventId, name: p.title, starts_at: new Date(startsAt).toISOString(),
        location: p.online ? `Online · ${p.url}` : [p.address?.line1, p.address?.city].filter(Boolean).join(", ") || null,
        post_urn: postUrn, status: post.ok ? "live" : "unposted",
      });
      const link = `https://www.linkedin.com/events/${eventId}/`;
      await say(post.ok
        ? `✅ **${p.title}** is live on LinkedIn — [view the event](${link}).${backgroundImage ? " Custom cover image added." : "\n\n(I couldn't add a cover image this time — you can set one on the event page, or ask me to try again.)"}`
        : `⚠️ LinkedIn created **${p.title}** but wouldn't publish it${organizer.includes("organization") ? " under your company page (the app may need page-posting permission from LinkedIn)" : ""}. It stays hidden until posted — ask me to try publishing again.`);
      return { threadId, ok: post.ok };
    }

    if (kind === "linkedin_event_publish") {
      const p = z.object({ event_id: z.string().regex(/^\d+$/), post_text: z.string().max(3000).default("") }).parse(ap.payload);
      const { data: row } = await supabase.from("linkedin_events").select("name").eq("event_id", p.event_id).maybeSingle();
      if (!row) throw new Error("That event isn't one Civi created.");
      const { data: org } = await supabase.from("organizations").select("linkedin_org_id").eq("user_id", userId).maybeSingle();
      const author = org?.linkedin_org_id ? `urn:li:organization:${org.linkedin_org_id}` : person;
      const orgScopes = org?.linkedin_org_id ? ORG_ALL : EVENT_ALL;
      const post = await rest("/rest/posts", "POST", {
        author, commentary: p.post_text, visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { reference: { id: `urn:li:event:${p.event_id}` } },
        lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
      }, {}, orgScopes);
      if (!post.ok) await fail(post, "publish the event");
      await supabase.from("linkedin_events").update({ status: "live", post_urn: post.headers.get("x-restli-id"), updated_at: new Date().toISOString() }).eq("event_id", p.event_id);
      await say(`✅ **${row.name}** is now published — [view the event](https://www.linkedin.com/events/${p.event_id}/).`);
      return { threadId, ok: true };
    }

    if (kind === "linkedin_event_update") {
      const p = eventUpdateSchema.parse(ap.payload);
      const { data: row } = await supabase.from("linkedin_events").select("name").eq("event_id", p.event_id).maybeSingle();
      if (!row) throw new Error("That event isn't one Civi created.");
      const { data: orgRow } = await supabase.from("organizations").select("linkedin_org_id").eq("user_id", userId).maybeSingle();
      const orgScopes = orgRow?.linkedin_org_id ? ORG_ALL : EVENT_ALL;
      const cur = await rest(`/rest/events/${p.event_id}`, "GET", undefined, {}, orgScopes);
      if (!cur.ok) await fail(cur, "load the event");
      const evt = (await cur.json()) as { type?: { inPerson?: unknown; online?: { format?: { external?: unknown } } } };
      const set: Record<string, unknown> = {};
      if (p.title) set["name"] = loc(p.title);
      if (p.description) set["description"] = rich(p.description);
      if (p.start) set["startsAt"] = ms(p.start);
      const sub: Record<string, unknown> = {};
      if (p.end) sub["endsAt"] = ms(p.end);
      if (p.url) sub["url"] = p.url;
      if (evt.type?.inPerson) {
        if (p.address) sub["address"] = p.address;
        if (p.venue_details) sub["venueDetails"] = rich(p.venue_details);
        if (Object.keys(sub).length) set["type"] = { inPerson: sub };
      } else if (evt.type?.online?.format?.external && Object.keys(sub).length) {
        set["type"] = { online: { format: { external: sub } } };
      }
      if (p.cover_image || p.inspiration_image || p.image_prompt) {
        try {
          const { data: evRow } = await supabase.from("linkedin_events").select("name").eq("event_id", p.event_id).maybeSingle();
          const coverOwner = orgRow?.linkedin_org_id ? `urn:li:organization:${orgRow.linkedin_org_id}` : person;
          set["backgroundImage"] = await uploadEventCover(coverOwner, await buildEventCover({
            title: p.title ?? evRow?.name ?? row.name, description: p.description,
            image_prompt: p.image_prompt, cover_image: p.cover_image, inspiration_image: p.inspiration_image,
          }), orgScopes);
        } catch (e) {
          console.error("LinkedIn event cover update failed", e);
          throw new Error("Couldn't add the cover image — the event was left unchanged.");
        }
      }
      if (!Object.keys(set).length) throw new Error("No changes to apply.");
      const res = await rest(`/rest/events/${p.event_id}`, "POST", { patch: { $set: set } }, { "X-RestLi-Method": "partial_update" }, orgScopes);
      if (!res.ok) await fail(res, "update the event");
      await supabase.from("linkedin_events").update({
        ...(p.title ? { name: p.title } : {}),
        ...(p.start ? { starts_at: new Date(ms(p.start)).toISOString() } : {}),
        updated_at: new Date().toISOString(),
      }).eq("event_id", p.event_id);
      await say(`✏️ Updated **${p.title ?? row.name}** on LinkedIn — [view the event](https://www.linkedin.com/events/${p.event_id}/).${set["backgroundImage"] ? " Cover image updated." : ""}`);
      return { threadId, ok: true };
    }

    const p = z.object({ kind: z.literal("linkedin_post"), text: z.string().min(1).max(3000), image_prompt: z.string().max(1500).nullish(), image: z.string().max(300).nullish() }).parse(ap.payload);
    const { buildPostImage } = await import("@/lib/eventCover.server");
    const photo = p.image || p.image_prompt ? await buildPostImage(supabase, userId, { image: p.image ?? undefined, image_prompt: p.image_prompt ?? undefined }) : undefined;
    const { data: org } = await supabase.from("organizations").select("linkedin_org_id").eq("user_id", userId).maybeSingle();
    const asPage = !!org?.linkedin_org_id;
    let imageUrn: string | undefined;
    if (photo && asPage) {
      const init = await rest("/rest/images?action=initializeUpload", "POST", { initializeUploadRequest: { owner: `urn:li:organization:${org?.linkedin_org_id}` } }, {}, ORG_ALL);
      if (!init.ok) await fail(init, "prepare the photo");
      const v = ((await init.json()) as { value?: { uploadUrl?: string; image?: string } }).value;
      if (!v?.uploadUrl || !v.image) throw new Error("LinkedIn didn't return an upload URL for the photo.");
      const up = await putUpload(v.uploadUrl, photo, ORG_ALL);
      if (!up.ok) await fail(up, "upload the photo; your post has not been published");
      imageUrn = v.image;
    } else if (photo) {
      const reg = await call("/v2/assets?action=registerUpload", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
        body: JSON.stringify({ registerUploadRequest: { owner: person, recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          serviceRelationships: [{ identifier: "urn:li:userGeneratedContent", relationshipType: "OWNER" }], supportedUploadMechanism: ["SYNCHRONOUS_UPLOAD"] } }),
      });
      if (!reg.ok) await fail(reg, "prepare the photo");
      const v = ((await reg.json()) as { value?: { uploadMechanism?: Record<string, { uploadUrl?: string }>; asset?: string } }).value;
      const uploadUrl = v?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
      if (!uploadUrl || !v?.asset) throw new Error("LinkedIn didn't return an upload URL for the photo.");
      const up = await putUpload(uploadUrl, photo);
      if (!up.ok) await fail(up, "upload the photo; your post has not been published");
      imageUrn = v.asset;
    }
    const res = asPage
      ? await rest("/rest/posts", "POST", {
          author: `urn:li:organization:${org?.linkedin_org_id}`, commentary: p.text, visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
          ...(imageUrn ? { content: { media: { id: imageUrn } } } : {}),
        }, {}, ORG_ALL)
      : await call("/v2/ugcPosts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
          body: JSON.stringify({
            author: person,
            lifecycleState: "PUBLISHED",
            specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: p.text }, ...(imageUrn
              ? { shareMediaCategory: "IMAGE", media: [{ status: "READY", media: imageUrn }] }
              : { shareMediaCategory: "NONE" }) } },
            visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
          }),
        });
    if (!res.ok) await fail(res, "publish the post");
    const postId = res.headers.get("x-restli-id") ?? "";
    await say(`✅ Posted to LinkedIn${imageUrn ? " with photo" : ""}${asPage ? " from your company page" : ""}${postId ? ` — [view it](https://www.linkedin.com/feed/update/${postId})` : ""}.\n\n> ${p.text.slice(0, 280).replace(/\n/g, "\n> ")}`);
    return { threadId, ok: true };
}
