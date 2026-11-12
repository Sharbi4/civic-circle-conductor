import { describe, expect, it } from "vitest";
import { docKind, documentGaps, hasDocumentImage } from "@/lib/documentCompleteness";

const thinAgenda = `## Agenda\n- Welcome and introductions\n- Update on public lands and voter registration work\n- Pick roles for the next activity\n- Set the next date\n\n## Photography note\nA relevant real, reusable photograph could not be retrieved.`;

describe("finished documents", () => {
  it("treats a run of show as an agenda", () => {
    expect(docKind("agenda", "Volunteer Meetup - Dec 9 Run of Show")).toBe("agenda");
    expect(docKind("communication", "Volunteer meetup invitation")).toBe("letter");
  });
  it("rejects a four-bullet agenda with a missing-photo note", () => {
    const gaps = documentGaps("agenda", "Volunteer Meetup - Dec 9 Run of Show", thinAgenda);
    expect(gaps.some((g) => g.startsWith("too short"))).toBe(true);
    expect(gaps).toContain("needs a timed agenda table");
    expect(gaps).toContain("contains a note about a missing photo");
  });
  it("rejects placeholders", () => {
    expect(documentGaps("letter", "Invitation", `Dear [Name], ${"word ".repeat(250)}`).some((g) => g.includes("placeholder"))).toBe(true);
  });
  it("accepts a full agenda", () => {
    const rows = Array.from({ length: 12 }, (_, i) => `| 6:${String(i * 5).padStart(2, "0")} PM | Segment ${i} | Shawnna Harbin | ${"Clear purpose and details for this part of the evening. ".repeat(4)} |`).join("\n");
    const body = `## Event details\nWednesday, December 9, 2026, 6–8 p.m. at the Ward 3 Community Room.\n\n## Timed agenda\n| Time | Segment | Lead | Details |\n|---|---|---|---|\n${rows}\n\n## Roles\nHost, greeter and note-taker.\n\n## Follow-up\nSend thank-you notes within two days.`;
    expect(documentGaps("agenda", "Run of Show", body)).toEqual([]);
  });
  it("requires a picture", () => {
    expect(hasDocumentImage("## Intro\ntext")).toBe(false);
    expect(hasDocumentImage("![Illustration](document-photo:u/documents/a.jpg)\n\ntext")).toBe(true);
  });
});

import { photoMatchesSubject, photoSubjectWords } from "@/lib/documentStandards";
describe("document pictures", () => {
  it("only uses a real photo that names the document's subject", () => {
    expect(photoSubjectWords("Volunteer Meetup - Dec 9 Run of Show")).toEqual([]);
    const park = photoSubjectWords("Mitchell Park Cleanup Day Plan");
    expect(photoMatchesSubject("File:Mitchell Park Tucson.jpg", park)).toBe(true);
    expect(photoMatchesSubject("File:Matus House - Tucson Arizona.jpg", park)).toBe(false);
  });
});
