import { noLongDashes, withNoDashes } from "./punctuation.shared";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";

const MODEL = "openai/gpt-6.1-terra";
const MAX_USERS_PER_RUN = 3;

type FocusArea = {
  id: string;
  user_id: string;
  city: string;
  state: string;
  neighborhoods: string | null;
  interests: string | null;
  priorities: string | null;
  partner_types: string | null;
};

type WebResult = { url: string; title: string; description: string };

/** Thrown on Firecrawl credit/auth failures so the run can pause the job. */
class WebSearchBillingError extends Error {}

async function firecrawlSearch(apiKey: string, query: string, tbs?: string): Promise<WebResult[]> {
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, limit: 5, lang: "en", country: "US", ...(tbs ? { tbs } : {}) }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof data === "object" && data ? JSON.stringify(data).slice(0, 300) : res.statusText;
    if (res.status === 402 || res.status === 403) throw new WebSearchBillingError(`Firecrawl ${res.status}: ${msg}`);
    throw new Error(`Firecrawl ${res.status}: ${msg}`);
  }
  // v2 nests results by category: data.web, data.news, data.images.
  const raw = data?.data;
  const rows = (Array.isArray(raw) ? raw : (raw?.web ?? [])) as { url?: string; title?: string; description?: string }[];
  return rows
    .flatMap((r) => r.url ? [{ url:r.url,title:(r.title??r.url).slice(0,200),description:(r.description??"").slice(0,400) }] : []);
}

function buildQueries(area: FocusArea): { query: string; tbs?: string }[] {
  const queries: { query: string; tbs?: string }[] = [
    {
      query: `${area.partner_types?.trim() || "local nonprofits, community groups, event venues and food vendors"} in ${area.city}, ${area.state}`,
    },
    {
      query: `upcoming community events in ${area.city}, ${area.state}`,
      tbs: "qdr:m",
    },
  ];
  if (area.interests?.trim()) {
    queries.push({ query: `${area.interests.trim()} ${area.city} ${area.state}`, tbs: "qdr:m" });
  }
  return queries;
}

