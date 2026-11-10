import { createFileRoute } from "@tanstack/react-router";

function b64urlDecode(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function verify(signed: string, secret: string): Promise<{ user_id?: string } | null> {
  const [sig, payload] = signed.split(".");
  if (!sig || !payload) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), new TextEncoder().encode(payload));
  if (!ok) return null;
  return JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
}

export const Route = createFileRoute("/api/public/meta/data-deletion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.FACEBOOK_APP_SECRET;
        if (!secret) return new Response("Not configured", { status: 500 });
        const form = await request.formData().catch(() => null);
        const signed = form?.get("signed_request");
        if (typeof signed !== "string" || signed.length > 4000) return new Response("Bad request", { status: 400 });
        const data = await verify(signed, secret);
        if (!data) return new Response("Invalid signature", { status: 401 });
        // Civi Meet does not store Facebook user IDs or Graph API data; nothing is linked to this ID.
        const code = crypto.randomUUID().slice(0, 12);
        const origin = new URL(request.url).origin;
        return Response.json({ url: `${origin}/data-deletion?code=${code}`, confirmation_code: code });
      },
    },
  },
});
