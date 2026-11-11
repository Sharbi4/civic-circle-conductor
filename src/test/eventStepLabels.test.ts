import { describe, expect, it } from "vitest";
import { EVENT_STEPS } from "@/lib/eventSteps.shared";
import { EVENT_PLAYBOOK } from "@/lib/eventPlaybook";

const MECHANISM = /\b(api|browser)\b/i;

describe("event step labels", () => {
  it("names every checklist step by the task alone, never by the mechanism", () => {
    for (const title of EVENT_STEPS) expect(title).not.toMatch(MECHANISM);
  });

  it("keeps the launch-chain step names free of mechanism labels", () => {
    const stepNames = EVENT_PLAYBOOK.split("\n")
      .map((line) => line.match(/^\s+\d+\.\s+([A-Z][^:]*?):/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => m[1] ?? "");
    expect(stepNames.length).toBeGreaterThanOrEqual(7);
    for (const name of stepNames) expect(name).not.toMatch(MECHANISM);
  });

  it("tells the agent to write plain step names in plans and checklists", () => {
    expect(EVENT_PLAYBOOK).toMatch(/STEP NAMES ARE PLAIN/);
  });
});
