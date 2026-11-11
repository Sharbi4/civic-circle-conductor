import { describe, expect, it } from "vitest";
import { needsCallFollowUp } from "@/lib/callFollowUp.shared";

describe("needsCallFollowUp", () => {
  it("triggers for venue research without confirmed booking details", () => {
    expect(needsCallFollowUp(
      "Research meeting room availability",
      "The site lists a booking desk number but no online availability calendar.",
    )).toBe(true);
  });
  it("does not trigger when availability was confirmed online", () => {
    expect(needsCallFollowUp(
      "Check venue availability",
      "The room is available on December 9 and the reservation confirmed page shows a reference.",
    )).toBe(false);
  });
  it("does not trigger for unrelated or approved browser goals", () => {
    expect(needsCallFollowUp("NOTIFICATION CHECK Facebook", "No new notifications.")).toBe(false);
    expect(needsCallFollowUp("APPROVED by the organizer: join the Facebook group", "Joined.")).toBe(false);
    expect(needsCallFollowUp("Find catering vendors", "Found three caterers.")).toBe(false);
  });
});
