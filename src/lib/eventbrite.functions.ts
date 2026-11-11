import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCoverBytes as buildCoverBytesShared, loadEventImage } from "@/lib/eventCover.server";
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
        content: EVENTBRITE_WELCOME(accountName),
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

const EventPayload = z.object({
  kind: z.literal("eventbrite_create"),
  title: z.string().min(1).max(200),
  start: z.string().min(10),
  end: z.string().min(10),
  timezone: z.string().default("America/Phoenix"),
  location: z.string().default("Online"),
  capacity: z.coerce.number().int().positive().default(100),
  price: z.coerce.number().min(0).default(0),
  description: z.string().default(""),
  image_prompt: z.string().max(2000).optional(),
  cover_image: z.string().max(300).optional(),
  inspiration_image: z.string().max(300).optional(),
});

const buildCoverBytes = async (opts: Parameters<typeof buildCoverBytesShared>[1]) =>
  buildCoverBytesShared("Eventbrite", opts);

/** Uploads cover bytes to Eventbrite. Returns media id + url. */
async function createEventCover(cover: { bytes: Uint8Array<ArrayBuffer>; type: string }, eb: (path: string, init?: RequestInit) => Promise<any>) {
  const bytes = cover.bytes;
  const up = await eb("/media/upload/?type=image-event-logo");
  const form = new FormData();
  for (const [k, v] of Object.entries(up.upload_data ?? {})) form.append(k, String(v));
  form.append(up.file_parameter_name ?? "file", new Blob([bytes], { type: cover.type }), cover.type === "image/png" ? "cover.png" : "cover.jpg");
  const put = await fetch(up.upload_url, { method: "POST", body: form });
  if (!put.ok) throw new Error(`Cover upload failed [${put.status}]`);
  const { imageSize, bannerCrop } = await import("@/lib/eventCover.server");
  const size = imageSize(bytes);
  const media = await eb("/media/upload/", {
    method: "POST",
    // Crop to Eventbrite's 2:1 banner so the photo shows properly on the listing.
    body: JSON.stringify({ upload_token: up.upload_token, ...(size ? { crop_mask: bannerCrop(size.width, size.height) } : {}) }),
  });
  return { id: media.id as string, url: (media.url ?? media.original?.url) as string | undefined };
}

/** Runs an approved Eventbrite action. Creates the event as an unpublished draft. */
export const runEventbriteApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ approvalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { executeEventbriteApproval } = await import("./eventbriteApproval.server");
    const { executeApproval } = await import("./approvals.server");
    return executeApproval(context.supabase, context.userId, data.approvalId, async () => ({ ...await executeEventbriteApproval(context.supabase, context.userId, data.approvalId), ok: true }));
  });

export const EVENTBRITE_WELCOME = (accountName: string) => `Hi! I'm your **Eventbrite agent**, connected to **${accountName}**. Here's what I can do for you:

- **Create events** — I'll suggest the name, best day and time, capacity and an AI cover image, then save it as a draft for you to publish
- **Update events** — change details, dates, capacity or the cover on events you already have
- **See your events** — list what's upcoming and what's still in draft
- **Promote events** — share them on your connected social accounts once you approve

For anything Eventbrite's connection can't do (like attendee messages, ticket settings or reports), I'll open a live browser and do it on Eventbrite.com while you watch. Nothing goes live without your OK.

What should we start with?

[[choices: Create a new event | Show my events | Promote an event | Something else]]`;
