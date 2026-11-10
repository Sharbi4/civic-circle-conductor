import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AgentAction } from "@/lib/browserAgent.server";

const GATEWAY = "https://connector-gateway.lovable.dev/udc_browserbase";

type SupabaseLike = {
  from: (table: string) => any;
};

async function bbRequest(
  path: string,
  init: RequestInit,
  lovableKey: string,
  connKey: string,
) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Browserbase request failed [${res.status}]: ${body}`);
    throw new Error(`Browser service error [${res.status}]`);
  }
  return res.json();
}

/**
 * Opens a real cloud browser session, stores it and returns the row.
 * Called from server-function handlers only — keys are read in the handler.
 */
export async function openBrowserSession(opts: {
  supabase: SupabaseLike;
  userId: string;
  threadId: string;
  task: string;
  lovableKey: string;
  connKey: string;
}) {
  const { supabase, userId, threadId, task, lovableKey, connKey } = opts;

  const session = await bbRequest(
    "/v1/sessions",
    { method: "POST", body: JSON.stringify({ timeout: 3600, keepAlive: true }) },
    lovableKey,
    connKey,
  );
  const debug = await bbRequest(
    `/v1/sessions/${session.id}/debug`,
    { method: "GET" },
    lovableKey,
    connKey,
  );

  const { data: row, error } = await supabase
    .from("browser_sessions")
    .insert({
      user_id: userId,
      thread_id: threadId,
      task,
      session_id: session.id,
      live_url: debug.debuggerFullscreenUrl,
      connect_url: session.connectUrl ?? null,
      goal: task,
      agent_status: session.connectUrl ? "driving" : "idle",
      status: "running",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string, sessionId: session.id as string };
}

export const startBrowserSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ threadId: z.string().uuid(), task: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const connKey = process.env["UDC_BROWSERBASE_API_KEY"];
    if (!lovableKey || !connKey) throw new Error("The browser service is not connected yet.");

    const { data: thread, error: tErr } = await supabase
      .from("threads").select("id").eq("id", data.threadId).maybeSingle();
    if (tErr || !thread) throw new Error("Chat not found");

    const { id } = await openBrowserSession({
      supabase, userId, threadId: data.threadId, task: data.task, lovableKey, connKey,
    });

    await supabase.from("messages").insert({
      thread_id: data.threadId,
      user_id: userId,
      role: "assistant",
      content: `I've opened a live browser to work on: **${data.task}**. Watch it below — you can click into it and take over anytime.\n\n[[browser: ${id} | ${data.task}]]`,
    });

    return { id };
  });

export const endBrowserSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionRowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const connKey = process.env["UDC_BROWSERBASE_API_KEY"];

    const { data: row, error } = await supabase
      .from("browser_sessions")
      .select("id, session_id, status")
      .eq("id", data.sessionRowId)
      .maybeSingle();
    if (error || !row) throw new Error("Browser session not found");

    if (row.status === "running" && lovableKey && connKey) {
      try {
        const session = await bbRequest(
          `/v1/sessions/${row.session_id}`,
          { method: "GET" },
          lovableKey,
          connKey,
        );
        await bbRequest(
          `/v1/sessions/${row.session_id}`,
          {
            method: "POST",
            body: JSON.stringify({ projectId: session.projectId, status: "REQUEST_RELEASE" }),
          },
          lovableKey,
          connKey,
        );
      } catch {
        // Best effort — sessions also expire on their own.
      }
    }

    const { error: upErr } = await supabase
      .from("browser_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.sessionRowId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

const MAX_STEPS = 25;

type Step = { action: string; note: string };

/** Give the open browser a new goal while keeping what it already did (its memory). */
export async function retargetSession(supabase: SupabaseLike, id: string, goal: string) {
  const { data: r } = await supabase.from("browser_sessions").select("steps").eq("id", id).maybeSingle();
  const old = (Array.isArray(r?.steps) ? r.steps : []) as Step[];
  const steps = [...old.slice(-40), { action: "task", note: `New task: ${goal.slice(0, 300)}` }];
  await supabase.from("browser_sessions")
    .update({ goal, agent_status: "driving", steps, submit_approved: false, handoff_reason: null }).eq("id", id);
}

/** Keep one browser per chat: release any other running browsers in this chat. */
export async function closeOtherBrowsers(supabase: SupabaseLike, threadId: string, keepId: string) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["UDC_BROWSERBASE_API_KEY"];
  const { data: others } = await supabase.from("browser_sessions")
    .select("id, session_id").eq("thread_id", threadId).eq("status", "running").neq("id", keepId);
  for (const o of (others ?? []) as { id: string; session_id: string }[]) {
    if (lovableKey && connKey) {
      try {
        const sess = await bbRequest(`/v1/sessions/${o.session_id}`, { method: "GET" }, lovableKey, connKey);
        await bbRequest(`/v1/sessions/${o.session_id}`, { method: "POST", body: JSON.stringify({ projectId: sess.projectId, status: "REQUEST_RELEASE" }) }, lovableKey, connKey);
      } catch { /* already gone */ }
    }
    await supabase.from("browser_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", o.id);
  }
}

