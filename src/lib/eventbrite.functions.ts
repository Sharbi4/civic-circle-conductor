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
});

/** Generates a cover with GPT Image 2.5 Sunburst and uploads it to Eventbrite. Returns media id + url. */
async function createEventCover(prompt: string, eb: (path: string, init?: RequestInit) => Promise<any>) {
  const { generateImage } = await import("@lovable.dev/ai-gateway");
  const img = await generateImage({
    model: "openai/gpt-image-2.5-sunburst",
    prompt: `Eventbrite event cover image, wide banner composition with the subject centered and important details away from the top and bottom edges. No small text. ${prompt}`,
    size: "1792x1024",
    output_format: "jpeg",
    quality: "high",
  });
  const b64 = img.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  const up = await eb("/media/upload/?type=image-event-logo");
  const form = new FormData();
  for (const [k, v] of Object.entries(up.upload_data ?? {})) form.append(k, String(v));
  form.append(up.file_parameter_name ?? "file", new Blob([bytes], { type: "image/jpeg" }), "cover.jpg");
  const put = await fetch(up.upload_url, { method: "POST", body: form });
  if (!put.ok) throw new Error(`Cover upload failed [${put.status}]`);
  const media = await eb("/media/upload/", {
    method: "POST",
    body: JSON.stringify({ upload_token: up.upload_token, crop_mask: { top_left: { x: 0, y: 64 }, width: 1792, height: 896 } }),
  });
  return { id: media.id as string, url: (media.url ?? media.original?.url) as string | undefined };
}

/** Runs an approved Eventbrite action. Creates the event as an unpublished draft. */
export const runEventbriteApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ approvalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ap } = await supabase.from("approvals").select("id, status, payload").eq("id", data.approvalId).maybeSingle();
    if (!ap || ap.status !== "approved") throw new Error("This action isn't approved.");
    const p = EventPayload.parse(ap.payload);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptToken } = await import("@/lib/tokenCrypto.server");
    const { data: conn } = await supabaseAdmin.from("connector_connections")
      .select("access_token_ciphertext").eq("user_id", userId).eq("connector", "eventbrite").maybeSingle();
    if (!conn) throw new Error("Eventbrite isn't connected — connect it in the Connectors tab.");
    const token = decryptToken(conn.access_token_ciphertext);

    const eb = async (path: string, init?: RequestInit) => {
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(`Eventbrite ${path} failed [${res.status}]`, body);
        throw new Error(`Eventbrite said: ${(body as { error_description?: string }).error_description ?? res.status}`);
      }
      return body as any;
    };
    const utc = (s: string) => new Date(s).toISOString().replace(/\.\d{3}Z$/, "Z");

    const orgs = await eb("/users/me/organizations/");
    const orgId = orgs.organizations?.[0]?.id;
    if (!orgId) throw new Error("No Eventbrite organization found on this account.");
    const online = /online|virtual|zoom/i.test(p.location);
    const desc = `${p.description}${online ? "" : `<p><b>Location:</b> ${p.location}</p>`}`;

    let cover: { id: string; url?: string | undefined } | null = null;
    try {
      cover = await createEventCover(p.image_prompt || `${p.title}. ${p.description.replace(/<[^>]+>/g, " ")}`, eb);
    } catch (e) {
      console.error("Event cover failed", e);
    }

    const ev = await eb(`/organizations/${orgId}/events/`, {
      method: "POST",
      body: JSON.stringify({ event: {
        name: { html: p.title },
        description: { html: desc || p.title },
        start: { timezone: p.timezone, utc: utc(p.start) },
        end: { timezone: p.timezone, utc: utc(p.end) },
        currency: "USD", online_event: online, capacity: p.capacity, listed: true,
        ...(cover ? { logo_id: cover.id } : {}),
      } }),
    });
    await eb(`/events/${ev.id}/ticket_classes/`, {
      method: "POST",
      body: JSON.stringify({ ticket_class: p.price > 0
        ? { name: "General Admission", quantity_total: p.capacity, cost: `USD,${Math.round(p.price * 100)}` }
        : { name: "General Admission", quantity_total: p.capacity, free: true } }),
    });

    const { data: thread } = await supabase.from("threads").select("id").eq("kind", "side").eq("title", "Eventbrite Agent").maybeSingle();
    const { data: main } = await supabase.from("threads").select("id").eq("kind", "main").maybeSingle();
    const threadId = thread?.id ?? main?.id;
    if (threadId) {
      await supabase.from("messages").insert({
        thread_id: threadId, user_id: userId, role: "assistant",
        content: `🎉 Created **${p.title}** on Eventbrite as a draft.${cover?.url ? `\n\n![Event cover](${cover.url})` : cover ? " Cover image added." : "\n\n(I couldn't make a cover image this time — you can add one on Eventbrite.)"}\n\n- [Review & publish it on Eventbrite](https://www.eventbrite.com/myevent?eid=${ev.id})\n- Public page (live after you publish): ${ev.url}`,
      });
    }
    return { eventId: ev.id as string, url: ev.url as string, threadId };
  });
