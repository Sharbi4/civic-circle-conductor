import { describe, it, expect } from "vitest";
import { callRequestSchema, speakableNumber, CALL_DISCLOSURE } from "@/lib/calling.shared";
const base = { kind: "venue_call", thread: "d0000000-0000-4000-8000-000000000002", to: "+15205551234", recipient: "Ward 3", brief: "Ask about Dec 9 availability and booking steps" };
describe("call callback number", () => {
  it("accepts a valid callback", () => expect(callRequestSchema.parse({ ...base, callback: "+15205559876" }).callback).toBe("+15205559876"));
  it("rejects a malformed callback", () => expect(() => callRequestSchema.parse({ ...base, callback: "555-9876" })).toThrow());
  it("speaks US numbers in groups", () => expect(speakableNumber("+15205559876")).toBe("520, 555, 9876"));
  it("discloses monitoring", () => expect(CALL_DISCLOSURE).toMatch(/monitored/));
});
