import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev";
const SCOPES = ["openid", "profile", "w_member_social"];

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
      clientAPIKey: clientKey, returnUrl, credentialsConfiguration: { scopes: SCOPES },
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
    return { connected: !!c, accountName: c?.accountName ?? null };
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

/** Publishes an approved LinkedIn post as the connected member. */
export const runLinkedInApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ approvalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ap } = await supabase.from("approvals").select("status, payload").eq("id", data.approvalId).maybeSingle();
    if (!ap || ap.status !== "approved") throw new Error("This post isn't approved.");
    const p = z.object({ kind: z.literal("linkedin_post"), text: z.string().min(1).max(3000) }).parse(ap.payload);

    const { getConnectionForUser } = await import("@/lib/appUserConnections.server");
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const c = await getConnectionForUser(userId, "linkedin");
    if (!c) throw new Error("LinkedIn isn't connected — connect it in the Connectors tab.");
    const call = (path: string, init?: RequestInit) =>
      callAsAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: c.key, connectorId: "linkedin", path, ...(init ? { init } : {}), requiredScopes: SCOPES });

    const me = await call("/v2/userinfo");
    if (await appUserReconnectRequired(me)) throw new Error("Your LinkedIn access needs to be renewed — reconnect LinkedIn.");
    if (!me.ok) throw new Error(`LinkedIn profile lookup failed [${me.status}]`);
    const { sub } = (await me.json()) as { sub: string };

    const res = await call("/v2/ugcPosts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
      body: JSON.stringify({
        author: `urn:li:person:${sub}`,
        lifecycleState: "PUBLISHED",
        specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: p.text }, shareMediaCategory: "NONE" } },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`LinkedIn post failed [${res.status}]: ${body}`);
      throw new Error(`LinkedIn couldn't publish the post [${res.status}]`);
    }
    const postId = res.headers.get("x-restli-id") ?? "";
    const { data: thread } = await supabase.from("threads").select("id").eq("kind", "side").eq("title", "LinkedIn Agent").maybeSingle();
    const { data: main } = await supabase.from("threads").select("id").eq("kind", "main").maybeSingle();
    const threadId = thread?.id ?? main?.id;
    if (threadId) {
      await supabase.from("messages").insert({
        thread_id: threadId, user_id: userId, role: "assistant",
        content: `✅ Posted to LinkedIn${postId ? ` — [view it](https://www.linkedin.com/feed/update/${postId})` : ""}.\n\n> ${p.text.slice(0, 280).replace(/\n/g, "\n> ")}`,
      });
    }
    return { threadId };
  });
