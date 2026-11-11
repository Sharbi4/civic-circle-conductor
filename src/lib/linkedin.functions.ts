import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev";
const SCOPES = ["openid", "profile", "w_member_social"];
const EVENT_SCOPES = ["r_events", "rw_events"];
// Company-page permissions: required to organize events under and post as a LinkedIn page.
const ORG_SCOPES = ["rw_organization_admin", "w_organization_social", "r_organization_social"];
const CONNECT_SCOPES = [...SCOPES, ...EVENT_SCOPES, ...ORG_SCOPES];
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
        content: LINKEDIN_WELCOME(accountName),
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

/** Runs an approved LinkedIn action: member post, event create+publish, or event edit. */
export const runLinkedInApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ approvalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { executeLinkedinApproval } = await import("./linkedinApproval.server");
    const { executeApproval } = await import("./approvals.server");
    return executeApproval(context.supabase, context.userId, data.approvalId, () => executeLinkedinApproval(context.supabase, context.userId, data.approvalId));
  });

export const LINKEDIN_WELCOME = (accountName: string) => `Hi! I'm your **LinkedIn agent**, connected to **${accountName}**. What do you want me to do? Here's what I can take off your plate:

- **Share a post** — announce an event, a win, a volunteer call or a partner shout-out, with a photo if you'd like
- **Create a LinkedIn event** — with a cover image, then promote it
- **Post on a schedule** — weekly updates, monthly impact recaps or reminders before each event
- **Grow partnerships** — draft outreach-ready posts that spotlight local partners and sponsors

I'd suggest starting with a quick post about what you're working on right now — or just let me know what you need. Nothing goes live without your OK.

[[choices: Share a post | Create a LinkedIn event | Set up a weekly post | Just let me know what you need]]`;
