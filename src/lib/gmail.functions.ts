import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev";
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
];

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin?: string } | undefined) => z.object({ origin: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const clientKey = process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("Gmail isn't set up yet.");
    const request = getRequest();
    if (!request) throw new Error("Gmail connect must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const { LINKEDIN_APP_ORIGINS } = await import("@/lib/linkedinDirect.shared");
    const opener = data.origin && (LINKEDIN_APP_ORIGINS.includes(data.origin) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(data.origin)) ? data.origin : null;
    const returnUrl = new URL("/api/oauth/google_mail/return", opener ?? (sandboxHost ? `https://${sandboxHost}` : url.origin)).toString();
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY, connectorId: "google_mail", appUserId: context.userId,
      clientAPIKey: clientKey, returnUrl, credentialsConfiguration: { scopes: GMAIL_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode, callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY, data.code);
    if (connectorId !== "google_mail") throw new Error("Gmail connect returned the wrong connector");
    const { readGmailProfile } = await import("./gmailProfile.server");
    const profile = await readGmailProfile(connectionAPIKey, callAsAppUser).catch(() => null);
    const accountName = profile?.accountName ?? "Gmail account";
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey, accountName);

    const { supabase, userId } = context;
    const { data: existing } = await supabase.from("threads").select("id").eq("kind", "side").eq("title", "Gmail Agent").maybeSingle();
    let threadId = existing?.id as string | undefined;
    if (!threadId) {
      const { data: t, error } = await supabase.from("threads").insert({ user_id: userId, kind: "side", title: "Gmail Agent" }).select("id").single();
      if (error) throw error;
      threadId = t.id;
      await supabase.from("messages").insert({
        thread_id: threadId, user_id: userId, role: "assistant",
        content: GMAIL_WELCOME(accountName),
      });
    }
    return { accountName, threadId };
  });

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser } = await import("@/lib/appUserConnections.server");
    const c = await getConnectionForUser(context.userId, "google_mail");
    if (!c) return { connected: false, accountName: null as string | null };
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { readGmailProfile } = await import("./gmailProfile.server");
    const profile = await readGmailProfile(c.key, callAsAppUser).catch(() => null);
    return { connected: true, accountName: profile?.accountName ?? c.accountName };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser, deleteConnectionForUser } = await import("@/lib/appUserConnections.server");
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const c = await getConnectionForUser(context.userId, "google_mail");
    if (c) {
      try { await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: c.key, connectorId: "google_mail" }); }
      catch (e) { console.error("Gmail disconnect", e); }
      await deleteConnectionForUser(context.userId, "google_mail");
    }
    return { ok: true };
  });

export const GMAIL_WELCOME = (accountName: string) => `Hi! I'm your **Gmail agent**, connected to **${accountName}**. Here's what I can do:

- **Read your inbox** — summarize new messages, flag anything that needs a reply
- **Draft replies** — write responses in your voice for you to approve
- **Send emails** — event follow-ups, thank-yous and reminders, always with your OK first
- **Tidy up** — mark things read or archive newsletters on your say-so

Nothing is ever sent without your approval in Approvals. What should we start with?

[[choices: Summarize my inbox | Draft a reply | Send a follow-up email | Something else]]`;
