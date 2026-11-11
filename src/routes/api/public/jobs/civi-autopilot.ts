import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const MAX_DRIVE = 3; // browser sessions stepped per run
const MAX_REVIEW = 3; // orgs reviewed per run
const REVIEW_EVERY_MIN = 5; // check every 5 min; only acts when something changed (or every 30 min)
const QUIET_REVIEW_MIN = 30;
const MAX_LEARN = 4; // orgs learned from per run
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
        const { learnAboutOrg } = await import("@/lib/learn.server");
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

        // 2) Every 5 minutes (on by default): check Facebook notifications in an idle, signed-in browser.
        const notifDue = new Date(Date.now() - 5 * 60_000).toISOString();
        const { data: fbs } = await db.from("browser_sessions").select("id, user_id, agent_status, site, signed_in, created_at")
          .eq("status", "running").eq("signed_in", true).ilike("site", "%facebook%").order("created_at", { ascending: false }).limit(20);
        const seen = new Set<string>();
        for (const b of fbs ?? []) {
          if (seen.has(b.user_id)) continue; seen.add(b.user_id);
          if (["driving", "needs_user", "awaiting_approval"].includes(b.agent_status ?? "")) continue;
          const { data: o } = await db.from("organizations").select("notif_checks").eq("user_id", b.user_id).maybeSingle();
          if (o && o.notif_checks === false) continue;
          const { data: st } = await db.from("autopilot_state").select("last_notif_check").eq("user_id", b.user_id).maybeSingle();
          if (st?.last_notif_check && st.last_notif_check > notifDue) continue;
          await db.from("autopilot_state").upsert({ user_id: b.user_id, last_notif_check: new Date().toISOString() }, { onConflict: "user_id" });
          await retargetSession(db, b.id, `NOTIFICATION CHECK: open https://www.facebook.com/notifications and look for comments, replies and mentions newer than ${st?.last_notif_check ?? "the last hour"} (on our Page, our posts and groups we're in). Don't reply, like or post anything. Use done with a short list: who, what they said, where, and a suggested reply for each. If there is nothing new, use done with exactly NO_NEW.`);
          out.push({ notif: b.id });
        }

        // 2b) Every 5 minutes, for every org: learn new durable facts from fresh activity into memory.
        {
          const { data: all } = await db.from("organizations").select("user_id").limit(200);
          let learned = 0;
          for (const o of all ?? []) {
            if (learned >= MAX_LEARN) break;
            const { data: st } = await db.from("autopilot_state").select("last_learn_at, paused_reason").eq("user_id", o.user_id).maybeSingle();
            if (st?.paused_reason) continue;
            if (st?.last_learn_at && st.last_learn_at > new Date(Date.now() - 5 * 60_000).toISOString()) continue;
            const since = st?.last_learn_at ?? null;
            const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("user_id", o.user_id).gt("created_at", since ?? "1970-01-01");
            const stamp = new Date().toISOString();
            await db.from("autopilot_state").upsert({ user_id: o.user_id, last_learn_at: stamp }, { onConflict: "user_id" });
            if (!count) continue;
            learned++;
            try { out.push({ learned: o.user_id, facts: await learnAboutOrg(db, o.user_id, since) }); }
            catch (e) {
              const msg = String(e);
              if (/402|403|payment|permission/i.test(msg)) await db.from("autopilot_state").update({ paused_reason: msg.slice(0, 200) }).eq("user_id", o.user_id);
              out.push({ learn: o.user_id, error: msg.slice(0, 200) });
            }
          }
        }

        // 3) Every 5 minutes: review chats and act per the org's autonomy level.
        const due = new Date(Date.now() - REVIEW_EVERY_MIN * 60_000).toISOString();
        const { data: orgs } = await db.from("organizations").select("user_id, autonomy").neq("autonomy", "manual").limit(50);
        let reviewed = 0;
        for (const org of orgs ?? []) {
          if (reviewed >= MAX_REVIEW) break;
          const { data: st } = await db.from("autopilot_state").select("last_review_at, lease_until, paused_reason, last_top").eq("user_id", org.user_id).maybeSingle();
          if (st?.paused_reason) continue;
          if (st?.last_review_at && st.last_review_at > due) continue;
          // Between quiet reviews, only act when something new happened (messages, approvals, form replies).
          if (st?.last_review_at && st.last_review_at > new Date(Date.now() - QUIET_REVIEW_MIN * 60_000).toISOString()) {
            const [m, a] = await Promise.all([
              db.from("messages").select("id", { count: "exact", head: true }).eq("user_id", org.user_id).gt("created_at", st.last_review_at),
              db.from("approvals").select("id", { count: "exact", head: true }).eq("user_id", org.user_id).gt("created_at", st.last_review_at),
            ]);
            if (!m.count && !a.count) continue;
          }
          const now = new Date().toISOString();
          if (st?.lease_until && st.lease_until > now) continue;
          await db.from("autopilot_state").upsert({ user_id: org.user_id, lease_until: new Date(Date.now() + 5 * 60_000).toISOString(), last_review_at: st?.last_review_at ?? null }, { onConflict: "user_id" });
          reviewed++;
          try {
            const { data: main } = await db.from("threads").select("id").eq("user_id", org.user_id).eq("kind", "main").maybeSingle();
            if (!main) continue;
            const items = await generateSuggestions(db, org.user_id, main.id, true);
            const top = items[0];
            if (top && top.label !== st?.last_top) {
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
            await db.from("autopilot_state").update({ last_review_at: new Date().toISOString(), lease_until: null, last_top: top?.label ?? st?.last_top ?? null }).eq("user_id", org.user_id);
            out.push({ review: org.user_id, mode: org.autonomy, top: top?.label ?? null });
          } catch (e) {
            const msg = String(e);
            const paused = /402|403|payment|permission/i.test(msg) ? msg.slice(0, 200) : null;
            await db.from("autopilot_state").update({ lease_until: null, last_review_at: new Date().toISOString(), paused_reason: paused }).eq("user_id", org.user_id);
            out.push({ review: org.user_id, error: msg.slice(0, 200) });
          }
        }
        // 4) Scheduled (repeating) tasks: when due, queue an approval that runs the task's instruction, then roll the due date forward.
        const today = new Date().toISOString().slice(0, 10);
        const { data: dueTasks } = await db.from("tasks").select("id, user_id, title, repeat, run_prompt, thread_id, due_date, last_run_at")
          .not("repeat", "is", null).eq("done", false).lte("due_date", today).limit(25);
        for (const t of dueTasks ?? []) {
          if (t.last_run_at && t.last_run_at.slice(0, 10) === today) continue;
          let thread = t.thread_id;
          if (thread) { const { data: th } = await db.from("threads").select("id").eq("id", thread).maybeSingle(); thread = th?.id ?? null; }
          if (!thread) { const { data: main } = await db.from("threads").select("id").eq("user_id", t.user_id).eq("kind", "main").maybeSingle(); thread = main?.id ?? null; }
          const next = nextRun(t.due_date!, t.repeat!, today);
          // Claim first so overlapping runs can't double-queue.
          const { data: claimed } = await db.from("tasks").update({ last_run_at: new Date().toISOString(), due_date: next })
            .eq("id", t.id).eq("due_date", t.due_date!).select("id");
          if (!claimed?.length || !thread) continue;
          await db.from("approvals").insert({ user_id: t.user_id, action_type: "other", title: `Scheduled: ${t.title}`.slice(0, 200),
            details: `${t.run_prompt ?? t.title}\n\nRepeats ${t.repeat}; next run ${next}.`, payload: { kind: "civi_suggestion", thread, prompt: t.run_prompt ?? t.title } });
          out.push({ scheduled: t.id, next });
        }
        return Response.json({ ok: true, out });
      },
    },
  },
});

function nextRun(from: string, repeat: string, today: string): string {
  const d = new Date(from + "T12:00:00Z");
  const step = () => {
    if (repeat === "daily") d.setUTCDate(d.getUTCDate() + 1);
    else if (repeat === "weekly") d.setUTCDate(d.getUTCDate() + 7);
    else if (repeat === "biweekly") d.setUTCDate(d.getUTCDate() + 14);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  };
  do step(); while (d.toISOString().slice(0, 10) <= today);
  return d.toISOString().slice(0, 10);
}
