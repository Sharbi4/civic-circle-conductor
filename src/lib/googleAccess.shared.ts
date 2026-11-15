// Google OAuth verification gate. Until Google approves the Gmail/Calendar/Drive scopes, the
// Connect buttons are offered only to test accounts, so unverified scopes never reach real users
// (Google's "Live Apps" rule). After approval, set GOOGLE_OAUTH_VERIFIED=true to open it to everyone.

/** Accounts that may connect Google while verification is pending. Add the Google reviewer's test login here. */
export const GOOGLE_PREVIEW_EMAILS: readonly string[] = ["demo@civimeet.app", "google-reviewer@civimeet.app", "investor-demo@civimeet.app"];

function parseList(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether this signed-in user may start a Google connection.
 * extraEmails: optional comma-separated GOOGLE_PREVIEW_EMAILS setting; verified: GOOGLE_OAUTH_VERIFIED setting.
 */
export function googleConnectAllowed(
  email: string | null | undefined,
  extraEmails?: string | null,
  verified?: string | null,
): boolean {
  if ((verified ?? "").trim().toLowerCase() === "true") return true;
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  return [...GOOGLE_PREVIEW_EMAILS.map((x) => x.toLowerCase()), ...parseList(extraEmails)].includes(
    e,
  );
}

export const GOOGLE_CONNECT_LOCKED_MESSAGE =
  "Google connections are opening soon. We'll let you know as soon as Gmail, Calendar and Drive are available for your organization.";
