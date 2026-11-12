import { describe, it, expect } from "vitest";
import { EVENT_PLAN, decideStep, triggerAt, type PlanRow, type Channel } from "@/lib/eventPlan.shared";
import { inferStepStatus, parseStepStatus, stepDisplay, stepStatusPatch, stripStepStatus } from "@/lib/stepStatus.shared";
import { pillsToShow, tidyStepHeading } from "@/lib/chatVisibility.shared";
import { approvalStateLabel } from "@/lib/approvals.shared";
import { isUntouchedEvent } from "@/lib/eventPlan.server";

const EVENT = "2026-12-09";
function plan(over: Record<string, Partial<PlanRow>> = {}) {
  const rows = EVENT_PLAN.map((d, i): PlanRow => ({ id: `t${i}`, step_key: d.key, done: false, step_state: null, scheduled_for: null, last_run_at: null, run_prompt: null, ...over[d.key] }));
  return { rows, byKey: new Map(rows.map((r) => [r.step_key!, r])) };
}
const all = (_c: Channel) => true;
const ctx = (now: string, extra: Record<string, unknown> = {}) =>
  ({ now: Date.parse(now), eventDate: EVENT, connected: all, approvalOpen: new Set<string>(), repliedSince: new Set<string>(), timeZone: "America/Phoenix", ...extra });
const NOW = "2026-11-12T18:00:00Z";

describe("steps that are only waiting never show as failures", () => {
  it("a venue waiting on Ward 3 reads 'Waiting on Ward 3 · Civi will follow up Thu, Nov 19'", () => {
    const p = stepStatusPatch({ state: "waiting_on", who: "Ward 3", follow_up: "2026-11-19" }, Date.parse(NOW), "America/Phoenix");
    expect(p.step_state).toBe("waiting_on");
    expect(p.step_note).toBe("Waiting on Ward 3 · Civi will follow up Thu, Nov 19");
  });
  it("a step held on purpose reads 'On hold · Starts once the venue is confirmed'", () => {
    expect(stepStatusPatch({ state: "on_hold", until: "the venue is confirmed", after: "venue" }, Date.parse(NOW), "America/Phoenix").step_note).toBe("On hold · Starts once the venue is confirmed");
  });
  it("ideas waiting on the organizer read 'Your pick · 3 ideas are ready in the event chat'", () => {
    expect(stepStatusPatch({ state: "your_pick", note: "3 ideas are ready in the event chat" }, Date.parse(NOW), "America/Phoenix").step_note).toBe("Your pick · 3 ideas are ready in the event chat");
  });
  it("reads the same from Civi's own words when it forgot the marker", () => {
    expect(inferStepStatus("Step 2 of 16 · Book the venue\nWe’re waiting for Ward 3 to confirm availability for Dec. 9.")).toEqual({ state: "waiting_on", who: "Ward 3" });
    expect(inferStepStatus("I’ll hold the LinkedIn event until the venue is confirmed, so its location isn’t presented as settled.")).toMatchObject({ state: "on_hold", after: "venue" });
    expect(inferStepStatus("Here are three ideas:\n1. Mixer\n2. Panel\n3. Potluck\nWhich one?\n[[choices: Mixer | Panel | Potluck]]")).toEqual({ state: "your_pick", note: "3 ideas are ready in the event chat" });
  });
  it("parses and strips Civi's step_status marker", () => {
    const t = 'Waiting on Ward 3.\n[[step_status: {"state":"waiting_on","who":"Ward 3 Council Office","follow_up":"2026-11-19"}]]';
    expect(parseStepStatus(t)).toEqual({ state: "waiting_on", who: "Ward 3 Council Office", follow_up: "2026-11-19" });
    expect(stripStepStatus(t)).toBe("Waiting on Ward 3.");
  });
});

