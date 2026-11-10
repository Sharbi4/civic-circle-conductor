import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  try { if (/^https?:\/\//.test(d)) d = new URL(d).hostname; } catch { /* keep */ }
  return d.replace(/^www\./, "").split("/")[0] ?? "";
}

/** True when a page hostname belongs to the saved domain (exact or subdomain). */
export function domainMatches(hostname: string, domain: string): boolean {
  const h = normalizeDomain(hostname);
  return h === domain || h.endsWith(`.${domain}`);
}

export const saveSiteCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    label: z.string().trim().min(1).max(80),
    domain: z.string().trim().min(3).max(200),
    username: z.string().trim().min(1).max(200),
    password: z.string().min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const domain = normalizeDomain(data.domain);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error("Enter a website like eventbrite.com");
    const { encryptToken } = await import("@/lib/tokenCrypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("site_credentials").upsert({
      user_id: context.userId, label: data.label, domain, username: data.username,
      secret_ciphertext: encryptToken(data.password), updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,domain,username" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Server-only: fetch & decrypt the login matching a page's hostname. */
export async function findLoginForHost(userId: string, hostname: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptToken } = await import("@/lib/tokenCrypto.server");
  const { data } = await supabaseAdmin.from("site_credentials")
    .select("domain, username, secret_ciphertext, label").eq("user_id", userId);
  const hit = (data ?? []).find((c) => domainMatches(hostname, c.domain));
  return hit ? { label: hit.label, username: hit.username, password: decryptToken(hit.secret_ciphertext) } : null;
}
