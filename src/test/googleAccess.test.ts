import { describe, expect, it } from "vitest";
import {
  GOOGLE_CONNECT_LOCKED_MESSAGE,
  GOOGLE_PREVIEW_EMAILS,
  googleConnectAllowed,
} from "@/lib/googleAccess.shared";

describe("Google verification gate", () => {
  it("lets the built-in test accounts connect, ignoring case and spaces", () => {
    expect(GOOGLE_PREVIEW_EMAILS).toContain("demo@civimeet.app");
    expect(googleConnectAllowed("demo@civimeet.app")).toBe(true);
    expect(googleConnectAllowed("  Demo@CiviMeet.app ")).toBe(true);
  });

  it("keeps everyone else out while verification is pending", () => {
    expect(googleConnectAllowed("someone@nonprofit.org")).toBe(false);
    expect(googleConnectAllowed(null)).toBe(false);
    expect(googleConnectAllowed("")).toBe(false);
  });

  it("adds reviewer accounts from the GOOGLE_PREVIEW_EMAILS setting", () => {
    const extra = "reviewer@example.com, qa@example.com";
    expect(googleConnectAllowed("reviewer@example.com", extra)).toBe(true);
    expect(googleConnectAllowed("QA@example.com", extra)).toBe(true);
    expect(googleConnectAllowed("other@example.com", extra)).toBe(false);
  });

  it("opens to everyone once GOOGLE_OAUTH_VERIFIED is true", () => {
    expect(googleConnectAllowed("someone@nonprofit.org", null, "true")).toBe(true);
    expect(googleConnectAllowed("someone@nonprofit.org", null, "TRUE")).toBe(true);
    expect(googleConnectAllowed("someone@nonprofit.org", null, "false")).toBe(false);
  });

  it("explains the lock in calm, plain words", () => {
    expect(GOOGLE_CONNECT_LOCKED_MESSAGE).toMatch(/opening soon/);
    expect(GOOGLE_CONNECT_LOCKED_MESSAGE).not.toMatch(/OAuth|verification|error/i);
  });
});
