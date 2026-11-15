import { describe, expect, it } from "vitest";
import { researchKind } from "@/lib/researchGoal.shared";
import { venueFromSummaryExtraction } from "@/lib/eventPage.shared";

describe("venue research classification", () => {
  it("treats venue searches that mention food rules as venue research", () => {
    const goal =
      "Search official Phoenix city community center rental and reservation pages for indoor rooms near central Phoenix light rail for January 23, 2027, 10 a.m. to noon, for 30 to 40 people with tables. Check Saturday hours, accessibility, capacity, food rules, fees, availability and booking method.";
    expect(researchKind(goal)).toBe("venue");
    expect(
      researchKind(
        "Find a park pavilion; check whether catering is allowed and the alcohol policy",
      ),
    ).toBe("venue");
  });

  it("still treats real vendor searches as vendor research", () => {
    expect(
      researchKind("Find 3 taco trucks or caterers that can serve 80 people plus a coffee option"),
    ).toBe("vendor");
    expect(researchKind("Find food trucks for the cleanup")).toBe("vendor");
  });
});

describe("venue extracted from a research summary", () => {
  const summary =
    "Eastlake Community Center\n\nCity venue page: 1549 E. Jefferson St., Phoenix, at 16th Street and Jefferson Street. Phone: 602-262-6759. Saturday hours are 9 a.m. to 7 p.m.";

  it("keeps details that appear in the summary", () => {
    const v = venueFromSummaryExtraction(
      {
        name: "Eastlake Community Center",
        address: "1549 E. Jefferson St., Phoenix",
        phone: "(602) 262-6759",
        terms: "Saturday 9 a.m. to 7 p.m.",
      },
      summary,
    );
    expect(v).toEqual({
      name: "Eastlake Community Center",
      address: "1549 E. Jefferson St., Phoenix",
      phone: "(602) 262-6759",
      terms: "Saturday 9 a.m. to 7 p.m.",
    });
  });

  it("drops anything the summary never said", () => {
    const v = venueFromSummaryExtraction(
      { name: "Eastlake Community Center", phone: "602-555-0100", email: "rentals@phoenix.gov" },
      summary,
    );
    expect(v).toEqual({ name: "Eastlake Community Center" });
  });

  it("rejects a venue name that isn't in the summary, and empty answers", () => {
    expect(venueFromSummaryExtraction({ name: "Burton Barr Library" }, summary)).toBeNull();
    expect(venueFromSummaryExtraction(null, summary)).toBeNull();
  });
});
