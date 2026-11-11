import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { researchOrganization } from "@/lib/research.server";

export const runOnboardingResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: org } = await supabase.from("organizations").select("name, mission, facebook_setup_location").eq("user_id", userId).maybeSingle();
    if (!org?.name) return { memories: 0, resources: 0 };
    const { reserveUsage } = await import("@/lib/usage.server");
    await reserveUsage(userId, "ai");
    const r = await researchOrganization(org.name, org.mission ?? "", org.facebook_setup_location ?? undefined);
    if (r.memories.length) await supabase.from("memories").insert(r.memories.map((content) => ({ user_id: userId, content: `🔎 ${content}` })));
    if (r.resources.length) {
      const allowed = new Set(["vendor", "venue", "nonprofit", "group", "event", "professional", "other"]);
      await supabase.from("resources").insert(r.resources.map((x) => ({
        user_id: userId, type: allowed.has(x.type) ? x.type : "other", name: String(x.name).slice(0, 160),
        details: String(x.details ?? "").slice(0, 400) || null, source: x.source?.startsWith("https://") ? x.source : null,
      })));
    }
    return { memories: r.memories.length, resources: r.resources.length };
  });

/** Scans the org's public pages (Firecrawl) + web (Perplexity) and drafts an editable profile. */
export const scanOrgProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pages: Record<string, string> }) => ({
    pages: Object.fromEntries(Object.entries(d.pages ?? {}).filter(([, v]) => typeof v === "string" && /^https?:\/\//.test(v.trim())).slice(0, 5).map(([k, v]) => [k.slice(0, 30), v.trim().slice(0, 300)])),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: org } = await supabase.from("organizations").select("name, mission, address").eq("user_id", userId).maybeSingle();
    const name = org?.name ?? "the organization";
    const { reserveUsage } = await import("@/lib/usage.server");
    await reserveUsage(userId, "ai");
    const fk = process.env["FIRECRAWL_API_KEY"];
    const scraped = await Promise.all(Object.entries(data.pages).map(async ([k, url]) => {
      if (!fk) return "";
      try {
        const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST", headers: { Authorization: `Bearer ${fk}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
        });
        if (!r.ok) { console.error(`Firecrawl ${k} [${r.status}]: ${await r.text()}`); return ""; }
        const j = (await r.json()) as { data?: { markdown?: string }; markdown?: string };
        return `## ${k} (${url})\n${(j.data?.markdown ?? j.markdown ?? "").slice(0, 3500)}`;
      } catch (e) { console.error(e); return ""; }
    }));
    const { perplexitySearch, formatHits } = await import("@/lib/research.server");
    const hits = await perplexitySearch([`${name} ${org?.address ?? ""}`, `${name} news`, `${name} events`]);
    const { generateResponse } = await import("@lovable.dev/ai-gateway");
    const res = await generateResponse({
      model: "openai/gpt-6.1-terra",
      instructions: `Write a concise organization profile for "${name}" (location: ${org?.address ?? "unknown"}; mission: ${org?.mission ?? "unknown"}) that an AI organizer will use as background. Plain text, 5 short labeled lines: Who they are, Audience, Programs & events, Voice & tone, Online presence (what needs TLC). Under 120 words total. Only use facts from the sources; say "unknown" when missing.`,
      input: `${scraped.filter(Boolean).join("\n\n")}\n\n# Web results\n${formatHits(hits, 12)}`,
    });
    let text = "";
    for (const it of res.output ?? []) if (it.type === "message") for (const c of it.content ?? []) if (c.type === "output_text") text += c.text;
    return { profile: text.trim(), scanned: scraped.filter(Boolean).length, found: hits.length };
  });
