import { describe, expect, it } from "vitest";
import { isHiddenTurn, hiddenTurnLabel } from "@/lib/chatVisibility.shared";
import { researchKind, fallbackSummary, goalSummaryRules } from "@/lib/researchGoal.shared";
import { needsCallFollowUp } from "@/lib/callFollowUp.shared";
import { documentConflicts, isDocumentUrl, eventWeekday } from "@/lib/documentRead.shared";
import { parseEventPageMarkers, stripEventPageMarkers, mergePeople, venuePagePatch } from "@/lib/eventPage.shared";
import { actionForStep, actionStateLabel } from "@/lib/eventActivity.shared";

describe("internal continuation prompts stay out of chat", () => {
  it("hides the research hand-back and its phone-fallback instructions", () => {
    const m = { role: "user", content: "[Research finished — continue automatically] Goal: find a room\n\nApply your phone-fallback rule now… venue_call" };
    expect(isHiddenTurn(m)).toBe(true);
    expect(hiddenTurnLabel(m.content)).toBeNull();
  });
  it("hides every turn saved as a system turn", () => {
    expect(isHiddenTurn({ role: "system", content: "anything" })).toBe(true);
  });
  it("still shows what the organizer typed", () => {
    expect(isHiddenTurn({ role: "user", content: "Find food trucks for Dec 9" })).toBe(false);
  });
});

describe("research summaries answer the actual goal", () => {
  it("treats a food vendor search as a vendor goal, not a venue goal", () => {
    expect(researchKind("Find food vendors for the meetup at Ward 3 Community Room")).toBe("vendor");
    expect(researchKind("Book the venue for Dec 9")).toBe("venue");
  });
  it("never sends a vendor search down the venue phone-call path", () => {
    expect(needsCallFollowUp("Find food trucks that can serve at the venue", "Found three trucks.")).toBe(false);
  });
  it("asks vendor summaries for named vendors with links, prices and contacts", () => {
    const rules = goalSummaryRules("Find food trucks");
    expect(rules).toContain("| Vendor | Type | Link | Price / minimum | Contact |");
  });
  it("reports pages read instead of 'no findings', without the venue template, for vendors", () => {
    const s = fallbackSummary("Find food trucks", ["Opened https://tacotruck.example/menu", "Read PDF https://x.example/menu.pdf — Facts: $500 minimum"]);
    expect(s).toContain("https://tacotruck.example/menu");
    expect(s).toContain("$500 minimum");
    expect(s).not.toMatch(/no findings/i);
    expect(s).not.toMatch(/availability call/i);
  });
});

describe("documents opened in the browser are checked against the event", () => {
  const ev = { title: "Meetup", date: "2026-12-09", headcount: 30, venue: null, budget: 300 };
  it("recognizes PDF and Word links", () => {
    expect(isDocumentUrl("https://city.gov/forms/rental.pdf?x=1")).toBe(true);
    expect(isDocumentUrl("https://city.gov/forms/rental.docx")).toBe(true);
    expect(isDocumentUrl("https://city.gov/rentals")).toBe(false);
    expect(isDocumentUrl("https://city.gov/get?id=4", "application/pdf")).toBe(true);
  });
  it("flags a venue closed on the event's weekday", () => {
    expect(eventWeekday("2026-12-09")).toBe(3);
    expect(documentConflicts("Hours: 9am–9pm. Closed on Wednesdays and holidays.", ev)[0]).toContain("closed on Wednesdays");
    expect(documentConflicts("Closed Sundays.", ev)).toEqual([]);
  });
  it("flags a room too small for the expected turnout", () => {
    expect(documentConflicts("Maximum capacity: 25 people.", ev)[0]).toContain("capacity of 25");
    expect(documentConflicts("Maximum capacity: 60 people.", ev)).toEqual([]);
  });
});

describe("Civi writes research results to the event page", () => {
  const text = 'Here they are.\n[[event_vendor: {"name":"Tacos Apson","type":"taco truck","url":"https://tacosapson.example","price_range":"$12–15 pp, $500 minimum","status":"quoted"}]]\n[[event_contact: {"name":"Maria Lopez","role":"Ward 3 booking","phone":"(520) 791-4687","email":"ward3@tucsonaz.gov"}]]\n[[event_venue: {"name":"Ward 3 Community Room","address":"1510 E Grant Rd, Tucson","terms":"Capacity 49; no fee for nonprofits"}]]';
  it("parses venue, contacts and vendors and removes the markers from chat", () => {
    const m = parseEventPageMarkers(text);
    expect(m.vendors[0]).toMatchObject({ name: "Tacos Apson", role: "taco truck", url: "https://tacosapson.example", price: "$12–15 pp, $500 minimum", status: "quoted" });
    expect(m.contacts[0]).toMatchObject({ name: "Maria Lopez", role: "Ward 3 booking", email: "ward3@tucsonaz.gov" });
    expect(m.venue).toMatchObject({ name: "Ward 3 Community Room", address: "1510 E Grant Rd, Tucson" });
    expect(stripEventPageMarkers(text).trim()).toBe("Here they are.");
  });
  it("merges without duplicating or un-booking a vendor", () => {
    const merged = mergePeople([{ name: "Tacos Apson", booked: true, status: "booked", phone: "520-555-0101" }], [{ name: "tacos apson", status: "suggested", price: "$500 min" }, { name: "Seis Kitchen" }]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ booked: true, status: "booked", phone: "520-555-0101", price: "$500 min" });
  });
  it("never replaces a venue already booked", () => {
    expect(venuePagePatch({ name: "Other Hall" }, { venue_status: "booked" })).toEqual({});
  });
});

describe("What Civi has done", () => {
  it("shows a step skipped for a missing connection as 'Not connected' with its plain title", () => {
    const a = actionForStep({ id: "1", title: "Post on Facebook", step_state: "skipped", step_note: "Facebook isn't connected — ready-to-paste draft is in the chat", done_at: "2026-11-11T06:00:00Z", result_url: null });
    expect(a.text).toBe("Post on Facebook");
    expect(actionStateLabel(a.state)).toBe("Not connected");
  });
  it("lists a finished step as its title, not 'Completed: …'", () => {
    expect(actionForStep({ id: "3", title: "Post on X", step_state: "done", done_at: "2026-11-11T06:00:00Z", result_url: null }).text).toBe("Post on X");
  });
  it("gives finished posts a View link", () => {
    expect(actionForStep({ id: "2", title: "Post on X", step_state: "done", done_at: "2026-11-11T06:00:00Z", result_url: "https://x.com/i/web/status/1" }).url).toBe("https://x.com/i/web/status/1");
  });
});
