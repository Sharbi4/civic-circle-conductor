import { describe, expect, it } from "vitest";
import { completedCallReport } from "@/lib/calling.shared";

describe("completedCallReport outcome line", () => {
  it("reports voicemail when the summary says a message was left", () => {
    const report = completedCallReport({ status: "done", analysis: { transcript_summary: "The agent reached a voicemail and left a message about December 9 availability." }, metadata: { call_duration_secs: 62 }, transcript: [] });
    expect(report?.text).toContain("Outcome: reached voicemail");
    expect(report?.text).toContain("Call length: 62 seconds.");
  });
  it("reports a conversation when the recipient spoke", () => {
    const report = completedCallReport({ status: "done", transcript: [{ role: "user", message: "The room is free on December 9." }] });
    expect(report?.text).toContain("Outcome: spoke with the recipient");
  });
  it("reports an empty call plainly", () => {
    const report = completedCallReport({ status: "done", transcript: [] });
    expect(report?.text).toContain("Outcome: the call ended without a recorded conversation");
  });
});
