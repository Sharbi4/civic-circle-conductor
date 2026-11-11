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
  .inputValidator((d: { origin?: string } | undefined) => z.object({ origin: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const clientKey = process.env["X_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("X isn't set up yet.");
    const request = getRequest();
    if (!request) throw new Error("X connect must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    // Custom domains can reach the server under a different host than the browser shows,
    // so return to the opener's own (allowlisted) origin when it tells us.
    const { LINKEDIN_APP_ORIGINS } = await import("@/lib/linkedinDirect.shared");
    const opener = data.origin && (LINKEDIN_APP_ORIGINS.includes(data.origin) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(data.origin)) ? data.origin : null;
    const returnUrl = new URL("/api/oauth/x/return", opener ?? (sandboxHost ? `https://${sandboxHost}` : url.origin)).toString();
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
    const { readXProfile } = await import('./xProfile.server');
    const profile = await readXProfile(connectionAPIKey, callAsAppUser).catch(() => null);
    const accountName = profile?.accountName ?? "X account";
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
    if (!c) return { connected: false, accountName: null, profilePhoto: null };
    const { callAsAppUser } = await import('@/integrations/lovable/appUserConnector');
    const { readXProfile } = await import('./xProfile.server');
    const profile = await readXProfile(c.key, callAsAppUser).catch(() => null);
    return { connected: true, accountName: profile?.accountName ?? c.accountName, profilePhoto: profile?.profilePhoto ?? null };
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
    const { executeXApproval } = await import("./xApproval.server");
    const { executeApproval } = await import("./approvals.server");
    return executeApproval(context.supabase, context.userId, data.approvalId, () => executeXApproval(context.supabase, context.userId, data.approvalId));
  });

export const X_WELCOME = (accountName: string) => `Hi! I'm your **X agent**, connected to **${accountName}**. Here's what I can do:

- **Write posts** — short, punchy posts about your events, calls to action and wins
- **Add a photo** — I can make an image for a post or use one you upload
- **Promote events** — announce an event, then post reminders as it gets closer
- **Recurring posts** — set up weekly roundups, volunteer calls or reminders on a schedule

Every post waits for your OK in Approvals before it goes live. What should we start with?

[[choices: Write a post | Promote an event | Set up a weekly post | Something else]]`;
