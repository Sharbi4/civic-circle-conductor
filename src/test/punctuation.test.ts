import { describe, it, expect } from "vitest";
import { noLongDashes } from "@/lib/punctuation.shared";

describe("Civi never writes long dashes", () => {
  it("turns a dash used as a pause into a comma", () => {
    expect(noLongDashes("Great — I'm searching Facebook now.")).toBe("Great, I'm searching Facebook now.");
    expect(noLongDashes("Civi — your organizer — helps.")).toBe("Civi, your organizer, helps.");
    expect(noLongDashes("Tacos Apson—local favorite")).toBe("Tacos Apson, local favorite");
  });
  it("turns ranges into plain hyphens", () => {
    expect(noLongDashes("Dec 9, 6–8 p.m. for 25—30 people")).toBe("Dec 9, 6-8 p.m. for 25-30 people");
  });
  it("leaves real hyphens and plain text untouched", () => {
    expect(noLongDashes("Follow-up sign-up form")).toBe("Follow-up sign-up form");
  });
  it("drops dashes that only add noise", () => {
    expect(noLongDashes("Done. — Next up")).toBe("Done. Next up");
    expect(noLongDashes("— Shawnna")).toBe("Shawnna");
    expect(noLongDashes("**Next steps —**")).toBe("**Next steps**");
    expect(noLongDashes("Where this stands —\nmore")).toBe("Where this stands\nmore");
  });
  it("keeps markdown and links intact", () => {
    expect(noLongDashes("✅ Posted — [view it](https://x.com/i/web/status/1)")).toBe("✅ Posted, [view it](https://x.com/i/web/status/1)");
  });
});
