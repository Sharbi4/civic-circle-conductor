import { describe, it, expect } from "vitest";
import { domainMatches, normalizeDomain } from "@/lib/credentials.functions";

describe("saved login site matching", () => {
  it("normalizes urls to bare domains", () => {
    expect(normalizeDomain("https://www.Eventbrite.com/signin")).toBe("eventbrite.com");
  });
  it("uses a login on its own site and subdomains only", () => {
    expect(domainMatches("www.eventbrite.com", "eventbrite.com")).toBe(true);
    expect(domainMatches("evil-eventbrite.com", "eventbrite.com")).toBe(false);
    expect(domainMatches("eventbrite.com.evil.io", "eventbrite.com")).toBe(false);
  });
});
