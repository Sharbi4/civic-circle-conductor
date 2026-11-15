import { describe, expect, it } from "vitest";
import { checkRecipients, parseRecipients, GROUP_EMAIL_MAX } from "@/lib/emailRecipients.shared";

describe("group email recipients (no cold email)", () => {
  it("lets a one-to-one inquiry go to any approved address", () => {
    expect(checkRecipients(parseRecipients("bookings@venue.com"), [], null)).toEqual({ ok: true });
    expect(checkRecipients(parseRecipients("a@x.com", "b@x.com", "c@x.com"), [], null).ok).toBe(true);
  });

  it("blocks a group send that includes people who never signed up", () => {
    const r = checkRecipients(parseRecipients("org@civi.org", null, "a@x.com, b@x.com, c@x.com, stranger@list.com"), ["a@x.com", "b@x.com", "c@x.com"], "org@civi.org");
    expect(r).toEqual({ ok: false, reason: "unknown", unknown: ["stranger@list.com"] });
  });

  it("allows a group send to sign-ups and the organization's own address", () => {
    const r = checkRecipients(parseRecipients("Org@Civi.org", null, "A@x.com, b@x.com, c@x.com, d@x.com"), ["a@x.com", "b@x.com", "c@x.com", "d@x.com"], "org@civi.org");
    expect(r).toEqual({ ok: true });
  });

  it("refuses more than the hard cap even if everyone signed up", () => {
    const many = Array.from({ length: GROUP_EMAIL_MAX + 1 }, (_, i) => `p${i}@x.com`);
    expect(checkRecipients(many, many, null)).toEqual({ ok: false, reason: "too_many", unknown: [] });
  });
});
