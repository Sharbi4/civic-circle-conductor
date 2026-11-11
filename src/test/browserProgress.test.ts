import { describe, expect, it } from "vitest";
import { browserNeedsProgressReport } from "@/lib/browserProgress.shared";
describe("bounded browser research checkpoints", () => {
  it("allows 24 steps but requires a progress report at 25 rather than further browsing", () => {
    expect(browserNeedsProgressReport(Array.from({ length: 24 }, () => ({ action: "navigate" })))).toBe(false);
    expect(browserNeedsProgressReport(Array.from({ length: 25 }, () => ({ action: "navigate" })))).toBe(true);
  });
  it("starts a fresh allowance for a newly targeted task", () => {
    const previous = Array.from({ length: 25 }, () => ({ action: "navigate" }));
    expect(browserNeedsProgressReport([...previous, { action: "task" }, { action: "navigate" }])).toBe(false);
  });
});