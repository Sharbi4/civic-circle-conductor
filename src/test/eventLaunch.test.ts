import { describe, expect, it } from "vitest";
import { addToCalendarUrl, buildLaunchPlan } from "@/lib/eventLaunch.server";

const ev = {
  title: "Spring Cleanup Cookout",
  start: "2026-04-11T10:00:00-07:00",
  end: "2026-04-11T13:00:00-07:00",
  timezone: "America/Phoenix",
  location: "Reid Park Ramada 5",
  description: "<p>Neighborhood cleanup then lunch.</p>",
  url: "https://www.eventbrite.com/e/spring-cleanup-123",
  rsvpId: "abc123",
  threadId: "thread-1",
};

describe("addToCalendarUrl", () => {
  it("builds a valid Google Calendar template link with event details", () => {
    const url = new URL(addToCalendarUrl(ev));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Spring Cleanup Cookout");
    expect(url.searchParams.get("dates")).toBe("20260411T170000Z/20260411T200000Z");
    expect(url.searchParams.get("location")).toBe("Reid Park Ramada 5");
    expect(url.searchParams.get("details")).toContain(ev.url);
  });
});

describe("buildLaunchPlan", () => {
  const all = { linkedin: true, x: true, facebook: true, browserAvailable: true };

  it("queues every connected platform step and marks Eventbrite + calendar done", () => {
    const plan = buildLaunchPlan(ev, all);
    const byKey = Object.fromEntries(plan.map((s) => [s.key, s.status]));
    expect(byKey).toMatchObject({
      eventbrite: "done", calendar: "done", linkedin_event: "queued", facebook_event: "queued",
      share_x: "queued", share_linkedin: "queued", group_outreach: "pending",
    });
  });

  it("prompts to connect each platform that is not connected instead of queuing it", () => {
    const plan = buildLaunchPlan(ev, { linkedin: false, x: false, facebook: false, browserAvailable: true });
    const needsConnect = plan.filter((s) => s.status === "needs_connect").map((s) => s.key);
    expect(needsConnect).toEqual(["linkedin_event", "facebook_event", "share_x", "share_linkedin", "group_outreach"]);
    for (const s of plan.filter((s) => s.status === "needs_connect")) expect(s.note).toMatch(/connect|login/i);
  });

  it("does not open the Facebook browser step when the browser service is unavailable", () => {
    const plan = buildLaunchPlan(ev, { ...all, browserAvailable: false });
    expect(plan.find((s) => s.key === "facebook_event")?.status).toBe("pending");
  });
});
