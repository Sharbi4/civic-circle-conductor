import { describe, expect, it } from "vitest";
import { isLinkedInBrowserTask, isLinkedInUrl } from "@/lib/linkedinRouting.shared";
import { openBrowserSession, retargetSession } from "@/lib/browser.server";
describe("LinkedIn API-only routing", () => {
  it("blocks LinkedIn browser tasks while keeping venue and Facebook research available", () => {
    expect(isLinkedInBrowserTask("Sign in to LinkedIn and publish a post")).toBe(true);
    expect(isLinkedInBrowserTask("Open https://www.linkedin.com/feed")).toBe(true);
    expect(isLinkedInBrowserTask("Research Ward 3 room availability")).toBe(false);
    expect(isLinkedInBrowserTask("Open Facebook groups")).toBe(false);
  });
  it("blocks LinkedIn domains and short links but not unrelated domains", () => {
    expect(isLinkedInUrl("https://www.linkedin.com/feed")).toBe(true);
    expect(isLinkedInUrl("https://lnkd.in/example")).toBe(true);
    expect(isLinkedInUrl("https://linkedin.com.example.org")).toBe(false);
  });
  it("rejects new sessions and retargeting before any browser or saved-login access", async () => {
    const db = { from: () => { throw new Error("Must not access browser data"); } };
    await expect(openBrowserSession({ supabase: db, userId: "owner", threadId: "thread", task: "Post on LinkedIn", lovableKey: "test", connKey: "test" })).rejects.toThrow("not the live browser");
    await expect(retargetSession(db, "session", "Authenticate LinkedIn")).rejects.toThrow("not the live browser");
  });
});