// Google "no cold email" rule: a small one-to-one email (a venue or vendor inquiry) may go to
// anyone the organizer approves, but a group send (invites, reminders, thank-yous) may only reach
// people who signed up or contacts the organization already has. No bulk or purchased lists.

/** Most recipients a one-to-one style email may have before it counts as a group send. */
export const DIRECT_EMAIL_MAX = 3;
/** Hard cap on recipients for any single approved send. */
export const GROUP_EMAIL_MAX = 300;

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/** Every distinct address in the given To/Cc/Bcc strings, lowercased. */
export function parseRecipients(...fields: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const f of fields) for (const m of (f ?? "").matchAll(EMAIL_RE)) out.add(m[0].toLowerCase());
  return [...out];
}

/** Every distinct address found anywhere in arbitrary saved data (poll answers, contact lists). */
export function emailsIn(value: unknown): string[] {
  return parseRecipients(typeof value === "string" ? value : JSON.stringify(value ?? ""));
}

export type RecipientCheck = { ok: true } | { ok: false; reason: "too_many" | "unknown"; unknown: string[] };

/** Whether an approved email may go to these recipients, given the organization's known people. */
export function checkRecipients(recipients: string[], known: Iterable<string>, orgEmail?: string | null): RecipientCheck {
  if (recipients.length > GROUP_EMAIL_MAX) return { ok: false, reason: "too_many", unknown: [] };
  if (recipients.length <= DIRECT_EMAIL_MAX) return { ok: true };
  const allowed = new Set([...known].map((e) => e.toLowerCase()));
  if (orgEmail) allowed.add(orgEmail.trim().toLowerCase());
  const unknown = recipients.filter((r) => !allowed.has(r));
  return unknown.length ? { ok: false, reason: "unknown", unknown } : { ok: true };
}

export function recipientRefusal(check: Exclude<RecipientCheck, { ok: true }>): string {
  if (check.reason === "too_many") return `That email has more than ${GROUP_EMAIL_MAX} recipients. Split it into smaller groups of people who signed up.`;
  const n = check.unknown.length;
  return `Group emails can only go to people who signed up or contacts your organization already has. ${n} address${n === 1 ? "" : "es"} on this email ${n === 1 ? "isn't" : "aren't"} one of them: ${check.unknown.slice(0, 5).join(", ")}${n > 5 ? ", …" : ""}. Remove ${n === 1 ? "it" : "them"} or add ${n === 1 ? "that person" : "those people"} to the event's contacts first.`;
}
