import { describe, it, expect } from "vitest";
import { JOB_CADENCE, nextTaskOccurrence, recoveryDecision } from "@/lib/jobs.shared";
describe("shared agent jobs", () => {
  it("schedules every 15 minutes", () => expect(JOB_CADENCE.scheduler).toBe("*/15 * * * *"));
  it("recovers every 30 minutes", () => expect(JOB_CADENCE.recovery).toBe("*/30 * * * *"));
  it("reports once daily", () => expect(JOB_CADENCE.reports).toBe("0 7 * * *"));
  it("never replays work after provider calls may have begun", () => expect(recoveryDecision({ phase: "provider_started", attempt: 1 })).toBe("needs_review"));
  it("safely requeues interrupted pre-provider work", () => expect(recoveryDecision({ phase: "claimed", attempt: 1 })).toBe("queued"));
  it("bounds recovery attempts", () => expect(recoveryDecision({ phase: "claimed", attempt: 3 })).toBe("failed"));
  it("stores a weekly next occurrence as task data", () => expect(nextTaskOccurrence("2026-11-11T07:00:00Z", "weekly")).toBe("2026-11-18T07:00:00.000Z"));
});