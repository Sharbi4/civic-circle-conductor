import { describe, expect, it } from "vitest";
import { endedBrowserMessage, providerSessionAlive, showLiveFrame } from "@/lib/browserLive.shared";

const open = { status: "running", live_url: "https://live.example/debug", agent_status: "driving" };

describe("live browser view", () => {
  it("treats only RUNNING provider sessions as open", () => {
    expect(providerSessionAlive("RUNNING")).toBe(true);
    expect(providerSessionAlive("running")).toBe(true);
    for (const s of ["COMPLETED", "TIMED_OUT", "ERROR", "", null, undefined])
      expect(providerSessionAlive(s)).toBe(false);
  });

  it("shows the embed for an open session while the provider is alive or not yet checked", () => {
    expect(showLiveFrame(open, true)).toBe(true);
    expect(showLiveFrame(open, undefined)).toBe(true);
    expect(showLiveFrame(open, null)).toBe(true); // provider unreachable: unknown, keep showing
  });

  it("hides the embed once the provider has closed the browser, even if the row still says running", () => {
    expect(showLiveFrame(open, false)).toBe(false);
  });

  it("hides the embed when Civi has lost the browser", () => {
    expect(showLiveFrame({ ...open, agent_status: "failed" }, true)).toBe(false);
  });

  it("hides the embed for ended rows or rows without a live view", () => {
    expect(showLiveFrame({ ...open, status: "ended" }, true)).toBe(false);
    expect(showLiveFrame({ ...open, live_url: null }, true)).toBe(false);
    expect(showLiveFrame(null, true)).toBe(false);
  });

  it("explains a closed browser in plain words", () => {
    expect(endedBrowserMessage("failed")).toMatch(/closed while Civi was working/);
    expect(endedBrowserMessage("done")).toMatch(/has closed/);
    expect(endedBrowserMessage("done")).not.toMatch(/WebSocket|DevTools/);
  });
});
