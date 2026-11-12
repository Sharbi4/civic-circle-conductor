import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { encryptToken } from "@/lib/tokenCrypto.server";

// Nextdoor Share API OAuth 2.0, https://developer.nextdoor.com/reference/sharing-get-authorization-code
const AUTHORIZE_URL = "https://www.nextdoor.com/v3/authorize/";
const TOKEN_URL = "https://auth.nextdoor.com/v2/token";
const SCOPES = "openid post:write post:read profile:read";

// Like Eventbrite, a single redirect URI registered for the published app; the
// popup posts the code back to whatever origin opened it via `state`.
const REDIRECT_URI = "https://civic-circle-conductor.lovable.app/api/oauth/nextdoor/return";

function requestOrigin(): string {
  const request = getRequest();
  if (!request) throw new Error("Nextdoor connect must start from an app request.");
  const url = new URL(request.url);
  const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  return sandboxHost ? `https://${sandboxHost}` : url.origin;
}

export const startNextdoorConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const clientId = process.env["NEXTDOOR_CLIENT_ID"];
    if (!clientId) {
      throw new Error("Nextdoor isn't configured yet, the app key still needs to be added.");
    }
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state: requestOrigin(),
    });
    return { authorizationUrl: `${AUTHORIZE_URL}?${params.toString()}` };
  });

export const completeNextdoorConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => z.object({ code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const clientId = process.env["NEXTDOOR_CLIENT_ID"];
    const clientSecret = process.env["NEXTDOOR_CLIENT_SECRET"];
    if (!clientId || !clientSecret) {
      throw new Error("Nextdoor isn't configured yet, the app credentials still need to be added.");
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: data.code,
        redirect_uri: REDIRECT_URI,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error(`Nextdoor token exchange failed [${tokenRes.status}]: ${body}`);
      throw new Error(`Nextdoor connect failed [${tokenRes.status}]`);
    }
    const token = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!token.access_token) throw new Error("Nextdoor did not return an access token");

    // Best-effort profile lookup for a friendly account label.
    let accountName = "Nextdoor account";
    try {
      const meRes = await fetch("https://api.nextdoor.com/api/v3/me", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (meRes.ok) {
        const me = (await meRes.json()) as { name?: string; business_name?: string };
        accountName = me.business_name ?? me.name ?? accountName;
      }
    } catch {
      // keep the fallback label
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("connector_connections").upsert(
      {
        user_id: context.userId,
        connector: "nextdoor",
        access_token_ciphertext: encryptToken(token.access_token),
        account_name: accountName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,connector" },
    );
    if (error) throw error;

    // Open the Nextdoor sub-agent as its own side chat (once).
    const { data: existing } = await context.supabase
      .from("threads")
      .select("id")
      .eq("kind", "side")
      .eq("title", "Nextdoor Agent")
      .maybeSingle();
    let threadId = existing?.id as string | undefined;
    if (!threadId) {
      const { data: thread, error: threadError } = await context.supabase
        .from("threads")
        .insert({ user_id: context.userId, kind: "side", title: "Nextdoor Agent" })
        .select("id")
        .single();
      if (threadError) throw threadError;
      threadId = thread.id;
      await context.supabase.from("messages").insert({
        thread_id: threadId,
        user_id: context.userId,
        role: "assistant",
        content: `I'm your **Nextdoor agent**, connected to **${accountName}**. I can share your events and updates with nearby neighborhoods and fold Nextdoor into your outreach plans. What should we post first?`,
      });
    }

    return { ok: true, accountName, threadId };
  });

export const getNextdoorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("connector_connections")
      .select("account_name, updated_at")
      .eq("user_id", context.userId)
      .eq("connector", "nextdoor")
      .maybeSingle();
    if (error) throw error;
    return { connected: !!data, accountName: data?.account_name ?? null };
  });

export const disconnectNextdoor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("connector_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("connector", "nextdoor");
    if (error) throw error;
    return { ok: true };
  });
