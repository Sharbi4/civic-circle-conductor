import { describe, expect, it } from "vitest";
import { choicesIn, stripChoices } from "@/lib/choices.shared";

describe("quick-reply buttons", () => {
  it("reads the usual A | B form", () => {
    expect(choicesIn("Pick one.\n\n[[choices: Library room | Community center]]")).toEqual(["Library room", "Community center"]);
  });
  it("reads a JSON list as buttons and leaves no stray bracket", () => {
    const text = '[[choices: ["Prepare availability call", "Fill the application", "Compare alternatives"]]]\n\n📋 Saved to the event page: 2 contacts.';
    expect(choicesIn(text)).toEqual(["Prepare availability call", "Fill the application", "Compare alternatives"]);
    const shown = stripChoices(text).trim();
    expect(shown).toBe("📋 Saved to the event page: 2 contacts.");
    expect(shown).not.toContain("]");
  });
  it("handles an unclosed list and quoted, bold labels", () => {
    expect(choicesIn('[[choices: ["**Call the venue**", "Not now"]]')).toEqual(["Call the venue", "Not now"]);
    expect(choicesIn("[[choices: [Call the venue, Not now]]")).toEqual(["Call the venue", "Not now"]);
  });
  it("returns nothing when there are no buttons", () => {
    expect(choicesIn("Just text.")).toBeNull();
    expect(choicesIn("[[choices: ]]")).toBeNull();
  });
});
