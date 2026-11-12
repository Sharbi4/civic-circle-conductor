import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev";
const BASE = ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"];
export const GOOGLE_APPS = {
  google_drive: {
    env: "GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY",
    scopes: [...BASE, "https://www.googleapis.com/auth/drive.file"],
    profilePath: "/drive/v3/about?fields=user(emailAddress)",
  },
  google_calendar: {
    env: "GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY",
    scopes: [...BASE, "https://www.googleapis.com/auth/calendar.events"],
    // calendars.get needs a broader scope; an events list returns the primary calendar's address as its summary.
    profilePath: "/calendar/v3/calendars/primary/events?maxResults=1&fields=summary,timeZone",
  },
} as const;
const appId = z.enum(["google_drive", "google_calendar"]);

async function readAccount(connectorId: keyof typeof GOOGLE_APPS, key: string) {
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const cfg = GOOGLE_APPS[connectorId];
  const res = await callAsAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: key, connectorId, path: cfg.profilePath, requiredScopes: [...cfg.scopes] });
  if (await appUserReconnectRequired(res)) return { reconnect: true as const, name: null };
  if (!res.ok) { console.warn(`${connectorId} profile`, res.status, await res.text()); return { reconnect: false, name: null }; }
  const j = (await res.json()) as { user?: { emailAddress?: string }; id?: string; summary?: string };
  const email = j.user?.emailAddress ?? j.id ?? (j.summary && /@/.test(j.summary) ? j.summary : null);
  return { reconnect: false, name: email ?? null };
}

export const startGoogleAppConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ connectorId: appId, origin: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const cfg = GOOGLE_APPS[data.connectorId];
    const clientKey = process.env[cfg.env];
    if (!clientKey) throw new Error("This Google app isn't set up yet.");
    const request = getRequest();
    if (!request) throw new Error("Connect must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const { LINKEDIN_APP_ORIGINS } = await import("@/lib/linkedinDirect.shared");
    const opener = data.origin && (LINKEDIN_APP_ORIGINS.includes(data.origin) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(data.origin)) ? data.origin : null;
    const returnUrl = new URL("/api/oauth/google_mail/return", opener ?? (sandboxHost ? `https://${sandboxHost}` : url.origin)).toString();
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY, connectorId: data.connectorId, appUserId: context.userId,
      clientAPIKey: clientKey, returnUrl, credentialsConfiguration: { scopes: [...cfg.scopes] },
    });
    return { authorizationUrl };
  });

export const completeGoogleAppConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ connectorId: appId, code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY, data.code);
    if (connectorId !== data.connectorId) throw new Error("Connect returned the wrong Google app");
    const acct = await readAccount(data.connectorId, connectionAPIKey).catch(() => ({ name: null }));
    const accountName = acct.name ?? "Google account";
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey, accountName);
    return { accountName };
  });

export const getGoogleAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ connectorId: appId }).parse(d))
  .handler(async ({ data, context }) => {
    const { getConnectionForUser } = await import("@/lib/appUserConnections.server");
    const c = await getConnectionForUser(context.userId, data.connectorId);
    if (!c) return { connected: false, reconnectRequired: false, accountName: null as string | null };
    const acct = await readAccount(data.connectorId, c.key).catch(() => ({ reconnect: false, name: null }));
    if (acct.reconnect) return { connected: false, reconnectRequired: true, accountName: c.accountName };
    if (acct.name && acct.name !== c.accountName) {
      const { rememberAccountName } = await import("@/lib/appUserConnections.server");
      await rememberAccountName(context.userId, data.connectorId, acct.name).catch(() => {});
    }
    return { connected: true, reconnectRequired: false, accountName: acct.name ?? c.accountName };
  });

export const disconnectGoogleApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ connectorId: appId }).parse(d))
  .handler(async ({ data, context }) => {
    const { getConnectionForUser, deleteConnectionForUser } = await import("@/lib/appUserConnections.server");
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const c = await getConnectionForUser(context.userId, data.connectorId);
    if (c) {
      try { await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: c.key, connectorId: data.connectorId }); }
      catch (e) { console.error("Google disconnect", e); }
      await deleteConnectionForUser(context.userId, data.connectorId);
    }
    return { ok: true };
  });
