import { describe, expect, it } from "vitest";
import { claimLetterheadReminder, resetLetterheadReminders } from "@/lib/letterheadSession";

describe("letterhead session reminder", () => {
  it("shows only once in a signed-in session, including after remounts", () => {
    sessionStorage.clear();
    expect(claimLetterheadReminder(sessionStorage, "owner-a")).toBe(true);
    expect(claimLetterheadReminder(sessionStorage, "owner-a")).toBe(false);
  });
  it("allows another reminder after sign-out, without deleting unrelated settings", () => {
    sessionStorage.clear();
    sessionStorage.setItem("other-setting", "keep");
    claimLetterheadReminder(sessionStorage, "owner-a");
    resetLetterheadReminders(sessionStorage);
    expect(claimLetterheadReminder(sessionStorage, "owner-a")).toBe(true);
    expect(sessionStorage.getItem("other-setting")).toBe("keep");
  });
  it("does not reuse one account's reminder status for another account", () => {
    sessionStorage.clear();
    claimLetterheadReminder(sessionStorage, "owner-a");
    expect(claimLetterheadReminder(sessionStorage, "owner-b")).toBe(true);
  });
});