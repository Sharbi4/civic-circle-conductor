import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    const { openBrowserSession } = await import("./browser.server");
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
    const { bbRequest } = await import("./browser.server");
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

/** Runs ONE step of Civi driving the browser toward the session's goal. The card calls it in a loop. */
export const browserAgentStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionRowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { runAgentStep } = await import("./browser.server");
    return runAgentStep(context.supabase, context.userId, data.sessionRowId);
  });

export const setBrowserDriving = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionRowId: z.string().uuid(), driving: z.boolean(), goal: z.string().max(1500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { retargetSession } = await import("./browser.server");
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
    const { retargetSession, closeOtherBrowsers } = await import("./browser.server");
    const { supabase, userId } = context;
    const { data: row } = await supabase.from("browser_sessions").select("id, thread_id").eq("id", data.sessionRowId).maybeSingle();
    if (!row) throw new Error("Browser session not found");
    await supabase.from("organizations").update({ facebook_setup_location: data.location }).eq("user_id", userId);
    const goal = `On Facebook (already signed in): 1) Search Facebook groups near ${data.location} that match our mission and focus areas. Open the best 5-8, note name, link, member count, privacy and join questions. Do NOT click Join. 2) Search Facebook for food trucks, caterers and mobile event caterers near ${data.location} and note the best 5-10 for the vendor directory (do not message them). 3) Check whether our organization has a Facebook Page (search our org name, and check the Pages the account manages). Review it: profile/cover photo, about/bio, contact info, how recent the last post is. When finished, use done with a markdown summary: a shortlist of groups (with links) to approve joining, and a Page "TLC" checklist with concrete fixes and 3 suggested post ideas.`;
    await retargetSession(supabase, row.id, goal);
    await closeOtherBrowsers(supabase, row.thread_id, row.id);
    await supabase.from("messages").insert({
      thread_id: row.thread_id, user_id: userId, role: "assistant",
      content: `Great — I'm searching Facebook for groups near **${data.location}** and checking your organization's Page. I won't join anything or post until you approve. Watch along in the browser above.`,
    });
    return { ok: true };
  });

/** Runs an approved Facebook action (join a group / post a Page update) in the open browser, queued one at a time. */
export const runFacebookApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ approvalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { executeFacebookApproval } = await import("./browser.server");
    const { executeApproval } = await import("./approvals.server");
    return executeApproval(context.supabase, context.userId, data.approvalId, () => executeFacebookApproval(context.supabase, context.userId, data.approvalId));
  });
