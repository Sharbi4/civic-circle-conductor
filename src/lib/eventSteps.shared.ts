// Plain-language checklist every event goal starts with, in the order Civi works it.
export const EVENT_STEPS = [
  "Pick the date, budget & helpers",
  "Book the venue",
  "RSVP sign-up",
  "Eventbrite",
  "LinkedIn event",
  "Post on X",
  "Post on LinkedIn",
  "Facebook event & groups",
  "Instagram",
  "Email invites",
  "Reminders (week & day before)",
  "Thank-you & feedback poll",
] as const;

// Short descriptions shown under each step. Steps are completed by Civi, not ticked by the user.
const INFO: [RegExp, string][] = [
  [/budget|date|helper|people/i, "Set the budget, expected turnout and venue — tap to fill in what you know."],
  [/venue/i, "Find, check availability and reserve the space."],
  [/rsvp|sign-?up/i, "A shareable sign-up so you know who's coming."],
  [/eventbrite/i, "List the event and open ticketing."],
  [/linkedin event/i, "Create the event on your LinkedIn page."],
  [/\bx\b/i, "Announce it to your followers on X."],
  [/post on linkedin/i, "Share an update with a photo on LinkedIn."],
  [/facebook/i, "Create the Facebook event and share it in local groups."],
  [/instagram/i, "Post the event photo and details."],
  [/email/i, "Send invitations to your contacts."],
  [/remind/i, "Nudge everyone a week and a day before."],
  [/thank|feedback/i, "Thank attendees and collect feedback."],
];
export function stepInfo(title: string): string | null {
  return INFO.find(([r]) => r.test(title))?.[1] ?? null;
}
export function isEssentialsStep(title: string): boolean {
  return /budget/i.test(title);
}
export function sortSteps<T extends { title: string; created_at: string }>(steps: T[]): T[] {
  const idx = (t: string) => { const i = (EVENT_STEPS as readonly string[]).indexOf(t); return i < 0 ? 99 : i; };
  return [...steps].sort((a, b) => idx(a.title) - idx(b.title) || a.created_at.localeCompare(b.created_at));
}
