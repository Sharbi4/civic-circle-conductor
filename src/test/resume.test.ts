import { describe, it, expect } from "vitest";
import { resumeDelayMinutes, chatIsIdle, parseResumeState } from "@/lib/resume.shared";
describe("resume stalled steps", () => {
  it("backs off 30m, 2h, 6h, 1 day then pauses", () => {
    expect([0,1,2,3].map(resumeDelayMinutes)).toEqual([30,120,360,1440]);
    expect(resumeDelayMinutes(4)).toBeNull();
  });
  it("waits until the chat is quiet for 30 minutes", () => {
    const now = Date.parse("2026-11-11T12:00:00Z");
    expect(chatIsIdle("2026-11-11T11:45:00Z", now)).toBe(false);
    expect(chatIsIdle("2026-11-11T11:30:00Z", now)).toBe(true);
  });
  it("reads attempt count", () => expect(parseResumeState('{"attempts":2,"step":"x"}').attempts).toBe(2));
});
