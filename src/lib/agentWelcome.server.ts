import { noLongDashes, withNoDashes } from "./punctuation.shared";
import { safeTimeZone } from "./zonedTime.shared";
import { generateResponse } from "@lovable.dev/ai-gateway";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
export type AgentKind = "eventbrite" | "x" | "linkedin" | "nextdoor";

const CAPS: Record<AgentKind, { label: string; caps: string[] }> = {
  eventbrite: { label: "Eventbrite", caps: ["Create events (name, best day/time, capacity, AI cover) as drafts", "Update existing events", "List upcoming and draft events", "Promote events on connected social accounts", "Attach an RSVP sign-up form", "Anything else on eventbrite.com via the live browser"] },
  x: { label: "X", caps: ["Write short posts (events, calls to action, wins)", "Add a generated or uploaded photo", "Announce and remind about events", "Recurring posts on a schedule"] },
  linkedin: { label: "LinkedIn", caps: ["Share posts with a photo", "Create LinkedIn events with a cover", "Post on a schedule (weekly updates, monthly impact recaps)", "Spotlight partners and sponsors"] },
  nextdoor: { label: "Nextdoor", caps: ["Neighborhood posts about events and volunteer needs", "Event announcements and reminders", "Ask neighbors for input with a poll link"] },
};

/**
 * Writes a proactive, organization-specific welcome for a platform agent chat:
 * one concrete "Want me to…?" idea per capability, built from the org's mission, location, events and goals.
 * Falls back to `fallback` if generation fails.
 */
export async function buildAgentWelcome(db: Db, userId: string, agent: AgentKind, accountName: string, fallback: string, extra = ""): Promise<string> {
  try {
    const [{ data: org }, { data: tasks }, { data: res }, { data: polls }] = await Promise.all([
      db.from("organizations").select("name, mission, profile, address, facebook_setup_location, time_zone").eq("user_id", userId).maybeSingle(),
      db.from("tasks").select("title, due_date, kind").eq("user_id", userId).eq("done", false).limit(12),
      db.from("resources").select("type, name").eq("user_id", userId).neq("status", "dismissed").limit(12),
      db.from("polls").select("title, kind").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    ]);
    const c = CAPS[agent];
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: safeTimeZone(org?.time_zone) });
    const instructions = [
      `You are Civi's ${c.label} agent, a warm, proactive community organizer, opening a brand-new chat. Today is ${today}.`,
      `Write the first message. Start with one line: "Hi! I'm your **${c.label} agent**, connected to **${accountName}**. What would you like me to do? Here are a few ideas for ${org?.name ?? "your organization"}:"`,
      `Then one bullet per capability below. Each bullet: **bold capability name**, then a SPECIFIC, creative suggestion phrased as an offer ("Want me to…?", "I can make an event for…", "Should I…?"), tied to THIS org's mission, location, season/upcoming dates, goals, partners or existing events. Name real specifics (neighborhood, date, partner, audience). No generic filler.`,
      `Capabilities:\n- ${c.caps.join("\n- ")}`,
      `End with one short line: "Pick one, tweak it, or just let me know what you need, nothing goes live without your OK."`,
      `Last line exactly: [[choices: A | B | C | Something else]] where A-C are 2-6 word labels for your three best ideas above.`,
      "Plain markdown, under 170 words, no headings, no invented facts about the org (if unknown, keep the idea broadly applicable but still concrete).",
    ].join("\n");
    const input = [
      `Org: ${org?.name ?? "?"}`, `Mission: ${org?.mission ?? "?"}`, `Location: ${org?.address ?? org?.facebook_setup_location ?? "?"}`,
      `Profile: ${(org?.profile ?? "").slice(0, 1200)}`,
      `Open goals/tasks: ${(tasks ?? []).map((t: { title: string; due_date: string | null }) => `${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`).join("; ") || "none"}`,
      `Partners/vendors/venues: ${(res ?? []).map((r: { type: string; name: string }) => `${r.name} (${r.type})`).join("; ") || "none"}`,
      `Recent forms: ${(polls ?? []).map((p: { title: string }) => p.title).join("; ") || "none"}`,
      extra,
    ].join("\n");
    const out = await generateResponse({ model: "openai/gpt-6.1-terra", instructions: withNoDashes(instructions), input });
    let text = "";
    for (const item of out.output ?? []) if (item.type === "message") for (const p of item.content ?? []) if (p.type === "output_text") text += noLongDashes(p.text);
    text = text.trim();
    if (text.length < 80 || !/\[\[choices:/.test(text)) return fallback;
    return text;
  } catch (e) {
    console.error("agent welcome failed", e);
    return fallback;
  }
}
