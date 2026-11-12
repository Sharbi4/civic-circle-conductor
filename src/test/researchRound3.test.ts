import { describe, expect, it } from "vitest";
import { pageFactLines, pageNote } from "@/lib/pageNotes.shared";
import { parseEventPageMarkers, vendorsFromTable } from "@/lib/eventPage.shared";
import { browserNeedsProgressReport, BROWSER_STEP_LIMIT } from "@/lib/browserProgress.shared";
import { hasEventConflict } from "@/lib/callFollowUp.shared";
import { fallbackSummary } from "@/lib/researchGoal.shared";

describe("browser page notes", () => {
  it("keeps price, minimum and contact lines from the whole page", () => {
    const text = "Welcome to Micha's\nTaco Bar Buffet $14.95 per person\nMinimum 50 guests\nCall 520-623-5307\nOur story began in 1976";
    expect(pageFactLines(text)).toEqual(["Taco Bar Buffet $14.95 per person", "Minimum 50 guests", "Call 520-623-5307"]);
  });

  it("notes a vendor page once, with its own URL, and skips search results", () => {
    const facts = ["Taco Bar Buffet $14.95 per person"];
    const note = pageNote({ url: "https://www.michascatering.com/menus.php", title: "Micha's Catering" }, undefined, facts, []);
    expect(note).toBe("Notes from Micha's Catering — https://www.michascatering.com/menus.php: Taco Bar Buffet $14.95 per person");
    expect(pageNote({ url: "https://www.michascatering.com/menus.php", title: "x" }, undefined, facts, [note!])).toBeNull();
    expect(pageNote({ url: "https://duckduckgo.com/html/?q=tacos", title: "DDG" }, "anything", facts, [])).toBeNull();
  });

  it("page notes and document reads don't use up the browsing allowance", () => {
    const steps = [{ action: "task" }, ...Array.from({ length: BROWSER_STEP_LIMIT - 1 }, () => ({ action: "navigate" })), ...Array.from({ length: 10 }, () => ({ action: "page" }))];
    expect(browserNeedsProgressReport(steps)).toBe(false);
    expect(browserNeedsProgressReport([...steps, { action: "click" }])).toBe(true);
  });

  it("the fallback summary reports what each page showed", () => {
    const out = fallbackSummary("find taco caterers", ["Notes from Micha's — https://michas.example/menu: $14.95 per person"]);
    expect(out).toContain("$14.95 per person");
  });
});

describe("event page saves every vendor and the venue's contact", () => {
  const table = [
    "| Vendor | Type | Link | Price / minimum | Contact | Fit |",
    "|---|---|---|---|---|---|",
    "| **Micha's Restaurant** | Taco bar | [Menu](https://www.michascatering.com/menus.php) | $14.95 per person | 520-623-5307 | Strong |",
    "| Taco Rico | Taco truck | [Search](https://duckduckgo.com/html/?q=taco) | ≈ $900–1,400 for 80 est. | via website | Backup |",
    "| Teddy's Coffee Cart | Coffee | [Site](https://teddyscoffee.example.com) | not listed | hello@teddyscoffee.example.com | Coffee |",
  ].join("\n");

  it("reads all three vendors from a comparison table", () => {
    const v = vendorsFromTable(table);
    expect(v.map((x) => x.name)).toEqual(["Micha's Restaurant", "Taco Rico", "Teddy's Coffee Cart"]);
    expect(v[0]).toMatchObject({ url: "https://www.michascatering.com/menus.php", price: "$14.95 per person", phone: "520-623-5307" });
    expect(v[1]?.url).toBeUndefined();
    expect(v[2]?.price).toBeUndefined();
    expect(v[2]?.email).toBe("hello@teddyscoffee.example.com");
  });

  it("a marker and the table for the same vendor make one entry", () => {
    const marks = parseEventPageMarkers(`${table}\n[[event_vendor: {"name":"Micha's Restaurant","type":"Taco bar"}]]`);
    expect(marks.vendors).toHaveLength(3);
  });

  it("saves the venue's booking phone and email to Contacts", () => {
    const marks = parseEventPageMarkers('[[event_venue: {"name":"Armory Park Center","address":"220 S. 5th Ave., Tucson","phone":"520-791-4865","email":"TPRD-Armory@tucsonaz.gov"}]]');
    expect(marks.contacts).toEqual([{ name: "Armory Park Center", role: "Venue booking office", phone: "520-791-4865", email: "TPRD-Armory@tucsonaz.gov" }]);
  });
});

describe("conflicts lead with alternatives", () => {
  it("spots a closed-on-the-event-day conflict", () => {
    expect(hasEventConflict("The document lists Saturday as **closed**, so the requested Saturday slot cannot be assumed available.")).toBe(true);
    expect(hasEventConflict("Large rooms hold 120; open Saturdays 8–5.")).toBe(false);
  });
});
