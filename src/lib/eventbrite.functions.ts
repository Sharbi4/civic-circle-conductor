import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { encryptToken } from "@/lib/tokenCrypto.server";

const AUTHORIZE_URL = "https://www.eventbrite.com/oauth/authorize";
const TOKEN_URL = "https://www.eventbrite.com/oauth/token";
const API_BASE = "https://www.eventbriteapi.com/v3";

// Eventbrite only allows one redirect URI, registered for the published app.
// The popup lands on the published domain and posts the code back to whatever
// origin opened it (preview or published) via the `state` parameter.
const REDIRECT_URI = "https://civic-circle-conductor.lovable.app/api/oauth/eventbrite/return";

function requestOrigin(): string {
  const request = getRequest();
  if (!request) throw new Error("Eventbrite connect must start from an app request.");
  const url = new URL(request.url);
  const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  return sandboxHost ? `https://${sandboxHost}` : url.origin;
}

export const startEventbriteConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const clientId = process.env["EVENTBRITE_CLIENT_ID"];
    if (!clientId) {
      throw new Error("Eventbrite isn't configured yet — the app key still needs to be added.");
    }
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      state: requestOrigin(),
    });
    return { authorizationUrl: `${AUTHORIZE_URL}?${params.toString()}` };
  });

export const completeEventbriteConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => z.object({ code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const clientId = process.env["EVENTBRITE_CLIENT_ID"];
    const clientSecret = process.env["EVENTBRITE_CLIENT_SECRET"];
    if (!clientId || !clientSecret) {
      throw new Error("Eventbrite isn't configured yet — the app credentials still need to be added.");
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code: data.code,
        redirect_uri: REDIRECT_URI,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error(`Eventbrite token exchange failed [${tokenRes.status}]: ${body}`);
      throw new Error(`Eventbrite connect failed [${tokenRes.status}]`);
    }
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) throw new Error("Eventbrite did not return an access token");

    const meRes = await fetch(`${API_BASE}/users/me/`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) {
      const body = await meRes.text();
      console.error(`Eventbrite profile lookup failed [${meRes.status}]: ${body}`);
      throw new Error(`Eventbrite profile lookup failed [${meRes.status}]`);
    }
    const me = (await meRes.json()) as { name?: string; emails?: { email: string }[] };
    const accountName = me.name ?? me.emails?.[0]?.email ?? "Eventbrite account";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("connector_connections").upsert(
      {
        user_id: context.userId,
        connector: "eventbrite",
        access_token_ciphertext: encryptToken(token.access_token),
        account_name: accountName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,connector" },
    );
    if (error) throw error;

    // Open the Eventbrite sub-agent as its own side chat (once).
    const { data: existing } = await context.supabase
      .from("threads")
      .select("id")
      .eq("kind", "side")
      .eq("title", "Eventbrite Agent")
      .maybeSingle();
    let threadId = existing?.id as string | undefined;
    if (!threadId) {
      const { data: thread, error: threadError } = await context.supabase
        .from("threads")
        .insert({ user_id: context.userId, kind: "side", title: "Eventbrite Agent" })
        .select("id")
        .single();
      if (threadError) throw threadError;
      threadId = thread.id;
      await context.supabase.from("messages").insert({
        thread_id: threadId,
        user_id: context.userId,
        role: "assistant",
        content: `I'm your **Eventbrite agent**, connected to **${accountName}**. I can create and manage your events, track attendees, and fold Eventbrite into your outreach plans. What should we set up first?`,
      });
    }

    return { ok: true, accountName, threadId };
  });

export const getEventbriteStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("connector_connections")
      .select("account_name, updated_at")
      .eq("user_id", context.userId)
      .eq("connector", "eventbrite")
      .maybeSingle();
    if (error) throw error;
    return { connected: !!data, accountName: data?.account_name ?? null };
  });

export const disconnectEventbrite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("connector_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("connector", "eventbrite");
    if (error) throw error;
    return { ok: true };
  });
