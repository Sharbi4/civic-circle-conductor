import { describe, expect, it } from "vitest";
import { browserLivenessFrom, showLiveBrowser, awaitingBrowserCheck, closedBrowserMessage, BROWSER_CLOSED, BROWSER_CLOSED_AFTER_FAILURE } from "@/lib/browserLiveness.shared";

const row = { status: "running", live_url: "https://www.browserbase.com/devtools/x", agent_status: "driving" };

describe("Browserbase session check", () => {
  it("treats RUNNING as alive", () => expect(browserLivenessFrom(200, "RUNNING")).toBe("alive"));
  it.each(["COMPLETED", "TIMED_OUT", "ERROR"])("treats %s as closed", (s) => expect(browserLivenessFrom(200, s)).toBe("closed"));
  it("treats a 404 as closed", () => expect(browserLivenessFrom(404)).toBe("closed"));
  it("never closes a session when the provider can't be reached", () => {
    expect(browserLivenessFrom(null)).toBe("unknown");
    expect(browserLivenessFrom(502)).toBe("unknown");
    expect(browserLivenessFrom(401)).toBe("unknown");
  });
});

describe("when the live browser view shows", () => {
  it("shows for a running session the check hasn't closed, including when the provider couldn't be reached", () => {
    expect(showLiveBrowser(row, "alive")).toBe(true);
    expect(showLiveBrowser(row, "unknown")).toBe(true);
  });
  it("waits for the first check instead of flashing a possibly dead browser", () => {
    expect(showLiveBrowser(row, undefined)).toBe(false);
    expect(awaitingBrowserCheck(row, undefined)).toBe(true);
    expect(awaitingBrowserCheck(row, "alive")).toBe(false);
    expect(awaitingBrowserCheck({ ...row, status: "ended" }, undefined)).toBe(false);
  });
  it("hides once the check says the session closed", () => expect(showLiveBrowser(row, "closed")).toBe(false));
  it("hides when Civi's browser work failed", () => expect(showLiveBrowser({ ...row, agent_status: "failed" }, "alive")).toBe(false));
  it("hides when the session row has ended or has no live link", () => {
    expect(showLiveBrowser({ ...row, status: "ended" }, "alive")).toBe(false);
    expect(showLiveBrowser({ ...row, live_url: null }, "alive")).toBe(false);
    expect(showLiveBrowser(null, "alive")).toBe(false);
  });
  it("explains a closed browser kindly, mentioning a failure only after one", () => {
    expect(closedBrowserMessage("failed")).toBe(BROWSER_CLOSED_AFTER_FAILURE);
    expect(closedBrowserMessage("done")).toBe(BROWSER_CLOSED);
    expect(BROWSER_CLOSED_AFTER_FAILURE).toContain("ask Civi to pick it back up");
  });
});
