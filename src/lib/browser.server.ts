import type { AgentAction } from "@/lib/browserAgent.server";
import { VENDOR_SCOUT_BROWSER } from "@/lib/eventPlaybook";
import { browserNeedsProgressReport, BROWSER_PROGRESS_INSTRUCTIONS } from "./browserProgress.shared";
import { isLinkedInBrowserTask, isLinkedInUrl, LINKEDIN_API_ONLY } from "./linkedinRouting.shared";
const GATEWAY = "https://connector-gateway.lovable.dev/udc_browserbase";

type SupabaseLike = {
  from: (table: string) => any;
};

export async function bbRequest(
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
  if (isLinkedInBrowserTask(task)) throw new Error(LINKEDIN_API_ONLY);

  const session = await bbRequest(
    "/v1/sessions",
    { method: "POST", body: JSON.stringify({ timeout: 3600, keepAlive: true, browserSettings: { viewport: { width: 640, height: 480 } } }) },
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


type Step = { action: string; note: string };

/** Give the open browser a new goal while keeping what it already did (its memory). */
export async function retargetSession(supabase: SupabaseLike, id: string, goal: string) {
  if (isLinkedInBrowserTask(goal)) throw new Error(LINKEDIN_API_ONLY);
  const { data: r } = await supabase.from("browser_sessions").select("steps").eq("id", id).maybeSingle();
  const old = (Array.isArray(r?.steps) ? r.steps : []) as Step[];
  const steps = [...old.slice(-40), { action: "task", note: `New task: ${goal.slice(0, 300)}` }];
  await supabase.from("browser_sessions")
    .update({ goal, agent_status: "driving", steps, submit_approved: false, handoff_reason: null }).eq("id", id);
}

function parseMarker<T>(text: string, name: string): T | null {
  const m = text.match(new RegExp(`\\[\\[${name}:\\s*([\\s\\S]+?)\\]\\](?!\\])`));
  if (!m) return null;
  try { return JSON.parse(m[1] ?? "") as T; } catch { return null; }
}

/** Starts the next approved task waiting for this browser, if any. */
export async function startNextQueued(supabase: SupabaseLike, id: string): Promise<boolean> {
  const { data: r } = await supabase.from("browser_sessions").select("queue, status").eq("id", id).maybeSingle();
  const q = (Array.isArray(r?.queue) ? r.queue : []) as { goal: string; approvalId?: string }[];
  if (!q.length || r?.status !== "running") return false;
  const [next, ...rest] = q;
  if (!next) return false;
  await retargetSession(supabase, id, next.goal);
  await supabase.from("browser_sessions").update({ queue: rest, submit_approved: true, active_approval_id: next.approvalId ?? null }).eq("id", id);
  return true;
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

/** One browser step; used by the open chat and by the background autopilot. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runAgentStep(supabase: any, userId: string, sessionRowId: string): Promise<{ agentStatus: string | null }> {
    const { withPage, snapshot, perform, parseAction } = await import("@/lib/browserAgent.server");
    const { generateResponse } = await import("@lovable.dev/ai-gateway");

    const { data: row, error } = await supabase
      .from("browser_sessions")
      .select("id, thread_id, goal, task, status, agent_status, steps, submit_approved, connect_url, active_approval_id")
      .eq("id", sessionRowId).maybeSingle();
    if (error || !row) throw new Error("Browser session not found");
    if (row.status !== "running" || row.agent_status !== "driving" || !row.connect_url) {
      return { agentStatus: row.agent_status };
    }
    // Single driver: only one caller (open chat or background autopilot) runs a step at a time.
    const nowIso = new Date().toISOString();
    const { data: leased } = await supabase.from("browser_sessions")
      .update({ driver_lease: new Date(Date.now() + 90_000).toISOString(), last_step_at: nowIso })
      .eq("id", row.id).or(`driver_lease.is.null,driver_lease.lt.${nowIso}`).select("id").maybeSingle();
    if (!leased) return { agentStatus: row.agent_status };
    try {
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

    const finishApproval = async (state: string, error: string | null = null) => {
      if (!row.active_approval_id) return;
      await supabase.from('approvals').update({ run_state: state, run_error: error, run_finished_at: new Date().toISOString() }).eq('id', row.active_approval_id).eq('user_id', userId);
      await supabase.from('browser_sessions').update({ active_approval_id: null }).eq('id', row.id);
    };
    if (isLinkedInBrowserTask(goal)) {
      await finishApproval("needs_review", "LinkedIn actions must use the connected account, not the browser.");
      await save({ agent_status: "done" }, { action: "done", note: "LinkedIn action routed back to connected account" });
      await post(LINKEDIN_API_ONLY);
      return { agentStatus: "done" };
    }
    const progressReport = browserNeedsProgressReport(steps);
    if (progressReport) await finishApproval('needs_review', 'Research checkpoint reached; completion is not confirmed.');

    try {
      const result = await withPage(row.connect_url, async (page) => {
        const state = await snapshot(page);
        if (isLinkedInUrl(state.url)) return { action: { action: "done", summary: LINKEDIN_API_ONLY } as AgentAction, note: "LinkedIn browser disabled" };
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
            "When your goal involved finding Facebook groups or reviewing a Facebook Page, end your done summary with these lines (exact format, real links you visited only): [[fb_groups: [{\"name\":\"...\",\"url\":\"https://www.facebook.com/groups/...\"}]]] and, if you found the organization's Page, [[fb_page: {\"url\":\"https://www.facebook.com/...\",\"post_text\":\"a warm, short Page update sharing what the org is refreshing/working on (no checklist jargon), ready to post\"}]].",
            "Write each step's reason as a short plain action in past tense, like \"Joined Tucson Activists\", \"Read the South Tucson group rules\", \"Searched groups for voter registration\" (no element numbers or URLs).",
            VENDOR_SCOUT_BROWSER,
            "List fb_groups most relevant to the mission first; skip groups already joined earlier in this browser.",
            "When the goal says it is APPROVED by the organizer, you may use submit on the Join / Post button that completes it.",
            "For an approved action, use done only after the page confirms completion. Include a visible confirmation or resulting object link in summary. If success cannot be verified, use handoff instead. Never claim success from merely clicking Submit.",
            "For venue booking, verify the selected date/time, capacity, accessibility, price, deposit and cancellation terms on the official website. Prepare the actual enquiry or reservation rather than stopping after reading a venue page. Pause for explicit approval before an enquiry or booking submission. Booking approval never authorizes spending: obtain a separate approval specifying payee, exact amount and what is purchased before payment. Use handoff for entering card number, CVV, banking credentials or payment verification; never type, request, repeat or include these secrets in summaries. Report booked or paid only after visible confirmation with a reference or receipt; an availability enquiry alone is not a reservation.",
            "Never invent contact details. Never ask the organizer to paste passwords or codes in chat.",
            "Never navigate to LinkedIn or perform LinkedIn actions through this browser. LinkedIn runs only through its connected API; explain unsupported actions rather than attempting browser login.",
            "Be proactive when research is exhausted or going in circles: finish with verified findings, remaining unknowns and a concrete next recommendation. Missing online venue availability calls for a sourced booking-contact lookup and an offer of an approved phone inquiry, not asking the organizer to drive the browser. Only hand off for genuine human-only obstacles.",
            ...(progressReport ? [BROWSER_PROGRESS_INSTRUCTIONS] : []),
          ].join("\n"),
          input: [{
            role: "user" as const,
            content: `Goal: ${goal}\n\nSaved logins available for: ${savedSites}\n\nEarlier in this same browser (already done — don't redo, build on it):\n${earlier.map((s) => `- ${s.note}`).join("\n") || "(nothing yet)"}\n\nSteps so far on this goal:\n${current.map((s, i) => `${i + 1}. ${s.note}`).join("\n") || "(none)"}\n\nCurrent page state:\n${JSON.stringify(state)}`,
          }],
        });
        let text = "";
        for (const item of res.output ?? []) if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text") text += c.text;
        const action = parseAction(text);
        if (action?.action === "navigate" && isLinkedInUrl(action.url)) return { action: { action: "done", summary: LINKEDIN_API_ONLY } as AgentAction, note: "LinkedIn browser disabled" };
        if (progressReport && action?.action !== "done") return { action: { action: "done", summary: "Online research has not confirmed the booking details yet. My next recommendation is to find the venue's official booking contact and prepare an availability call for your approval. No enquiry, reservation or payment has been made.\n\n[[choices: Find booking contact | Compare alternatives | Pause research]]" } as AgentAction, note: "Research checkpoint" };
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
        if (!progressReport) await finishApproval("succeeded");
        const summary = String(a.summary ?? "");
        const groups = parseMarker<{ name: string; url: string }[]>(summary, "fb_groups") ?? [];
        const page = parseMarker<{ url: string; post_text: string }>(summary, "fb_page");
        const vendors = parseMarker<{ type?: string; name: string; details?: string; url?: string }[]>(summary, "vendors") ?? [];
        const vRows = vendors.filter((v) => v?.name && (!v.url || v.url.startsWith("https://"))).slice(0, 10).map((v) => ({
          user_id: userId, type: v.type === "venue" ? "venue" : "vendor", name: v.name.slice(0, 160),
          details: (v.details ?? "").slice(0, 400) || null, source: v.url ?? null,
        }));
        if (vRows.length) {
          const { data: existing } = await supabase.from("resources").select("name").eq("user_id", userId);
          const have = new Set((existing ?? []).map((e: { name: string }) => e.name.toLowerCase()));
          const fresh = vRows.filter((r) => !have.has(r.name.toLowerCase()));
          if (fresh.length) await supabase.from("resources").insert(fresh);
        }
        const cleanSummary = summary.replace(/\n?\[\[vendors:[\s\S]+?\]\]\]?/g, "").replace(/\n?\[\[fb_(?:groups|page):[\s\S]+?\]\]\]?/g, "").trim();
        const fbRows = [
          ...groups.filter((g) => g?.url?.startsWith("https://www.facebook.com/groups/") && g.name).slice(0, 10).map((g) => ({
            user_id: userId, action_type: "outreach", title: `Join Facebook group: ${g.name.slice(0, 120)}`,
            details: g.url, payload: { kind: "fb_join_group", session: row.id, name: g.name.slice(0, 120), url: g.url },
          })),
          ...(page?.url?.startsWith("https://www.facebook.com/") && page.post_text ? [{
            user_id: userId, action_type: "outreach", title: "Post a Page update on Facebook",
            details: page.post_text.slice(0, 2000), payload: { kind: "fb_page_post", session: row.id, url: page.url, text: page.post_text.slice(0, 2000) },
          }] : []),
        ];
        if (goal.startsWith("NOTIFICATION CHECK") && /^\s*NO_NEW\s*$/.test(cleanSummary)) {
          await save({ agent_status: "done" }, { action: "done", note: "Checked notifications — nothing new" });
          if (await startNextQueued(supabase, row.id)) return { agentStatus: "driving" };
          return { agentStatus: "done" };
        }
        if (fbRows.length) {
          const { data: savedApprovals } = await supabase.from("approvals").insert(fbRows).select('id, payload');
          if (savedApprovals) {
            const { applyStandingApprovals } = await import('./approvals.server');
            await applyStandingApprovals(supabase, userId, savedApprovals);
          }
        }
        await save({ agent_status: "done" }, { action: "done", note: `Finished: ${cleanSummary.replace(/\s+/g, " ").slice(0, 400)}` });
        await post(`${progressReport ? "🔎 **Research checkpoint — next steps**" : goal.startsWith("NOTIFICATION CHECK") ? "🔔 **New on Facebook**" : `✅ Browser task finished: **${goal}**`}\n\n${cleanSummary}${fbRows.length ? `\n\n📥 I put ${fbRows.length} request${fbRows.length > 1 ? "s" : ""} in your **Approvals** inbox — ${groups.length ? `one per group to join` : ""}${groups.length && page ? " and " : ""}${page ? "the Page update post" : ""}. Approve the ones you want and I'll do them one by one in this browser.` : ""}`);
        if (await startNextQueued(supabase, row.id)) {
          if (goal.startsWith("APPROVED")) await post(`▶️ On to the next approved task in the browser…`);
          return { agentStatus: "driving" };
        }
        if (goal.startsWith("APPROVED") && /Facebook group/.test(goal)) {
          const { data: aps } = await supabase.from("approvals").select("status, title, payload").eq("user_id", userId);
          const fb = ((aps ?? []) as { status: string; title: string; payload: unknown }[]).filter((x) => (x.payload as { kind?: string } | null)?.kind === "fb_join_group");
          const joined = fb.filter((x: { status: string }) => x.status === "approved").length;
          const waiting = fb.filter((x: { status: string }) => x.status === "pending").map((x: { title: string }) => x.title.replace("Join Facebook group: ", ""));
          const milestone = joined >= 10 && joined % 10 === 0 ? `🎉 That's **${joined} groups** joined — a strong local footprint. ` : `📊 **${joined}** Facebook group${joined === 1 ? "" : "s"} joined so far. `;
          await post(`${milestone}${waiting.length ? `Still waiting on your OK for ${waiting.length}: ${waiting.slice(0, 5).map((w: string) => `**${w}**`).join(", ")}${waiting.length > 5 ? "…" : ""} (most relevant first — see Approvals).` : "No group requests are waiting."} Want me to keep going?\n\n[[choices: Find more groups | Post in a joined group | Pause for now]]`);
        }
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
      await finishApproval("failed", "Browser connection failed. Check the page before trying again.");
      await save({ agent_status: "failed" }, { action: "error", note: "Lost connection to the browser — the session may have expired." });
      return { agentStatus: "failed" };
    }
    } finally {
      await supabase.from("browser_sessions").update({ driver_lease: null }).eq("id", sessionRowId);
    }
}


export async function executeFacebookApproval(supabase: SupabaseLike, userId: string, approvalId: string) {
    const { data: ap } = await supabase.from("approvals").select("status, payload").eq("id", approvalId).maybeSingle();
    if (!ap || ap.status !== "approved") throw new Error("This action isn't approved.");
    const p = ap.payload as { kind: string; session: string; name?: string; url: string; text?: string };
    const { data: row } = await supabase.from("browser_sessions").select("id, status, agent_status, queue").eq("id", p.session).maybeSingle();
    if (!row || row.status !== "running") throw new Error("That Facebook browser has closed — ask Civi to open Facebook again, then approve.");
    const goal = p.kind === "fb_join_group"
      ? `APPROVED by the organizer: join the Facebook group "${p.name}". Open ${p.url}, click Join group (use submit for that button). If it asks membership questions, answer briefly and honestly from our mission, then submit. If anything needs the organizer (e.g. agreeing to rules personally), use handoff. Then done.`
      : `APPROVED by the organizer: post this update on our organization's Facebook Page (${p.url}), posting as the Page, not the personal profile. Switch to the Page if needed, open "Create post", type exactly this text:\n${p.text}\nthen click Post (use submit for that button). Then done.`;
    const q = [...(Array.isArray(row.queue) ? row.queue : []), { goal, approvalId }];
    await supabase.from("browser_sessions").update({ queue: q }).eq("id", row.id);
    const busy = ["driving", "awaiting_approval", "needs_user"].includes(row.agent_status ?? "");
    const started = busy ? false : await startNextQueued(supabase, row.id);
    await supabase.from("approvals").update({ run_state: "queued", run_error: null }).eq("id", approvalId).eq("user_id", userId);
    return { started, queued: q.length };
}
