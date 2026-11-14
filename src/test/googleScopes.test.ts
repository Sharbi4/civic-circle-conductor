import { describe, expect, it } from "vitest";
import { GMAIL_SCOPES } from "@/lib/gmail.functions";
import { GOOGLE_APPS } from "@/lib/googleApps.functions";

const g = (s: string) => `https://www.googleapis.com/auth/${s}`;
describe("Google scopes requested for review (least privilege)", () => {
  it("Gmail asks only for gmail.modify, which covers read, draft, send and label", () => {
    expect(GMAIL_SCOPES.filter((s) => s.includes("gmail"))).toEqual([g("gmail.modify")]);
    expect(GMAIL_SCOPES).not.toContain("https://mail.google.com/");
  });
  it("Drive asks only for drive.file", () => {
    expect(GOOGLE_APPS.google_drive.scopes.filter((s) => s.includes("drive"))).toEqual([
      g("drive.file"),
    ]);
  });
  it("Calendar asks only for calendar.events", () => {
    expect(GOOGLE_APPS.google_calendar.scopes.filter((s) => s.includes("calendar"))).toEqual([
      g("calendar.events"),
    ]);
  });
  it("the full set matches what Cloud Console must list", () => {
    const all = new Set([
      ...GMAIL_SCOPES,
      ...GOOGLE_APPS.google_drive.scopes,
      ...GOOGLE_APPS.google_calendar.scopes,
    ]);
    expect([...all].sort()).toEqual(
      [
        g("calendar.events"),
        g("drive.file"),
        g("gmail.modify"),
        g("userinfo.email"),
        g("userinfo.profile"),
      ].sort(),
    );
  });
});
