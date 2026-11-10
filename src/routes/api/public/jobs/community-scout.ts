import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";

const MODEL = "openai/gpt-6.1-terra";
const MAX_USERS_PER_RUN = 3;
const LEASE_MINUTES = 10;

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

export const Route = createFileRoute("/api/public/jobs/community-scout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Paused-state guard: nothing runs while the job is paused.
        const { data: pausedRows } = await supabaseAdmin
          .from("scout_state").select("user_id").eq("paused", true);
        const pausedUsers = new Set((pausedRows ?? []).map((r) => r.user_id));

        // Candidate orgs: users with at least one focus area, not paused.
        const { data: areas, error: areasErr } = await supabaseAdmin
          .from("focus_areas").select("*").order("created_at");
        if (areasErr) return Response.json({ error: areasErr.message }, { status: 500 });

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
          // Single-flight lock: acquire a lease; skip if another run holds it.
          const leaseUntil = new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString();
          const { data: lease } = await supabaseAdmin
            .from("scout_state")
            .upsert({ user_id: userId, lease_until: leaseUntil }, { onConflict: "user_id" })
            .select("user_id")
            .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`)
            .maybeSingle();
          if (!lease) { results.push({ userId, outcome: "skipped: locked" }); continue; }

          const area = userAreas[0]!;
          try {
            const { data: org } = await supabaseAdmin
              .from("organizations").select("name, mission").eq("user_id", userId).maybeSingle();
            const { data: known } = await supabaseAdmin
              .from("resources").select("name").eq("user_id", userId).limit(60);

            const res = await generateResponse({
              model: MODEL,
              instructions: [
                `You are Community Scout, a background research agent for "${org?.name ?? "a community organization"}" (mission: ${org?.mission ?? "not provided"}).`,
                `Research the focus area: ${area.city}, ${area.state}.` +
                  (area.neighborhoods ? ` Neighborhoods/radius: ${area.neighborhoods}.` : "") +
                  (area.interests ? ` Community interests: ${area.interests}.` : "") +
                  (area.priorities ? ` Organizational priorities: ${area.priorities}.` : "") +
                  (area.partner_types ? ` Partners/vendors to discover: ${area.partner_types}.` : ""),
                `Suggest community groups, food vendors, venues, local nonprofits, community events, and professional groups worth knowing. Be honest: these are unverified leads from your training knowledge, not live web research — say so, and never invent contact details, addresses or dates you don't actually know. Prefer well-known, real organizations.`,
                `Already in the directory (do not repeat): ${(known ?? []).map((r) => r.name).join(", ") || "nothing yet"}.`,
                `Output a short markdown briefing, then one line per new discovery exactly like: [[resource: <group|vendor|venue|nonprofit|event|professional|other> | <name> | <one line of details>]]. Max 6 resources. Also flag any listed directory entries that are likely duplicates or outdated.`,
              ].join("\n"),
              input: `Run a community discovery pass for ${area.city}, ${area.state}.`,
            });

            let text = "";
            for (const item of res.output ?? []) {
              if (item.type === "message") {
                for (const c of item.content ?? []) if (c.type === "output_text") text += c.text;
              }
            }

            const resourceRows = [...text.matchAll(/\[\[resource:\s*(.+?)\]\]/g)]
              .map((m) => (m[1] ?? "").split("|").map((s) => s.trim()))
              .filter((p) => p[0] && p[1])
              .slice(0, 6)
              .map(([type, name, details]) => ({
                user_id: userId,
                type: ["group", "vendor", "venue", "nonprofit", "event", "professional"].includes(type ?? "")
                  ? type! : "other",
                name: name!,
                details: details ?? "",
                source: "Community Scout",
                status: "suggested",
              }));
            const briefing = text.replace(/\n?\[\[resource:.+?\]\]/g, "").trim() || "No new findings this pass.";

            // Idempotent progress: findings + resources recorded before the lease clears.
            await supabaseAdmin.from("scout_findings").insert({
              user_id: userId, focus_area_id: area.id, summary: briefing,
            });
            if (resourceRows.length) await supabaseAdmin.from("resources").insert(resourceRows);

            const { data: mainThread } = await supabaseAdmin
              .from("threads").select("id").eq("user_id", userId).eq("kind", "main").maybeSingle();
            if (mainThread) {
              await supabaseAdmin.from("messages").insert({
                thread_id: mainThread.id, user_id: userId, role: "assistant",
                content: `🔎 **Community Scout — ${area.city}, ${area.state}**\n\n${briefing}\n\n_New discoveries are in your resource directory as suggestions to review._`,
              });
            }

            await supabaseAdmin.from("scout_state").upsert({
              user_id: userId, lease_until: null, last_run_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
            results.push({ userId, outcome: `ok: ${resourceRows.length} resources` });
          } catch (e) {
            // Circuit breaker: credit/policy failures pause the job until the owner resumes.
            if (e instanceof GatewayError && (e.httpStatus === 402 || e.httpStatus === 403)) {
              await supabaseAdmin.from("scout_state").upsert({
                user_id: userId, lease_until: null, paused: true,
                pause_reason: e.httpStatus === 402 ? "AI credits exhausted" : "AI access denied",
              }, { onConflict: "user_id" });
              results.push({ userId, outcome: "paused" });
              break;
            }
            console.error("Community Scout run failed", e);
            await supabaseAdmin.from("scout_state")
              .update({ lease_until: null }).eq("user_id", userId);
            results.push({ userId, outcome: "error" });
          }
        }

        return Response.json({ ok: true, results });
      },
    },
  },
});
