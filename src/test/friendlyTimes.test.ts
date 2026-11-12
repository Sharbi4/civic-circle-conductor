import { describe, it, expect } from "vitest";
import { friendlyTimes } from "@/lib/friendlyTimes";
describe("friendlyTimes", () => {
  it("converts 24-hour clock to 12-hour", () => { expect(friendlyTimes("Starts 18:30")).toBe("Starts 6:30 PM"); });
  it("converts ISO to the given zone", () => { expect(friendlyTimes("2026-11-14T01:00:00Z", "America/Phoenix")).toContain("6:00 PM"); });
  it("leaves am/pm times alone", () => { expect(friendlyTimes("at 6:30 pm")).toBe("at 6:30 pm"); });
});
