export function isLinkedInBrowserTask(task: string): boolean {
  return /\blinked\s*in\b|\blinkedin\.com\b|\blnkd\.in\b/i.test(task);
}
export function isLinkedInUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in";
  } catch { return false; }
}
export const LINKEDIN_API_ONLY = "LinkedIn actions use your connected LinkedIn account, not the live browser. Ask the LinkedIn agent to prepare a supported post or event; reconnect LinkedIn if needed. Actions not available through the connection can be drafted for you, but Civi will not attempt a browser login.";