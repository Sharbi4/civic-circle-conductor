import { describe, expect, it } from "vitest";
import { GMAIL_SCOPES } from "@/lib/gmail.functions";
import { GOOGLE_APPS } from "@/lib/googleApps.functions";

const g = (s: string) => `https://www.googleapis.com/auth/${s}`;
describe("Google scopes requested for review", () => {
  it("Gmail asks for read, send, compose and modify", () => {
    expect(GMAIL_SCOPES.filter((s) => s.includes("gmail"))).toEqual(["gmail.readonly", "gmail.send", "gmail.compose", "gmail.modify"].map(g));
  });
  it("Drive asks only for drive.file", () => {
    expect(GOOGLE_APPS.google_drive.scopes.filter((s) => s.includes("drive"))).toEqual([g("drive.file")]);
  });
  it("Calendar asks only for calendar.events", () => {
    expect(GOOGLE_APPS.google_calendar.scopes.filter((s) => s.includes("calendar"))).toEqual([g("calendar.events")]);
  });
});
