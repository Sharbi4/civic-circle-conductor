import { describe, it, expect } from "vitest";
import { friendlyTimes } from "@/lib/friendlyTimes";
import { setAppTimeZone } from "@/lib/appTimeZone";
describe("friendlyTimes", () => {
  it("converts 24-hour clock to 12-hour", () => { expect(friendlyTimes("Starts 18:30")).toBe("Starts 6:30 PM"); });
  it("converts ISO to the given zone", () => { expect(friendlyTimes("2026-11-14T01:00:00Z", "America/Phoenix")).toContain("6:00 PM"); });
  it("leaves am/pm times alone", () => { expect(friendlyTimes("at 6:30 pm")).toBe("at 6:30 pm"); });
  it("uses the organization's time zone by default (6:30 pm Dec 9 in Tucson, not 1:30 AM UTC)", () => {
    setAppTimeZone("America/Phoenix");
    const out = friendlyTimes("2026-12-10T01:30:00Z");
    expect(out).toContain("Dec 9");
    expect(out).toContain("6:30 PM");
    setAppTimeZone(null);
  });
  it("shows a time without an offset exactly as written", () => {
    setAppTimeZone("America/New_York");
    expect(friendlyTimes("2026-12-09T18:30:00")).toContain("6:30 PM");
    setAppTimeZone(null);
  });
});
