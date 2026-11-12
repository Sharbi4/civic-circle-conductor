import { describe, expect, it } from "vitest";
import { isFacebookSecurityCheck, plainChoice, repeatedStep, searchFallbackUrl } from "@/lib/browserProgress.shared";

describe("browser research guards", () => {
  it("moves a Google verification page to the same search on DuckDuckGo", () => {
    const sorry = "https://www.google.com/sorry/index?continue=" + encodeURIComponent("https://www.google.com/search?q=tucson park pavilion rental") + "&q=EgR";
    expect(searchFallbackUrl(sorry)).toBe("https://duckduckgo.com/html/?q=tucson%20park%20pavilion%20rental");
    expect(searchFallbackUrl("https://www.google.com/search?q=cleanup+form")).toBe("https://duckduckgo.com/html/?q=cleanup%20form");
  });
  it("leaves Google Maps and city sites alone", () => {
    expect(searchFallbackUrl("https://www.google.com/maps/place/Mitchell+Park")).toBeNull();
    expect(searchFallbackUrl("https://www.tucsonaz.gov/parks")).toBeNull();
  });
  it("spots a repeated search or page on the same task", () => {
    const notes = ['Opened https://www.tucsonaz.gov/parks — Opened parks', 'Typed "park cleanup permit" — Searched'];
    expect(repeatedStep({ action: "navigate", url: "https://tucsonaz.gov/parks/" }, notes)).toMatch(/again/);
    expect(repeatedStep({ action: "type", text: "Park cleanup permit" }, notes)).toMatch(/again/);
    expect(repeatedStep({ action: "navigate", url: "https://www.tucsonaz.gov/files/cleanup-form.pdf" }, notes)).toBeNull();
  });
  it("hands Facebook's security check to the organizer", () => {
    expect(isFacebookSecurityCheck({ url: "https://www.facebook.com/checkpoint/1501092823525282/" })).toBe(true);
    expect(isFacebookSecurityCheck({ url: "https://www.facebook.com/groups/search", text: "Tucson groups" })).toBe(false);
  });
  it("shows quick-reply buttons without asterisks", () => {
    expect(plainChoice(" **Find the booking contact** ")).toBe("Find the booking contact");
  });
});
