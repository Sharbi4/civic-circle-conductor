import { describe, expect, it } from "vitest";
import { callRequestSchema, completedCallReport, safeCallText } from "@/lib/calling.shared";
describe("approved venue call requests", () => {
  const request = { kind: "venue_call", thread: "d0000000-0000-4000-8000-000000000002", to: "+15205550123", recipient: "Venue desk", brief: "Check room availability for December 9, 6–8 pm." };
  it("requires a specific recipient and international-format phone number", () => {
    expect(callRequestSchema.safeParse(request).success).toBe(true);
    expect(callRequestSchema.safeParse({ ...request, to: "555" }).success).toBe(false);
    expect(callRequestSchema.safeParse({ ...request, recipient: "" }).success).toBe(false);
  });
  it("does not report completion while the provider is still processing", () => {
    expect(completedCallReport({ status: "processing", analysis: { transcript_summary: "Available" } })).toBeNull();
    expect(completedCallReport({ status: "in-progress" })).toBeNull();
  });
  it("reports failed calls without confirming availability or redialing", () => {
    expect(completedCallReport({ status: "failed" })?.state).toBe("failed");
    expect(completedCallReport({ status: "failed" })?.text).toContain("No automatic redial");
  });
  it("reads recipient responses when a completed call has no summary", () => {
    const report = completedCallReport({ status: "done", transcript: [{ role: "agent", message: "Is the room free?" }, { role: "user", message: "December 9 is available; request a written quote." }] });
    expect(report?.text).toContain("December 9 is available");
    expect(report?.text).not.toContain("Is the room free?");
  });
  it("removes card numbers and login codes from call reports", () => {
    const safe = safeCallText("Card number 4111 1111 1111 1111. CVV 123. Login code 456789.");
    expect(safe).not.toContain("4111");
    expect(safe).not.toContain("123");
    expect(safe).not.toContain("456789");
  });
});