import { describe, expect, it } from "vitest";
import { browserIsUnattended, dailyReportIsQuiet, ownersToWake, reviewHasNews, sharedJobEventId, wakeEventId } from "@/lib/background.shared";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";

describe("background work only wakes organizations with real work", () => {
  it("never wakes a paused organization", () => {
    expect(ownersToWake({ queued: [A, B], browsers: [], paused: [B] })).toEqual([A]);
  });
  it("wakes each organization once even with several waiting items", () => {
    expect(ownersToWake({ queued: [A, A, B], browsers: [A, C], paused: [] })).toEqual([A, B, C]);
  });
  it("caps how many organizations one sweep wakes", () => {
    expect(ownersToWake({ queued: [A, B, C], browsers: [], paused: [] }, 2)).toEqual([A, B]);
  });
  it("wakes nobody when nothing is waiting", () => {
    expect(ownersToWake({ queued: [], browsers: [], paused: [] })).toEqual([]);
  });
  it("gives repeated sweeps in the same 15 minutes the same wake id, so they run once", () => {
    const t = Date.UTC(2026, 10, 12, 19, 0, 0);
    expect(wakeEventId(A, t)).toBe(wakeEventId(A, t + 14 * 60_000));
    expect(wakeEventId(A, t)).not.toBe(wakeEventId(A, t + 15 * 60_000));
  });
});

describe("background work leaves browsers an open chat is driving alone", () => {
  const now = Date.UTC(2026, 10, 12, 19, 0, 0);
  it("leaves a browser stepped 30 seconds ago alone", () => {
    expect(browserIsUnattended({ driver_lease: null, last_step_at: new Date(now - 30_000).toISOString() }, now)).toBe(false);
  });
  it("leaves a browser with a live driver lease alone", () => {
    expect(browserIsUnattended({ driver_lease: new Date(now + 60_000).toISOString(), last_step_at: null }, now)).toBe(false);
  });
  it("takes over a browser nobody has stepped for 2 minutes", () => {
    expect(browserIsUnattended({ driver_lease: null, last_step_at: new Date(now - 120_000).toISOString() }, now)).toBe(true);
  });
});

describe("no AI spend when nothing has changed", () => {
  const last = "2026-11-12T18:00:00Z";
  it("skips the planning review when nothing happened since the last one", () => {
    expect(reviewHasNews(last, "2026-11-12T17:00:00Z", "2026-11-12T16:00:00Z")).toBe(false);
  });
  it("reviews after the organizer writes something new", () => {
    expect(reviewHasNews(last, "2026-11-12T18:05:00Z", null)).toBe(true);
  });
  it("reviews after a task finishes", () => {
    expect(reviewHasNews(last, null, "2026-11-12T18:10:00Z")).toBe(true);
  });
  it("skips the daily report on a day with no messages and no waiting approvals", () => {
    expect(dailyReportIsQuiet(0, 0)).toBe(true);
    expect(dailyReportIsQuiet(0, 2)).toBe(false);
  });
});

describe("shared jobs run once per slot in the background service", () => {
  it("gives the scheduler the same id within 15 minutes and a new one after", () => {
    const t = Date.UTC(2026, 10, 12, 19, 30, 0);
    expect(sharedJobEventId("scheduler", t)).toBe(sharedJobEventId("scheduler", t + 10 * 60_000));
    expect(sharedJobEventId("scheduler", t)).not.toBe(sharedJobEventId("scheduler", t + 15 * 60_000));
    expect(sharedJobEventId("scheduler", t)).not.toBe(sharedJobEventId("reports", t));
  });
});
