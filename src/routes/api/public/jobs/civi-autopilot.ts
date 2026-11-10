import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const MAX_DRIVE = 3; // browser sessions stepped per run
const MAX_REVIEW = 3; // orgs reviewed per run
const REVIEW_EVERY_MIN = 30;
const IDLE_CHAT_SEC = 45; // if the chat page hasn't stepped recently, drive in the background

export const Route = createFileRoute("/api/public/jobs/civi-autopilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { runAgentStep, startNextQueued, retargetSession } = await import("@/lib/browser.functions");
        const { generateSuggestions } = await import("@/lib/suggestions.server");
        const out: Record<string, unknown>[] = [];

        // 1) Keep driving browsers that still have work, even with the chat closed.
        const idleBefore = new Date(Date.now() - IDLE_CHAT_SEC * 1000).toISOString();
        const { data: driving } = await db.from("browser_sessions").select("id, user_id")
          .eq("status", "running").eq("agent_status", "driving")
          .or(`last_step_at.is.null,last_step_at.lt.${idleBefore}`).limit(MAX_DRIVE);
        await Promise.all((driving ?? []).map(async (s) => {
          try { out.push({ drive: s.id, ...(await runAgentStep(db, s.user_id, s.id)) }); }
          catch (e) { out.push({ drive: s.id, error: String(e).slice(0, 200) }); }
        }));
        // Finished browsers with queued approved work pick it up.
        const { data: idle } = await db.from("browser_sessions").select("id, queue").eq("status", "running").eq("agent_status", "done").limit(10);
        for (const s of idle ?? []) if (Array.isArray(s.queue) && s.queue.length) await startNextQueued(db, s.id);

        // 2) Every 30 minutes: review chats and act per the org's autonomy level.
        const due = new Date(Date.now() - REVIEW_EVERY_MIN * 60_000).toISOString();
        const { data: orgs } = await db.from("organizations").select("user_id, autonomy").neq("autonomy", "manual").limit(50);
        let reviewed = 0;
        for (const org of orgs ?? []) {
          if (reviewed >= MAX_REVIEW) break;
          const { data: st } = await db.from("autopilot_state").select("last_review_at, lease_until, paused_reason").eq("user_id", org.user_id).maybeSingle();
          if (st?.paused_reason) continue;
          if (st?.last_review_at && st.last_review_at > due) continue;
          const now = new Date().toISOString();
          if (st?.lease_until && st.lease_until > now) continue;
          await db.from("autopilot_state").upsert({ user_id: org.user_id, lease_until: new Date(Date.now() + 5 * 60_000).toISOString(), last_review_at: st?.last_review_at ?? null }, { onConflict: "user_id" });
          reviewed++;
          try {
            const { data: main } = await db.from("threads").select("id").eq("user_id", org.user_id).eq("kind", "main").maybeSingle();
            if (!main) continue;
            const items = await generateSuggestions(db, org.user_id, main.id, true);
            const top = items[0];
            if (top) {
              if (org.autonomy === "assisted") {
                await db.from("approvals").insert({ user_id: org.user_id, action_type: "other", title: `Civi suggests: ${top.label}`, details: top.prompt, payload: { kind: "civi_suggestion", thread: main.id, prompt: top.prompt } });
              } else {
                const { data: br } = await db.from("browser_sessions").select("id, agent_status").eq("thread_id", main.id).eq("status", "running").order("created_at", { ascending: false }).limit(1).maybeSingle();
                let note = "";
                if (top.browser_goal && br && !["driving", "needs_user", "awaiting_approval"].includes(br.agent_status ?? "")) {
                  await retargetSession(db, br.id, top.browser_goal);
                  note = " I've started it in your open browser — anything that joins, posts or submits still waits for your approval.";
                }
                await db.from("messages").insert({ thread_id: main.id, user_id: org.user_id, role: "assistant",
                  content: `🤖 **Auto mode check-in** — next move: **${top.label}**.${note}\n\n${note ? "" : `${top.prompt}\n\n`}[[choices: ${items.slice(0, 3).map((i) => i.label.replace(/[|\]]/g, "")).join(" | ")}]]` });
              }
            }
            await db.from("autopilot_state").update({ last_review_at: new Date().toISOString(), lease_until: null }).eq("user_id", org.user_id);
            out.push({ review: org.user_id, mode: org.autonomy, top: top?.label ?? null });
          } catch (e) {
            const msg = String(e);
            const paused = /402|403|payment|permission/i.test(msg) ? msg.slice(0, 200) : null;
            await db.from("autopilot_state").update({ lease_until: null, last_review_at: new Date().toISOString(), paused_reason: paused }).eq("user_id", org.user_id);
            out.push({ review: org.user_id, error: msg.slice(0, 200) });
          }
        }
        return Response.json({ ok: true, out });
      },
    },
  },
});
