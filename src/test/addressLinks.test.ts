import { describe, it, expect } from "vitest";
import { linkAddresses } from "@/lib/addressLinks";
describe("linkAddresses", () => {
  it("links a full street address to Google Maps", () => {
    expect(linkAddresses("Meet at 123 Main St, Phoenix, AZ 85004 today")).toContain("[123 Main St, Phoenix, AZ 85004](https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Phoenix%2C%20AZ%2085004)");
  });
  it("leaves existing links untouched", () => {
    const s = "[Venue](https://x.com/123 Main St)";
    expect(linkAddresses(s)).toBe(s);
  });
  it("ignores plain numbers", () => { expect(linkAddresses("We expect 120 people")).toBe("We expect 120 people"); });
});
