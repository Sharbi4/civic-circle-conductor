import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
const GATEWAY = "https://connector-gateway.lovable.dev";
const X_SCOPES = ["users.read", "tweet.read", "tweet.write", "offline.access"];
// Needed to attach photos; requested at connect, required only when a post has a photo.
const X_MEDIA_SCOPES = [...X_SCOPES, "media.write"];


export async function executeXApproval(supabase: SupabaseClient<Database>, userId: string, approvalId: string) {
    const { data: ap } = await supabase.from("approvals").select("status, payload").eq("id", approvalId).maybeSingle();
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
}
