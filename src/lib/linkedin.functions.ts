import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev";
const SCOPES = ["openid", "profile", "w_member_social"];
const EVENT_SCOPES = ["r_events", "rw_events"];
const CONNECT_SCOPES = [...SCOPES, ...EVENT_SCOPES];
const LI_VERSION = "202609";

export const startLinkedInConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env["LINKEDIN_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("LinkedIn isn't set up yet.");
    const request = getRequest();
    if (!request) throw new Error("LinkedIn connect must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/api/oauth/linkedin/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY, connectorId: "linkedin", appUserId: context.userId,
      clientAPIKey: clientKey, returnUrl, credentialsConfiguration: { scopes: CONNECT_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeLinkedInConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode, callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY, data.code);
    if (connectorId !== "linkedin") throw new Error("LinkedIn connect returned the wrong connector");
    const me = await callAsAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey, connectorId, path: "/v2/userinfo", requiredScopes: SCOPES });
    const profile = me.ok ? ((await me.json()) as { name?: string }) : {};
    const accountName = profile.name ?? "LinkedIn account";
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey, accountName);

    const { supabase, userId } = context;
    const { data: existing } = await supabase.from("threads").select("id").eq("kind", "side").eq("title", "LinkedIn Agent").maybeSingle();
    let threadId = existing?.id as string | undefined;
    if (!threadId) {
      const { data: t, error } = await supabase.from("threads").insert({ user_id: userId, kind: "side", title: "LinkedIn Agent" }).select("id").single();
      if (error) throw error;
      threadId = t.id;
      await supabase.from("messages").insert({
        thread_id: threadId, user_id: userId, role: "assistant",
        content: `I'm your **LinkedIn agent**, connected to **${accountName}**. I can write and share posts about your events and wins — every post waits for your approval first. What should we share?`,
      });
    }
    return { accountName, threadId };
  });

export const getLinkedInStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser } = await import("@/lib/appUserConnections.server");
    const c = await getConnectionForUser(context.userId, "linkedin");
    const { data: org } = await context.supabase.from("organizations").select("linkedin_org_id").eq("user_id", context.userId).maybeSingle();
    return { connected: !!c, accountName: c?.accountName ?? null, orgPageId: org?.linkedin_org_id ?? null };
  });

export const disconnectLinkedIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser, deleteConnectionForUser } = await import("@/lib/appUserConnections.server");
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const c = await getConnectionForUser(context.userId, "linkedin");
    if (c) {
      try { await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: c.key, connectorId: "linkedin" }); }
      catch (e) { console.error("LinkedIn disconnect", e); }
      await deleteConnectionForUser(context.userId, "linkedin");
    }
    return { ok: true };
  });

/** Saves the LinkedIn company page ID that events are organized under. */
export const setLinkedInOrgPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orgPageId: z.string().trim().regex(/^\d{1,20}$/, "Use the number from your page's admin URL").or(z.literal("")) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("organizations")
      .update({ linkedin_org_id: data.orgPageId || null }).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const addressSchema = z.object({
  line1: z.string().max(200).optional(), city: z.string().max(100).optional(),
  geographicArea: z.string().max(100).optional(), postalCode: z.string().max(20).optional(),
  country: z.string().length(2).optional(),
}).optional();

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
});

const ms = (iso: string) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`Invalid date: ${iso}`);
  return t;
};
const loc = (t: string) => ({ localized: { en_US: t } });
const rich = (t: string) => ({ localized: { en_US: { rawText: t } } });

