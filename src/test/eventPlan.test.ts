import { describe, it, expect } from "vitest";
import { EVENT_PLAN, decideStep, triggerAt, nudgeDelayMinutes, type PlanRow, type Channel } from "@/lib/eventPlan.shared";

const EVENT = "2026-12-09";
function plan(over: Record<string, Partial<PlanRow>> = {}) {
  const rows = EVENT_PLAN.map((d, i): PlanRow => ({ id: `t${i}`, step_key: d.key, done: false, step_state: null, scheduled_for: null, last_run_at: null, run_prompt: null, ...over[d.key] }));
  return { rows, byKey: new Map(rows.map((r) => [r.step_key!, r])) };
}
const allConnected = (_c: Channel) => true;
const ctx = (now: string, connected = allConnected, approvalOpen = new Set<string>()) =>
  ({ now: Date.parse(now), eventDate: EVENT, connected, approvalOpen, repliedSince: new Set<string>() });
const doneSetup = { essentials: { done: true }, venue: { done: true }, rsvp: { done: true }, eventbrite: { done: true } };

describe("event plan", () => {
  it("starts every promotion step at once after Eventbrite and the RSVP form", () => {
    const { byKey } = plan(doneSetup);
    const c = ctx("2026-11-20T18:00:00Z");
    for (const k of ["x_post", "linkedin_post", "linkedin_event", "facebook", "email_invites"])
      expect(decideStep(byKey.get(k)!, byKey, c).state).toBe("ready");
  });

  it("one blocked step doesn't hold up unrelated ones", () => {
    const { byKey } = plan({ essentials: { done: true } });
    const c = ctx("2026-11-20T18:00:00Z");
    expect(decideStep(byKey.get("venue")!, byKey, c).state).toBe("ready");
    expect(decideStep(byKey.get("rsvp")!, byKey, c).state).toBe("ready");
    expect(decideStep(byKey.get("x_post")!, byKey, c).state).toBe("waiting");
  });

  it("waiting on an approval keeps its retries and shows as waiting for approval", () => {
    const { byKey } = plan({ ...doneSetup, x_post: { step_state: "awaiting_approval", run_prompt: '{"attempts":0}' } });
    const row = byKey.get("x_post")!;
    const d = decideStep(row, byKey, ctx("2026-11-30T18:00:00Z", allConnected, new Set([row.id])));
    expect(d.state).toBe("awaiting_approval");
    expect(row.run_prompt).toBe('{"attempts":0}');
  });

  it("skips steps whose channel isn't connected", () => {
    const { byKey } = plan(doneSetup);
    const c = ctx("2026-11-20T18:00:00Z", (ch) => ch !== "tiktok" && ch !== "instagram");
    expect(decideStep(byKey.get("tiktok")!, byKey, c).state).toBe("skipped");
    expect(decideStep(byKey.get("instagram")!, byKey, c).state).toBe("skipped");
    expect(decideStep(byKey.get("x_post")!, byKey, c).state).toBe("ready");
  });

  it("times reminders 7 days and 1 day before, follow-ups the day after (9am / 10am Arizona)", () => {
    const def = (k: string) => EVENT_PLAN.find((d) => d.key === k)!;
    expect(triggerAt(def("reminder_week"), EVENT)).toBe("2026-12-02T16:00:00.000Z");
    expect(triggerAt(def("reminder_day"), EVENT)).toBe("2026-12-08T16:00:00.000Z");
    expect(triggerAt(def("recap"), EVENT)).toBe("2026-12-10T17:00:00.000Z");
    const { byKey } = plan(doneSetup);
    expect(decideStep(byKey.get("reminder_week")!, byKey, ctx("2026-12-01T18:00:00Z")).state).toBe("waiting");
    expect(decideStep(byKey.get("reminder_week")!, byKey, ctx("2026-12-02T16:30:00Z")).state).toBe("ready");
  });

  it("drops the week-before reminder once it's too close to the event", () => {
    const { byKey } = plan(doneSetup);
    expect(decideStep(byKey.get("reminder_week")!, byKey, ctx("2026-12-07T18:00:00Z")).state).toBe("skipped");
  });

  it("sends the thank-you email only after the feedback form exists", () => {
    const { byKey } = plan(doneSetup);
    const c = ctx("2026-12-10T19:00:00Z");
    expect(decideStep(byKey.get("thank_you")!, byKey, c).state).toBe("waiting");
    byKey.get("feedback")!.done = true;
    expect(decideStep(byKey.get("thank_you")!, byKey, c).state).toBe("ready");
  });

  it("checks back after 30 min, 2h, 6h, a day, then pauses", () => {
    expect([0, 1, 2, 3].map(nudgeDelayMinutes)).toEqual([30, 120, 360, 1440]);
    expect(nudgeDelayMinutes(4)).toBeNull();
  });
});

import { eventDetailsPatch } from "@/lib/eventPlan.shared";
describe("event page sync from chat", () => {
  it("fills venue, budget and turnout picked in chat", () => {
    expect(eventDetailsPatch({ venue: "Mitchell Park", budget: "$250", budget_note: "$150–250 estimate", headcount: 30 }, { venue_status: "searching" }))
      .toEqual({ venue: "Mitchell Park", budget: 250, budget_notes: "$150–250 estimate", headcount: 30 });
  });
  it("never replaces a venue already marked booked", () => {
    expect(eventDetailsPatch({ venue: "Reid Park" }, { venue_status: "booked" })).toEqual({});
  });
});
