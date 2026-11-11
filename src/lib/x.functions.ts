import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev";
const X_SCOPES = ["users.read", "tweet.read", "tweet.write", "offline.access"];
// Needed to attach photos; requested at connect, required only when a post has a photo.
const X_MEDIA_SCOPES = [...X_SCOPES, "media.write"];

export const startXConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env["X_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("X isn't set up yet.");
    const request = getRequest();
    if (!request) throw new Error("X connect must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/api/oauth/x/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY, connectorId: "x", appUserId: context.userId,
      clientAPIKey: clientKey, returnUrl, credentialsConfiguration: { scopes: X_MEDIA_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeXConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode, callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY, data.code);
    if (connectorId !== "x") throw new Error("X connect returned the wrong connector");
    const me = await callAsAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey, connectorId, path: "/users/me?user.fields=username,name", requiredScopes: X_SCOPES });
    const u = me.ok ? ((await me.json()) as { data?: { username?: string } }).data : undefined;
    const accountName = u?.username ? `@${u.username}` : "X account";
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey, accountName);

    const { supabase, userId } = context;
    const { data: existing } = await supabase.from("threads").select("id").eq("kind", "side").eq("title", "X Agent").maybeSingle();
    let threadId = existing?.id as string | undefined;
    if (!threadId) {
      const { data: t, error } = await supabase.from("threads").insert({ user_id: userId, kind: "side", title: "X Agent" }).select("id").single();
      if (error) throw error;
      threadId = t.id;
      await supabase.from("messages").insert({
        thread_id: threadId, user_id: userId, role: "assistant",
        content: X_WELCOME(accountName),
      });
    }
    return { accountName, threadId };
  });

export const getXStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser } = await import("@/lib/appUserConnections.server");
    const c = await getConnectionForUser(context.userId, "x");
    return { connected: !!c, accountName: c?.accountName ?? null };
  });

export const disconnectX = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser, deleteConnectionForUser } = await import("@/lib/appUserConnections.server");
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const c = await getConnectionForUser(context.userId, "x");
    if (c) {
      try { await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: c.key, connectorId: "x" }); }
      catch (e) { console.error("X disconnect", e); }
      await deleteConnectionForUser(context.userId, "x");
    }
    return { ok: true };
  });

/** Publishes an approved X post. */
export const runXApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ approvalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ap } = await supabase.from("approvals").select("status, payload").eq("id", data.approvalId).maybeSingle();
    if (!ap || ap.status !== "approved") throw new Error("This action isn't approved.");
    const p = z.object({ kind: z.literal("x_post"), text: z.string().min(1).max(280), image_prompt: z.string().max(1500).nullish(), image: z.string().max(300).nullish() }).parse(ap.payload);
    const { getConnectionForUser } = await import("@/lib/appUserConnections.server");
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const c = await getConnectionForUser(userId, "x");
    if (!c) throw new Error("X isn't connected — connect it in the Connectors tab.");
    const { data: th } = await supabase.from("threads").select("id").eq("kind", "side").eq("title", "X Agent").maybeSingle();
    const threadId = th?.id ?? null;
    const say = async (content: string) => { if (threadId) await supabase.from("messages").insert({ thread_id: threadId, user_id: userId, role: "assistant", content }); };

    let mediaId: string | undefined;
    if (p.image || p.image_prompt) {
      const { buildPostImage } = await import("@/lib/eventCover.server");
      const img = await buildPostImage(supabase, userId, { image: p.image ?? undefined, image_prompt: p.image_prompt ?? undefined });
      if (img) {
        const form = new FormData();
        form.append("media", new Blob([img.bytes], { type: img.type }), "photo.jpg");
        form.append("media_category", "tweet_image");
        const up = await callAsAppUser({
          gatewayBaseUrl: GATEWAY, connectionAPIKey: c.key, connectorId: "x", path: "/media/upload",
          init: { method: "POST", body: form }, requiredScopes: X_MEDIA_SCOPES,
        });
        if (await appUserReconnectRequired(up)) { await say("⚠️ To post photos on X, Civi needs one more permission — press Disconnect then Connect next to X in Connectors, then approve again."); return { ok: false, threadId }; }
        if (!up.ok) { const body = await up.text(); console.error(`X media upload failed [${up.status}]: ${body}`); await say(`⚠️ X didn't accept the photo (${up.status}): ${body.slice(0, 300)}`); return { ok: false, threadId }; }
        mediaId = ((await up.json()) as { data?: { id?: string } }).data?.id;
      }
    }
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY, connectionAPIKey: c.key, connectorId: "x", path: "/tweets",
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: p.text, ...(mediaId ? { media: { media_ids: [mediaId] } } : {}) }) },
      requiredScopes: X_SCOPES,
    });
    if (await appUserReconnectRequired(res)) { await say("⚠️ Your X access needs to be renewed — press Disconnect then Connect next to X in Connectors."); return { ok: false, threadId }; }
    if (!res.ok) { const body = await res.text(); console.error(`X post failed [${res.status}]: ${body}`); await say(`⚠️ X didn't accept the post (${res.status}): ${body.slice(0, 300)}`); return { ok: false, threadId }; }
    const id = ((await res.json()) as { data?: { id?: string } }).data?.id;
    await say(`✅ Posted on X${mediaId ? " with photo" : ""}${id ? ` — [view it](https://x.com/i/web/status/${id})` : ""}.`);
    return { ok: true, threadId };
  });

export const X_WELCOME = (accountName: string) => `Hi! I'm your **X agent**, connected to **${accountName}**. Here's what I can do:

- **Write posts** — short, punchy posts about your events, calls to action and wins
- **Add a photo** — I can make an image for a post or use one you upload
- **Promote events** — announce an event, then post reminders as it gets closer
- **Recurring posts** — set up weekly roundups, volunteer calls or reminders on a schedule

Every post waits for your OK in Approvals before it goes live. What should we start with?

[[choices: Write a post | Promote an event | Set up a weekly post | Something else]]`;
