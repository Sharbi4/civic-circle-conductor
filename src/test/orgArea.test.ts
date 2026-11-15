import { describe, expect, it } from "vitest";
import { cityHashtag, cityState, researchArea } from "@/lib/orgArea.shared";
import { skipDraft, stepDef } from "@/lib/eventPlan.shared";

describe("organization area", () => {
  it("reads the city and state from an address", () => {
    expect(cityState("1202 N 3rd St, Phoenix, AZ 85004")).toBe("Phoenix, AZ");
    expect(cityState("Ward 3 Community Room, 1510 E. Grant Road, Tucson, AZ 85719")).toBe("Tucson, AZ");
    expect(cityState("Somewhere downtown")).toBeNull();
  });
  it("researches the organization's own city, falling back to its ZIP", () => {
    expect(researchArea("1202 N 3rd St, Phoenix, AZ 85004", "85719")).toBe("Phoenix, AZ");
    expect(researchArea(null, "85004")).toBe("85004");
    expect(researchArea(null, null)).toBe("");
  });
  it("tags ready-to-paste posts with the event's city, never a fixed one", () => {
    expect(cityHashtag("Garden, 1202 N 3rd St, Phoenix, AZ 85004")).toBe("#Phoenix");
    const ev = { title: "Holiday Harvest Food Drive", date: "2026-12-12", location: "Valley Harvest Community Garden, 1202 N 3rd St, Phoenix, AZ 85004", link: null };
    const insta = skipDraft(stepDef("instagram")!, ev);
    expect(insta).toContain("#Phoenix");
    expect(insta).not.toContain("#Tucson");
    expect(skipDraft(stepDef("tiktok")!, { ...ev, location: "the park" })).not.toContain("#Tucson");
  });
});