/** Runs an approved LinkedIn action: member post, event create+publish, or event edit. */
export const runLinkedInApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ approvalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ap } = await supabase.from("approvals").select("status, payload").eq("id", data.approvalId).maybeSingle();
    if (!ap || ap.status !== "approved") throw new Error("This action isn't approved.");
    const kind = (ap.payload as { kind?: string } | null)?.kind;

    const { getConnectionForUser } = await import("@/lib/appUserConnections.server");
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const c = await getConnectionForUser(userId, "linkedin");
    if (!c) throw new Error("LinkedIn isn't connected — connect it in the Connectors tab.");
    const call = (path: string, init?: RequestInit, scopes = SCOPES) =>
      callAsAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: c.key, connectorId: "linkedin", path, ...(init ? { init } : {}), requiredScopes: scopes });
    const rest = (path: string, method: string, body?: unknown, extra: Record<string, string> = {}) =>
      call(path, {
        method,
        headers: { "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0", "LinkedIn-Version": LI_VERSION, ...extra },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }, [...SCOPES, ...EVENT_SCOPES]);
    const fail = async (res: Response, what: string) => {
      if (await appUserReconnectRequired(res)) throw new Error("Your LinkedIn access needs to be renewed — reconnect LinkedIn.");
      const body = await res.text();
      console.error(`LinkedIn ${what} failed [${res.status}]: ${body}`);
      let msg = "";
      try { msg = (JSON.parse(body) as { message?: string }).message ?? ""; } catch { /* not json */ }
      throw new Error(`LinkedIn couldn't ${what} [${res.status}]${msg ? `: ${msg}` : ""}`);
    };

    const me = await call("/v2/userinfo");
    if (!me.ok) await fail(me, "look up your profile");
    const { sub } = (await me.json()) as { sub: string };
    const person = `urn:li:person:${sub}`;

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
      const startsAt = ms(p.start), endsAt = ms(p.end);
      if (startsAt <= Date.now()) throw new Error("The event start time must be in the future.");
      if (p.online && !p.url) throw new Error("Online events need a link where people join.");
      const type = p.online
        ? { online: { format: { external: { endsAt, url: p.url } } } }
        : { inPerson: { endsAt, ...(p.url ? { url: p.url } : {}), address: p.address ?? {}, ...(p.venue_details ? { venueDetails: rich(p.venue_details) } : {}) } };
      const created = await rest("/rest/events", "POST", {
        name: loc(p.title), organizer, startsAt, type,
        ...(p.description ? { description: rich(p.description) } : {}),
      }, { "X-RestLi-Method": "create" });
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
      });
      const postUrn = post.ok ? post.headers.get("x-restli-id") : null;
      if (!post.ok) console.error(`LinkedIn event post failed [${post.status}]: ${await post.text()}`);
      await supabase.from("linkedin_events").insert({
        user_id: userId, event_id: eventId, name: p.title, starts_at: new Date(startsAt).toISOString(),
        location: p.online ? `Online · ${p.url}` : [p.address?.line1, p.address?.city].filter(Boolean).join(", ") || null,
        post_urn: postUrn, status: post.ok ? "live" : "unposted",
      });
      const link = `https://www.linkedin.com/events/${eventId}/`;
      await say(post.ok
        ? `✅ **${p.title}** is live on LinkedIn — [view the event](${link}).`
        : `⚠️ LinkedIn created **${p.title}** but wouldn't publish it${organizer.includes("organization") ? " under your company page (the app may need page-posting permission from LinkedIn)" : ""}. It stays hidden until posted — ask me to try publishing again.`);
      return { threadId, ok: post.ok };
    }

    if (kind === "linkedin_event_publish") {
      const p = z.object({ event_id: z.string().regex(/^\d+$/), post_text: z.string().max(3000).default("") }).parse(ap.payload);
      const { data: row } = await supabase.from("linkedin_events").select("name").eq("event_id", p.event_id).maybeSingle();
      if (!row) throw new Error("That event isn't one Civi created.");
      const { data: org } = await supabase.from("organizations").select("linkedin_org_id").eq("user_id", userId).maybeSingle();
      const author = org?.linkedin_org_id ? `urn:li:organization:${org.linkedin_org_id}` : person;
      const post = await rest("/rest/posts", "POST", {
        author, commentary: p.post_text, visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { reference: { id: `urn:li:event:${p.event_id}` } },
        lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
      });
      if (!post.ok) await fail(post, "publish the event");
      await supabase.from("linkedin_events").update({ status: "live", post_urn: post.headers.get("x-restli-id"), updated_at: new Date().toISOString() }).eq("event_id", p.event_id);
      await say(`✅ **${row.name}** is now published — [view the event](https://www.linkedin.com/events/${p.event_id}/).`);
      return { threadId, ok: true };
    }

    if (kind === "linkedin_event_update") {
      const p = eventUpdateSchema.parse(ap.payload);
      const { data: row } = await supabase.from("linkedin_events").select("name").eq("event_id", p.event_id).maybeSingle();
      if (!row) throw new Error("That event isn't one Civi created.");
      const cur = await rest(`/rest/events/${p.event_id}`, "GET");
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
      if (!Object.keys(set).length) throw new Error("No changes to apply.");
      const res = await rest(`/rest/events/${p.event_id}`, "POST", { patch: { $set: set } }, { "X-RestLi-Method": "partial_update" });
      if (!res.ok) await fail(res, "update the event");
      await supabase.from("linkedin_events").update({
        ...(p.title ? { name: p.title } : {}),
        ...(p.start ? { starts_at: new Date(ms(p.start)).toISOString() } : {}),
        updated_at: new Date().toISOString(),
      }).eq("event_id", p.event_id);
      await say(`✏️ Updated **${p.title ?? row.name}** on LinkedIn — [view the event](https://www.linkedin.com/events/${p.event_id}/).`);
      return { threadId, ok: true };
    }

    const p = z.object({ kind: z.literal("linkedin_post"), text: z.string().min(1).max(3000) }).parse(ap.payload);
    const res = await call("/v2/ugcPosts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
      body: JSON.stringify({
        author: person,
        lifecycleState: "PUBLISHED",
        specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: p.text }, shareMediaCategory: "NONE" } },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    if (!res.ok) await fail(res, "publish the post");
    const postId = res.headers.get("x-restli-id") ?? "";
    await say(`✅ Posted to LinkedIn${postId ? ` — [view it](https://www.linkedin.com/feed/update/${postId})` : ""}.\n\n> ${p.text.slice(0, 280).replace(/\n/g, "\n> ")}`);
    return { threadId, ok: true };
  });