export async function runCommunityScout(onlyUserId: string) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const firecrawlKey = process.env["FIRECRAWL_API_KEY"];

        // Paused-state guard: nothing runs while the job is paused.
        const { data: pausedRows } = await supabaseAdmin
          .from("scout_state").select("user_id").eq("paused", true);
        const pausedUsers = new Set((pausedRows ?? []).map((r) => r.user_id));

        // Candidate orgs: users with at least one focus area, not paused.
        const { data: areas, error: areasErr } = await supabaseAdmin
          .from("focus_areas").select("*").eq("user_id",onlyUserId).order("created_at");
        if (areasErr) throw areasErr;

        const byUser = new Map<string, FocusArea[]>();
        for (const a of (areas ?? []) as FocusArea[]) {
          if (pausedUsers.has(a.user_id)) continue;
          const list = byUser.get(a.user_id) ?? [];
          list.push(a);
          byUser.set(a.user_id, list);
        }

        const results: { userId: string; outcome: string }[] = [];

        // Bounded batch: at most MAX_USERS_PER_RUN orgs, one focus area each.
        for (const [userId, userAreas] of [...byUser.entries()].slice(0, MAX_USERS_PER_RUN)) {
          const area = userAreas[0]; if(!area) continue;
          try {
            const { data: org } = await supabaseAdmin
              .from("organizations").select("name, mission").eq("user_id", userId).maybeSingle();
            const { data: known } = await supabaseAdmin
              .from("resources").select("name").eq("user_id", userId).limit(60);

            // Live web research: search current sources for this focus area.
            let webResults: WebResult[] = [];
            let liveMode = false;
            if (firecrawlKey) {
              const settled = await Promise.all(
                buildQueries(area).map(async ({ query, tbs }) => {
                  try {
                    return await firecrawlSearch(firecrawlKey, query, tbs);
                  } catch (e) {
                    if (e instanceof WebSearchBillingError) throw e;
                    console.error(`Scout search failed for "${query}"`, e);
                    return [] as WebResult[];
                  }
                }),
              );
              const seen = new Set<string>();
              webResults = settled.flat().filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true))).slice(0, 15);
              liveMode = webResults.length > 0;
            }

            const focusDescription =
              `Research the focus area: ${area.city}, ${area.state}.` +
              (area.neighborhoods ? ` Neighborhoods/radius: ${area.neighborhoods}.` : "") +
              (area.interests ? ` Community interests: ${area.interests}.` : "") +
              (area.priorities ? ` Organizational priorities: ${area.priorities}.` : "") +
              (area.partner_types ? ` Partners/vendors to discover: ${area.partner_types}.` : "");

            const instructions = liveMode
              ? [
                  `You are Community Scout, a background research agent for "${org?.name ?? "a community organization"}" (mission: ${org?.mission ?? "not provided"}).`,
                  focusDescription,
                  `Below are live web search results gathered just now. Base every discovery on these results, do not add organizations or events that are not in them. For each finding, cite the source as a markdown link (e.g. [Source title](url)) so the team can verify it.`,
                  `WEB RESULTS:\n${webResults.map((r, i) => `[${i + 1}] ${r.title}, ${r.url}\n${r.description}`).join("\n\n")}`,
                  `Already in the directory (do not repeat): ${(known ?? []).map((r) => r.name).join(", ") || "nothing yet"}.`,
                  `Output a short markdown briefing of what you found on the live web, citing sources inline. Then one line per new discovery exactly like: [[resource: <group|vendor|venue|nonprofit|event|professional|other> | <name> | <one line of details> | <source URL from the results>]]. Max 6 resources. The source URL must be copied verbatim from the results above.`,
                ].join("\n")
              : [
                  `You are Community Scout, a background research agent for "${org?.name ?? "a community organization"}" (mission: ${org?.mission ?? "not provided"}).`,
                  focusDescription,
                  `Suggest community groups, food vendors, venues, local nonprofits, community events, and professional groups worth knowing. Be honest: live web search was unavailable this run, so these are unverified leads from your training knowledge, say so, and never invent contact details, addresses or dates you don't actually know. Prefer well-known, real organizations.`,
                  `Already in the directory (do not repeat): ${(known ?? []).map((r) => r.name).join(", ") || "nothing yet"}.`,
                  `Output a short markdown briefing, then one line per new discovery exactly like: [[resource: <group|vendor|venue|nonprofit|event|professional|other> | <name> | <one line of details>]]. Max 6 resources. Also flag any listed directory entries that are likely duplicates or outdated.`,
                ].join("\n");

            const ideaInstructions = '\nAlso propose 3 organization-specific ideas: one blog, one event and one social post. Ground each in this research and the mission; do not invent dates, availability or partnership interest. Finish with [[ideas: JSON_ARRAY]] where each object has kind (blog|event|post), title, description, connector (internal for blogs, eventbrite for events, linkedin or x for posts), and prompt (specific instruction to draft or plan the action while preserving unknowns and approval requirements). No checklist reminders or approval reviews in this feed.';
            const res = await generateResponse({
              model: MODEL,
              instructions: withNoDashes(instructions + ideaInstructions),
              input: `Run a community discovery pass for ${area.city}, ${area.state}.`,
            });

            let text = "";
            for (const item of res.output ?? []) {
              if (item.type === "message") {
                for (const c of item.content ?? []) if (c.type === "output_text") text += noLongDashes(c.text);
              }
            }

            const validUrls = new Set(webResults.map((r) => r.url));
            const resourceRows = [...text.matchAll(/\[\[resource:\s*(.+?)\]\]/g)]
              .map((m) => (m[1] ?? "").split("|").map((s) => s.trim()))
              .filter((p) => p[0] && p[1])
              .slice(0, 6)
              .map(([type, name, details, url]) => ({
                user_id: userId,
                type: ["group", "vendor", "venue", "nonprofit", "event", "professional"].includes(type ?? "")
                  ? type! : "other",
                name: name!,
                details: details ?? "",
                // Keep the citation only when it is a real result URL; never trust an invented one.
                source: url && validUrls.has(url) ? url : "Community Scout",
                status: "suggested",
              }));
            const { discoveryIdeas } = await import('./discovery.shared');
            const ideaMatch = text.match(/\[\[ideas:\s*([\s\S]*?)\]\](?!\])/);
            let rawIdeas: unknown = [];
            try { rawIdeas = JSON.parse(ideaMatch?.[1] ?? '[]'); } catch { /* use briefing-based defaults */ }
            const briefing = text.replace(/\n?\[\[resource:.+?\]\]/g, '').replace(/\n?\[\[ideas:[\s\S]*?\]\](?!\])/g, '').trim() || 'No new findings this pass.';
            const ideas = discoveryIdeas(rawIdeas, briefing);

            // Idempotent progress: findings + resources recorded before the lease clears.
            await supabaseAdmin.from("scout_findings").insert({
              user_id: userId, focus_area_id: area.id, summary: briefing, ideas,
            });
            if (resourceRows.length) await supabaseAdmin.from("resources").insert(resourceRows);

            await supabaseAdmin.from("scout_state").upsert({
              user_id: userId, lease_until: null, last_run_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
            results.push({ userId, outcome: `ok: ${resourceRows.length} resources${liveMode ? " (live web)" : " (fallback)"}` });
          } catch (e) {
            const {noteJobFailure}=await import("@/lib/jobSafety.server"); await noteJobFailure(userId,e);
            // Circuit breaker: credit/policy failures pause the job until the owner resumes.
            const isAiCredit = e instanceof GatewayError && (e.httpStatus === 402 || e.httpStatus === 403);
            if (isAiCredit || e instanceof WebSearchBillingError) {
              await supabaseAdmin.from("scout_state").upsert({
                user_id: userId, lease_until: null, paused: true,
                pause_reason: e instanceof WebSearchBillingError
                  ? "Web search credits exhausted"
                  : (e as GatewayError).httpStatus === 402 ? "AI credits exhausted" : "AI access denied",
              }, { onConflict: "user_id" });
              results.push({ userId, outcome: "paused" });
              throw e;
            }
            console.error("Community Scout run failed", e);
            await supabaseAdmin.from("scout_state")
              .update({ lease_until: null }).eq("user_id", userId);
            throw e;
          }
        }

return {ok:true,results};
}