describe("parked steps wait for what they're waiting on", () => {
  it("an on-hold step starts once the venue is booked, not before", () => {
    const held = { step_state: "on_hold", run_prompt: '{"attempts":0,"after":"venue"}' };
    const before = plan({ essentials: { done: true }, rsvp: { done: true }, eventbrite: { done: true }, linkedin_event: held });
    expect(decideStep(before.byKey.get("linkedin_event")!, before.byKey, ctx(NOW)).state).toBe("on_hold");
    const after = plan({ essentials: { done: true }, venue: { done: true }, rsvp: { done: true }, eventbrite: { done: true }, linkedin_event: held });
    expect(decideStep(after.byKey.get("linkedin_event")!, after.byKey, ctx(NOW)).state).toBe("ready");
  });
  it("waiting on an outside reply runs again on the follow-up day, not every half hour", () => {
    const { byKey } = plan({ essentials: { done: true }, venue: { step_state: "waiting_on", run_prompt: '{"attempts":0,"nudge_at":"2026-11-19T16:00:00Z"}' } });
    expect(decideStep(byKey.get("venue")!, byKey, ctx("2026-11-13T18:00:00Z")).state).toBe("waiting_on");
    expect(decideStep(byKey.get("venue")!, byKey, ctx("2026-11-19T16:30:00Z")).state).toBe("ready");
  });
  it("an interrupted step never replays by itself; it restarts when the organizer replies", () => {
    const { byKey } = plan({ essentials: { done: true }, venue: { id: "v", step_state: "interrupted" } });
    expect(decideStep(byKey.get("venue")!, byKey, ctx(NOW)).state).toBe("interrupted");
    expect(decideStep(byKey.get("venue")!, byKey, ctx(NOW, { repliedSince: new Set(["v"]) })).state).toBe("ready");
  });
  it("says 'waiting for your approval', not 'declined', while an approval waits in the chat", () => {
    const { byKey } = plan({ essentials: { done: true }, venue: { step_state: "awaiting_approval" } });
    expect(decideStep(byKey.get("venue")!, byKey, ctx(NOW, { threadApprovalOpen: true })).state).toBe("awaiting_approval");
    expect(decideStep(byKey.get("venue")!, byKey, ctx(NOW)).state).toBe("declined");
  });
});

describe("step wording", () => {
  it("a failed step says 'Needs attention' once and offers Try again and Open chat", () => {
    const d = stepDisplay("failed", false, "Didn't go through — reply in the event chat to try again");
    expect(d.text).toBe("Needs attention · Civi couldn't finish this step.");
    expect(d.actions).toEqual(["retry", "open_chat"]);
    expect(d.tone).toBe("attention");
  });
  it("an interrupted step says 'Paused · Civi stopped partway.' with Resume", () => {
    expect(stepDisplay("interrupted", false, null)).toMatchObject({ text: "Paused · Civi stopped partway.", actions: ["resume"] });
  });
  it("a declined proposal offers another option", () => {
    expect(stepDisplay("declined", false, null)).toMatchObject({ text: "You passed on Civi's last proposal.", actions: ["another"] });
  });
  it("a step skipped for a missing connection reads 'Not connected' with Copy draft", () => {
    expect(stepDisplay("skipped", true, "X isn't connected — ready-to-paste draft is in the chat")).toMatchObject({ text: "Not connected", actions: ["copy_draft"] });
  });
  it("approval states use plain words", () => {
    expect(approvalStateLabel("failed", {})).toBe("Didn't complete, nothing was sent");
    expect(approvalStateLabel("needs_review", {})).toBe("Please confirm, Civi couldn't verify this finished");
    expect(approvalStateLabel("queued", {})).toBe("In progress");
  });
  it("old step headings lose the 🔁 and use a dot", () => {
    expect(tidyStepHeading("🔁 Step 5 of 16 — LinkedIn event\nMore")).toBe("Step 5 of 16 · LinkedIn event\nMore");
  });
});

describe("chat doesn't repeat itself", () => {
  it("pickups that produced nothing are hidden; a pickup Civi acted on shows once", () => {
    const hidden = (id: string, n: number) => ({ id, role: "system", content: `[Plan step — picked up automatically] Event: X. Step ${n} of 16: "${n === 2 ? "Book the venue" : "LinkedIn event"}" (task id a).` });
    const msgs = [hidden("a", 2), hidden("b", 5), hidden("c", 2), hidden("d", 5), hidden("e", 2), { id: "r", role: "assistant", content: "Step 2 of 16 · Book the venue" }];
    expect([...pillsToShow(msgs)]).toEqual(["e"]);
  });
});

describe("time zones and new events", () => {
  it("step times follow the organization's own time zone", () => {
    const week = EVENT_PLAN.find((s) => s.key === "reminder_week")!;
    expect(triggerAt(week, EVENT, "America/Phoenix")).toBe("2026-12-02T16:00:00.000Z");
    expect(triggerAt(week, EVENT, "America/New_York")).toBe("2026-12-02T14:00:00.000Z");
  });
  it("Civi doesn't start working on an empty 'New event' by itself", () => {
    expect(isUntouchedEvent("Event: New event", null, false)).toBe(true);
    expect(isUntouchedEvent("Event: New event", null, true)).toBe(false);
    expect(isUntouchedEvent("Event: Town Hall", null, false)).toBe(false);
  });
});
