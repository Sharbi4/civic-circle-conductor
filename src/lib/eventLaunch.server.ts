import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

export type LaunchEvent = {
  title: string;
  start: string;
  end: string;
  timezone: string;
  location: string;
  description: string;
  url: string;
  rsvpId: string | null;
  threadId: string | null;
};

export type LaunchConnections = { linkedin: boolean; x: boolean; facebook: boolean; browserAvailable: boolean };

export type LaunchStep = {
  key: "eventbrite" | "linkedin_event" | "facebook_event" | "share_x" | "share_linkedin" | "calendar" | "group_outreach" | "feedback";
  title: string;
  status: "done" | "queued" | "needs_connect" | "pending";
  note?: string;
};

/** Public "Add to Google Calendar" link for an event (no Google connection needed). */
export function addToCalendarUrl(ev: Pick<LaunchEvent, "title" | "start" | "end" | "location" | "url">): string {
  const stamp = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${stamp(ev.start)}/${stamp(ev.end)}`,
    location: ev.location,
    details: `RSVP & details: ${ev.url}`,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** The launch-chain steps for an event, given which platforms are connected right now. */
export function buildLaunchPlan(ev: LaunchEvent, conns: LaunchConnections): LaunchStep[] {
  return [
    { key: "eventbrite", title: "Eventbrite listing", status: "done" },
    conns.linkedin
      ? { key: "linkedin_event", title: "LinkedIn event", status: "queued" }
      : { key: "linkedin_event", title: "LinkedIn event", status: "needs_connect", note: "Connect LinkedIn in the Connectors tab to run this step" },
    conns.facebook && conns.browserAvailable
      ? { key: "facebook_event", title: "Facebook event", status: "queued" }
      : conns.facebook
        ? { key: "facebook_event", title: "Facebook event", status: "pending", note: "Live browser is unavailable right now — ask Civi to retry" }
        : { key: "facebook_event", title: "Facebook event", status: "needs_connect", note: "Save your Facebook login under the key icon → Saved logins to run this step" },
    conns.x
      ? { key: "share_x", title: "Share on X", status: "queued" }
      : { key: "share_x", title: "Share on X", status: "needs_connect", note: "Connect X in the Connectors tab to run this step" },
    conns.linkedin
      ? { key: "share_linkedin", title: "Share on LinkedIn", status: "queued" }
      : { key: "share_linkedin", title: "Share on LinkedIn", status: "needs_connect", note: "Connect LinkedIn in the Connectors tab to run this step" },
    { key: "calendar", title: "Add-to-Calendar link", status: "done" },
    conns.facebook
      ? { key: "group_outreach", title: "Group outreach (Facebook/Instagram/Threads)", status: "pending", note: "Starts after the share posts are approved" }
      : { key: "group_outreach", title: "Group outreach (Facebook/Instagram/Threads)", status: "needs_connect", note: "Save a Facebook/Instagram login under Saved logins to run this step" },
    { key: "feedback", title: "Collect feedback & follow up", status: "pending", note: "Runs automatically the day after the event" },
  ];
}

export function launchStatusLine(plan: LaunchStep[]): string {
  const icon = (s: LaunchStep["status"]) => s === "done" ? "✅" : s === "queued" ? "⏳" : s === "needs_connect" ? "🔌" : "⬜";
  return plan.map((s, i) => `${i + 1}. ${icon(s.status)} ${s.title}${s.note ? ` — ${s.note}` : s.status === "queued" ? " — queued for approval" : ""}`).join("\n");
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * Kicks off the event launch chain after an Eventbrite listing is created: records the event as a goal
 * with per-step tasks, queues the connected-platform actions for approval, starts the Facebook event in
 * the live browser when possible, and posts a status message prompting to connect or skip what's missing.
 * Never throws — a chain hiccup must not fail the Eventbrite creation it follows.
 */
export async function startEventLaunchChain(db: Db, userId: string, ev: LaunchEvent): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getDirectLinkedInConnection } = await import("./linkedinDirect.server");
    const { linkedInTokenUsable } = await import("./linkedinDirect.shared");
    const li = await getDirectLinkedInConnection(userId).catch(() => null);
    const linkedin = !!(li && linkedInTokenUsable(li.token));
    const { data: xConn } = await supabaseAdmin.from("app_user_connections").select("id").eq("user_id", userId).eq("connector_id", "x").maybeSingle();
    const { data: creds } = await db.from("site_credentials").select("domain").eq("user_id", userId);
    const facebook = (creds ?? []).some((c) => /facebook\.com/i.test(c.domain));
    const browserAvailable = !!(process.env["LOVABLE_API_KEY"] && process.env["UDC_BROWSERBASE_API_KEY"]);

    const plan = buildLaunchPlan(ev, { linkedin, x: !!xConn, facebook, browserAvailable });
    const calUrl = addToCalendarUrl(ev);
    const rsvpUrl = ev.rsvpId ? `https://civimeet.com/p/${ev.rsvpId}` : ev.url;
    const dueDate = /^\d{4}-\d{2}-\d{2}/.test(ev.start) ? ev.start.slice(0, 10) : null;

    const { data: goal } = await db.from("tasks").insert({
      user_id: userId, kind: "goal", title: `Launch: ${ev.title}`, due_date: dueDate, created_by: "civi", thread_id: ev.threadId,
    }).select("id").single();
    const goalId = goal?.id ?? null;

    const taskIdByKey = new Map<string, string>();
    if (goalId) {
      const evCtx = { title: ev.title, start: ev.start, end: ev.end, timezone: ev.timezone, location: ev.location, description: stripHtml(ev.description).slice(0, 800), url: ev.url, rsvpId: ev.rsvpId };
      const feedbackAt = new Date(new Date(ev.end).getTime() + 24 * 3600e3).toISOString();
      const rows = plan.map((s, i) => ({
        user_id: userId, kind: "task", goal_id: goalId, title: s.title, due_date: dueDate, created_by: "civi", thread_id: ev.threadId,
        done: s.status === "done", done_at: s.status === "done" ? new Date().toISOString() : null,
        schedule_key: `launch:${goalId}:${s.key}`,
        last_error: s.status === "needs_connect" ? s.note ?? "Not connected" : null,
        job_kind: s.status === "done" ? null : "launch_step",
        scheduled_for: s.status === "done" ? null : s.key === "feedback" ? feedbackAt : new Date(Date.now() + (i + 1) * 5 * 60000).toISOString(),
        run_prompt: s.status === "done" ? null : JSON.stringify({ step: s.key, ev: evCtx, attempts: 0 }),
      }));
      const { data: saved } = await db.from("tasks").insert(rows).select("id, schedule_key");
      for (const t of saved ?? []) {
        const key = String(t.schedule_key ?? "").split(":").pop();
        if (key) taskIdByKey.set(key, t.id);
      }
    }

    const desc = stripHtml(ev.description).slice(0, 800);
    const when = new Date(ev.start).toLocaleString("en-US", { timeZone: ev.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const imagePrompt = `Warm, authentic community event photo for "${ev.title}" — ${desc.slice(0, 200)}`;
    const approvals: Omit<Database["public"]["Tables"]["approvals"]["Insert"], "user_id" | "thread_id">[] = [];
    if (linkedin) {
      approvals.push({
        action_type: "outreach", title: `Create & publish LinkedIn event: ${ev.title}`,
        details: `${when} · ${ev.location}`,
        payload: { kind: "linkedin_event_create", title: ev.title, start: ev.start, end: ev.end, description: desc, online: /online|virtual|zoom/i.test(ev.location), url: ev.url, venue_details: ev.location, post_text: `📅 ${ev.title}\n${when} · ${ev.location}\nRSVP: ${rsvpUrl}\nAdd to your calendar: ${calUrl}`, image_prompt: imagePrompt, launch_task_id: taskIdByKey.get("linkedin_event") },
      });
      approvals.push({
        action_type: "outreach", title: "Share the event on LinkedIn",
        details: `📅 ${ev.title} — ${when}. RSVP: ${rsvpUrl}`,
        payload: { kind: "linkedin_post", text: `📅 You're invited: ${ev.title}\n\n${when} · ${ev.location}\n\n${desc.slice(0, 400)}\n\nRSVP here: ${rsvpUrl}\nAdd to your calendar: ${calUrl}`, image_prompt: imagePrompt, launch_task_id: taskIdByKey.get("share_linkedin") },
      });
    }
    if (xConn) {
      approvals.push({
        action_type: "outreach", title: "Share the event on X",
        details: `📅 ${ev.title} — ${when}. RSVP: ${rsvpUrl}`,
        payload: { kind: "x_post", text: `📅 ${ev.title}\n${when} · ${ev.location}\nRSVP: ${rsvpUrl}`.slice(0, 280), image_prompt: imagePrompt, launch_task_id: taskIdByKey.get("share_x") },
      });
    }
    if (approvals.length && ev.threadId) {
      const { data: saved, error } = await db.from("approvals").insert(approvals.map((a) => ({ ...a, user_id: userId, thread_id: ev.threadId }))).select("id, payload");
      if (error) console.error("Launch chain approvals failed", error.message);
      if (saved?.length) {
        const { applyStandingApprovals } = await import("./approvals.server");
        await applyStandingApprovals(db, userId, saved);
      }
    }

    let browserNote = "";
    if (facebook && browserAvailable && ev.threadId) {
      const fbTask = `On facebook.com, create a public event for our organization: "${ev.title}" on ${when} (${ev.timezone}) at ${ev.location}. Description: ${desc} RSVP & tickets: ${rsvpUrl}. Add to calendar: ${calUrl}. Browse and act human-like: scroll and read before each action, pause for approval before publishing.`;
      try {
        const { data: openList } = await db.from("browser_sessions").select("id, signed_in").eq("thread_id", ev.threadId).eq("status", "running").order("created_at", { ascending: false });
        const { openBrowserSession, retargetSession, closeOtherBrowsers } = await import("./browser.server");
        const open = (openList ?? []).find((o) => o.signed_in) ?? openList?.[0];
        let id: string;
        if (open) {
          await retargetSession(db, open.id, fbTask);
          await closeOtherBrowsers(db, ev.threadId, open.id);
          id = open.id;
        } else {
          ({ id } = await openBrowserSession({ supabase: db, userId, threadId: ev.threadId, task: fbTask, lovableKey: process.env["LOVABLE_API_KEY"]!, connKey: process.env["UDC_BROWSERBASE_API_KEY"]! }));
        }
        browserNote = `\n\n[[browser: ${id} | ${fbTask}]]`;
      } catch (e) {
        console.error("Launch chain browser start failed", e);
        browserNote = "\n\n⚠️ I couldn't open the live browser for the Facebook event just now — ask me to retry it.";
        if (taskIdByKey.get("facebook_event")) await db.from("tasks").update({ last_error: "Browser start failed — ask Civi to retry" }).eq("id", taskIdByKey.get("facebook_event")!);
      }
    }

    const missing = plan.filter((s) => s.status === "needs_connect");
    if (ev.threadId) {
      await db.from("messages").insert({
        thread_id: ev.threadId, user_id: userId, role: "assistant",
        content: `🚀 **Launch chain started for “${ev.title}”** — I'm working it step by step:\n\n${launchStatusLine(plan)}\n\n- 📅 Add to Google Calendar: ${calUrl}\n- 📋 RSVP page: ${rsvpUrl}\n\nTrack every step under **Goals & tasks → “Launch: ${ev.title}”** — tap it for the live progress here in chat.${missing.length ? `\n\n${missing.length === 1 ? "One platform isn't" : "Some platforms aren't"} connected yet — connect ${missing.map((s) => s.title.replace(/^(Share on |Create & publish )/, "")).join(" and ")} to continue, or skip ${missing.length === 1 ? "it" : "them"}.\n\n[[choices: I'll connect it | Skip for now]]` : ""}${browserNote}`,
      });
    }
  } catch (e) {
    console.error("Event launch chain failed", e);
  }
}