/** Runs ONE step of Civi driving the browser toward the session's goal. The card calls it in a loop. */
export const browserAgentStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionRowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { withPage, snapshot, perform, parseAction } = await import("@/lib/browserAgent.server");
    const { generateResponse } = await import("@lovable.dev/ai-gateway");

    const { data: row, error } = await supabase
      .from("browser_sessions")
      .select("id, thread_id, goal, task, status, agent_status, steps, submit_approved, connect_url")
      .eq("id", data.sessionRowId).maybeSingle();
    if (error || !row) throw new Error("Browser session not found");
    if (row.status !== "running" || row.agent_status !== "driving" || !row.connect_url) {
      return { agentStatus: row.agent_status };
    }
    const steps = (Array.isArray(row.steps) ? row.steps : []) as Step[];
    const goal = row.goal ?? row.task;
    let taskStart = 0;
    steps.forEach((st, i) => { if (st.action === "task") taskStart = i + 1; });
    const current = steps.slice(taskStart);
    const earlier = steps.slice(Math.max(0, taskStart - 20), Math.max(0, taskStart - 1));

    const save = async (patch: { agent_status?: string; submit_approved?: boolean }, note?: { action: string; note: string }) => {
      const next = note ? [...steps, note] : steps;
      await supabase.from("browser_sessions").update({ ...patch, steps: next }).eq("id", row.id);
    };
    const post = (content: string) =>
      supabase.from("messages").insert({ thread_id: row.thread_id, user_id: userId, role: "assistant", content });

    if (current.length >= MAX_STEPS) {
      await save({ agent_status: "done" }, { action: "done", note: "Reached the step limit — paused so you can take over." });
      await post(`⏸️ I paused the browser task **${goal}** after ${MAX_STEPS} steps. Take over in the browser, or tell me how to continue.`);
      return { agentStatus: "done" };
    }

    try {
      const result = await withPage(row.connect_url, async (page) => {
        const state = await snapshot(page);
        try {
          const host = new URL(state.url).hostname.replace(/^www\./, "");
          await supabase.from("browser_sessions").update({ site: host, signed_in: !state.hasPassword && !/login|checkpoint|two_step/.test(state.url) }).eq("id", row.id);
        } catch { /* about:blank etc. */ }
        const { data: saved } = await supabase.from("site_credentials").select("domain").eq("user_id", userId);
        const savedSites = (saved ?? []).map((c: { domain: string }) => c.domain).join(", ") || "(none)";
        const res = await generateResponse({
          model: "openai/gpt-6.1-terra",
          instructions: [
            "You are Civi, a community-organizing agent driving a real web browser one action at a time to reach the organizer's goal (e.g. find vendors on Eventbrite, fill a booking/inquiry form).",
            "Reply with ONLY one JSON object. Allowed actions:",
            '{"action":"navigate","url":"https://..."} | {"action":"click","index":N} | {"action":"type","index":N,"text":"..."} | {"action":"select","index":N,"value":"..."} | {"action":"press_enter","index":N} | {"action":"scroll"} | {"action":"login","username_index":N,"password_index":N} | {"action":"submit","index":N} | {"action":"handoff","reason":"what the organizer needs to do"} | {"action":"request_approval","title":"...","details":"..."} | {"action":"done","summary":"markdown summary of what you found/did, with links"}',
            "Add a short \"reason\" field to every action. Use element indexes from the page state only.",
            row.submit_approved
              ? "The organizer has APPROVED submitting. You may use submit on the final send/book/pay button."
              : "Never click a button that sends a message, posts, joins a group, books, registers, purchases or pays. When a form is filled and ready, use request_approval describing exactly what will be sent and to whom. Use plain click only for navigation, search and opening pages.",
            "If the page shows a sign-in form and the site is in the organizer's saved logins, use login with the username/email field index and the password field index (use the same index for both if only one field shows). You never see the password; the system fills it in. After login, click the sign-in button with click.",
            "Use handoff (NOT done) whenever only the organizer can continue: a login with no saved credentials, a verification/2FA code, a CAPTCHA, or a personal choice. Say exactly what they need to do. They'll hand control back and you'll continue the same goal.",
            "Never invent contact details. Never ask the organizer to paste passwords or codes in chat.",
          ].join("\n"),
          input: [{
            role: "user" as const,
            content: `Goal: ${goal}\n\nSaved logins available for: ${savedSites}\n\nEarlier in this same browser (already done — don't redo, build on it):\n${earlier.map((s) => `- ${s.note}`).join("\n") || "(nothing yet)"}\n\nSteps so far on this goal:\n${current.map((s, i) => `${i + 1}. ${s.note}`).join("\n") || "(none)"}\n\nCurrent page state:\n${JSON.stringify(state)}`,
          }],
        });
        let text = "";
        for (const item of res.output ?? []) if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text") text += c.text;
        const action = parseAction(text);
        if (!action) return { action: null, note: "" };
        if (action.action === "submit" && !row.submit_approved) {
          return { action: { action: "request_approval", title: "Submit form", details: action.reason ?? goal } satisfies AgentAction as AgentAction, note: "" };
        }
        if (action.action === "login") {
          const { findLoginForHost, normalizeDomain } = await import("@/lib/credentials.functions");
          const host = normalizeDomain(state.url);
          const creds = await findLoginForHost(userId, host);
          if (!creds) return { action: { action: "done", summary: `I reached a sign-in page on ${host}, but there's no saved login for it. Add one in **Saved logins**, or take over and sign in yourself.` } as AgentAction, note: "" };
          const { fillLogin } = await import("@/lib/browserAgent.server");
          const note = await fillLogin(page, action.username_index, action.password_index, creds);
          return { action, note: `${note} (${creds.label})` };
        }
        const note = await perform(page, action);
        return { action, note };
      });

      const a = result.action;
      if (!a) {
        await save({}, { action: "think", note: "Re-reading the page…" });
        return { agentStatus: "driving" };
      }
      const why = a.reason ? ` — ${a.reason}` : "";
      if (a.action === "request_approval") {
        const { data: ap } = await supabase.from("approvals").insert({
          user_id: userId, action_type: "booking", title: a.title, details: a.details, browser_session_id: row.id,
        }).select("id").single();
        await save({ agent_status: "awaiting_approval" }, { action: "approval", note: `Waiting for approval: ${a.title}` });
        await post(`🛑 The form for **${goal}** is filled in and ready. Before I submit, please review it in the **Approvals** inbox:\n\n**${a.title}** — ${a.details}${ap ? "" : ""}`);
        return { agentStatus: "awaiting_approval" };
      }
      if (a.action === "handoff") {
        await supabase.from("browser_sessions").update({ handoff_reason: a.reason }).eq("id", row.id);
        await save({ agent_status: "needs_user" }, { action: "handoff", note: `Your turn: ${a.reason}` });
        await post(`🙋 I need you for a moment in the browser: **${a.reason}**\n\nClick into the browser to do it, then press **Done — Civi, continue** and I'll pick up where I left off.`);
        return { agentStatus: "needs_user" };
      }
      if (a.action === "done") {
        await save({ agent_status: "done" }, { action: "done", note: `Finished: ${String(a.summary).replace(/\s+/g, " ").slice(0, 400)}` });
        await post(`✅ Browser task finished: **${goal}**\n\n${a.summary}`);
        return { agentStatus: "done" };
      }
      if (a.action === "submit") {
        await save({ submit_approved: false }, { action: a.action, note: `${result.note}${why}` });
        return { agentStatus: "driving" };
      }
      await save({}, { action: a.action, note: `${result.note}${why}` });
      return { agentStatus: "driving" };
    } catch (e) {
      console.error("Browser agent step failed", e);
      await save({ agent_status: "failed" }, { action: "error", note: "Lost connection to the browser — the session may have expired." });
      return { agentStatus: "failed" };
    }
  });

