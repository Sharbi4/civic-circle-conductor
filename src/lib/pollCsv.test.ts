import { describe, expect, it } from "vitest";
import { responsesToCsv } from "./pollCsv";

describe("responsesToCsv", () => {
  it("splits contact answers into name, email and phone columns", () => {
    const csv = responsesToCsv(
      [{ id: "q1", q: "Help with?", type: "multi" }, { id: "q2", q: "Contact", type: "contact" }],
      [{ created_at: "2026-11-10T10:00:00Z", answers: { q1: ["Setup", "Food"], q2: { name: "Ana", email: "a@x.org", phone: "520" } } }],
    );
    const [head, row] = csv.split("\r\n");
    expect(head).toBe('"Submitted","Help with?","Contact (name)","Contact (email)","Contact (phone)"');
    expect(row).toContain('"Setup; Food","Ana","a@x.org","520"');
  });
  it("neutralizes spreadsheet formulas", () => {
    const csv = responsesToCsv([{ id: "q1", q: "Note", type: "text" }], [{ created_at: "2026-11-10T10:00:00Z", answers: { q1: "=HYPERLINK(1)" } }]);
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
  });
});
