import { describe, expect, it } from "vitest";
import {
  isApprovedBrowserGoal,
  isSignInHandoff,
  lastHandoffReason,
  sameHandoff,
} from "@/lib/browserProgress.shared";

describe("live browser handoffs", () => {
  it("recognizes sign-in walls, including library cards and barcodes", () => {
    expect(
      isSignInHandoff("Reached the library login required to inspect the reservation form"),
    ).toBe(true);
    expect(
      isSignInHandoff("Reached the library card login required to inspect the reservation form"),
    ).toBe(true);
    expect(isSignInHandoff("Please enter your library barcode")).toBe(true);
    expect(isSignInHandoff("Sign in to your Eventbrite account to continue")).toBe(true);
    expect(isSignInHandoff("Choose the room you prefer", true)).toBe(true); // the page itself shows a password field
  });

  it("keeps human-only steps as real handoffs", () => {
    expect(isSignInHandoff("Solve the CAPTCHA so I can continue")).toBe(false);
    expect(isSignInHandoff("Enter the verification code sent to your phone")).toBe(false);
    expect(isSignInHandoff("Facebook wants to confirm it's you with a quick security check")).toBe(
      false,
    );
    expect(isSignInHandoff("Enter the card number and CVV to pay the deposit")).toBe(false);
    expect(isSignInHandoff("Pick which Saturday you prefer")).toBe(false);
  });

  it("tells approved actions apart from research", () => {
    expect(
      isApprovedBrowserGoal(
        "Search the official Phoenix Public Library website for meeting rooms",
        false,
      ),
    ).toBe(false);
    expect(
      isApprovedBrowserGoal(
        'APPROVED by the organizer: join the Facebook group "Garfield Neighbors".',
        false,
      ),
    ).toBe(true);
    expect(isApprovedBrowserGoal("Submit the Ward 3 reservation form", true)).toBe(true);
  });

  it("finds the handoff the organizer just handed back", () => {
    const notes = [
      "Opened the Acacia meeting room reservation page",
      "Your turn: Reached the library login required to inspect the reservation form",
      "Notes from https://calendar.phoenixpubliclibrary.org: Acacia room, capacity 40",
    ];
    expect(lastHandoffReason(notes)).toBe(
      "Reached the library login required to inspect the reservation form",
    );
    expect(lastHandoffReason(["Opened a page", "Clicked Search"])).toBeNull();
  });

  it("treats a second sign-in request, or the same request reworded, as a loop", () => {
    expect(
      sameHandoff(
        "Reached the library login required to inspect the reservation form",
        "Reached the library card login required to inspect the reservation form",
      ),
    ).toBe(true);
    expect(sameHandoff("Pick which Saturday you prefer.", "Pick which Saturday you prefer")).toBe(
      true,
    );
    // After signing in, a new kind of step (a code) is a genuine next handoff.
    expect(
      sameHandoff(
        "Sign in to your Eventbrite account",
        "Enter the verification code Eventbrite sent you",
      ),
    ).toBe(false);
  });
});