export const setBrowserDriving = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionRowId: z.string().uuid(), driving: z.boolean(), goal: z.string().max(1500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: { agent_status: string; goal?: string; handoff_reason?: null; steps?: never[] } = { agent_status: data.driving ? "driving" : "stopped" };
    if (data.driving) patch.handoff_reason = null;
    if (data.goal) { await retargetSession(context.supabase, data.sessionRowId, data.goal); return { ok: true }; }
    const { error } = await context.supabase.from("browser_sessions").update(patch).eq("id", data.sessionRowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** First-time Facebook setup: saves the area and points the open browser at the groups + page review task. */
export const startFacebookSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionRowId: z.string().uuid(), location: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase.from("browser_sessions").select("id, thread_id").eq("id", data.sessionRowId).maybeSingle();
    if (!row) throw new Error("Browser session not found");
    await supabase.from("organizations").update({ facebook_setup_location: data.location }).eq("user_id", userId);
    const goal = `On Facebook (already signed in): 1) Search Facebook groups near ${data.location} that match our mission and focus areas. Open the best 5-8, note name, link, member count, privacy and join questions. Do NOT click Join. 2) Check whether our organization has a Facebook Page (search our org name, and check the Pages the account manages). Review it: profile/cover photo, about/bio, contact info, how recent the last post is. When finished, use done with a markdown summary: a shortlist of groups (with links) to approve joining, and a Page "TLC" checklist with concrete fixes and 3 suggested post ideas.`;
    await retargetSession(supabase, row.id, goal);
    await closeOtherBrowsers(supabase, row.thread_id, row.id);
    await supabase.from("messages").insert({
      thread_id: row.thread_id, user_id: userId, role: "assistant",
      content: `Great — I'm searching Facebook for groups near **${data.location}** and checking your organization's Page. I won't join anything or post until you approve. Watch along in the browser above.`,
    });
    return { ok: true };
  });
