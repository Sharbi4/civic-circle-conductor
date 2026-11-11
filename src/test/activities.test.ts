import { describe, expect, it } from "vitest";
import { activitySchema, automationPermissions, planSnapshot } from "@/lib/activities.shared";

describe("shared activity rules", () => {
  it("shares the same approved date, location and description", () => {
    const a = activitySchema.parse({ title: "Neighborhood supper", proposed_date: "2026-12-05 18:00", location: "Community hall", description: "Neighbors plan the next cleanup" });
    expect(planSnapshot(a)).toMatchObject({ proposed_date: "2026-12-05 18:00", location: "Community hall", description: "Neighbors plan the next cleanup" });
  });
  it("never lets automatic preparation authorize public actions", () => {
    expect(automationPermissions("auto", false).publishWithoutApproval).toBe(false);
  });
  it("a pause holds scheduled drafts as well as reviews", () => {
    expect(automationPermissions("auto", true)).toMatchObject({ review: false, research: false, scheduledDrafts: false });
  });
  it("rejects unsafe registration links", () => {
    expect(activitySchema.safeParse({ title: "Event", registration_url: "javascript:alert(1)" }).success).toBe(false);
  });
});