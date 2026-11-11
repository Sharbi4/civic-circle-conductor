import { describe, expect, it } from "vitest";
import { callRequestSchema } from "@/lib/calling.shared";
describe("approved venue call requests", () => {
  const request = { kind: "venue_call", thread: "d0000000-0000-4000-8000-000000000002", to: "+15205550123", recipient: "Venue desk", brief: "Check room availability for December 9, 6–8 pm." };
  it("requires a specific recipient and international-format phone number", () => {
    expect(callRequestSchema.safeParse(request).success).toBe(true);
    expect(callRequestSchema.safeParse({ ...request, to: "555" }).success).toBe(false);
    expect(callRequestSchema.safeParse({ ...request, recipient: "" }).success).toBe(false);
  });
});