import { noLongDashes, withNoDashes } from "./punctuation.shared";
// Background research via Perplexity Search (managed, search-only) + Lovable AI synthesis.
import { generateResponse } from "@lovable.dev/ai-gateway";

const GATEWAY = "https://connector-gateway.lovable.dev/perplexity";

export type SearchHit = { title: string; url: string; snippet?: string; date?: string };

export async function perplexitySearch(queries: string[], max = 5): Promise<SearchHit[]> {
  const lk = process.env["LOVABLE_API_KEY"], pk = process.env["PERPLEXITY_API_KEY"];
  if (!lk || !pk) return [];
  const res = await fetch(`${GATEWAY}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": pk, "Content-Type": "application/json" },
    body: JSON.stringify({ query: queries.slice(0, 5), max_results: max }),
  });
  if (!res.ok) { console.error(`Perplexity search failed [${res.status}]: ${await res.text()}`); return []; }
  const j = (await res.json()) as { results?: unknown };
  const flat = (Array.isArray(j.results) ? j.results : []).flat(2) as SearchHit[];
  const seen = new Set<string>();
  return flat.filter((r) => r?.url && !seen.has(r.url) && seen.add(r.url));
}

export function formatHits(hits: SearchHit[], n = 20) {
  return hits.slice(0, n).map((h, i) => `[${i + 1}] ${h.title}, ${h.url}\n${(h.snippet ?? "").slice(0, 400)}`).join("\n\n");
}

/** Researches the org at onboarding and returns memory lines + vendor/venue resources. */
export async function researchOrganization(name: string, mission: string, area = "Southern Arizona (Tucson)") {
  const hits = await perplexitySearch([
    `${name} ${area}`,
    `${mission.slice(0, 120)} community organizations ${area}`,
    `upcoming community events ${area} 2026`,
    `food trucks and mobile caterers for community events ${area}`,
    `affordable community event venues ${area}`,
  ]);
  if (!hits.length) return { memories: [] as string[], resources: [] as { type: string; name: string; details: string; source: string }[], hits };
  const res = await generateResponse({
    model: "openai/gpt-6.1-terra",
    instructions: withNoDashes(`You build background awareness for Civi, an AI community organizer for "${name}" (mission: ${mission}). From the search results, return ONLY JSON: {"memories":["..."],"resources":[{"type":"vendor|venue|nonprofit|group|event","name":"...","details":"one line","source":"https://..."}]}. memories: 6-10 short, specific facts useful for organizing (local issues, allied orgs, recurring events, audience insights, timing/season notes), each ends with (source: domain). resources: up to 10 real vendors, venues, allied nonprofits or events from the results with their URL. Never invent anything not in the results.`),
    input: formatHits(hits, 25),
  });
  let text = "";
  for (const it of res.output ?? []) if (it.type === "message") for (const c of it.content ?? []) if (c.type === "output_text") text += noLongDashes(c.text);
  try {
    const p = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { memories?: string[]; resources?: { type: string; name: string; details: string; source: string }[] };
    return { memories: (p.memories ?? []).filter(Boolean).slice(0, 10).map((m) => String(m).slice(0, 400)), resources: (p.resources ?? []).filter((r) => r?.name).slice(0, 10), hits };
  } catch { return { memories: [], resources: [], hits }; }
}
