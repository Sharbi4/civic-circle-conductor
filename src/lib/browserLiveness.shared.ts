/** Whether a cloud browser is still open, decided from the provider's answer. */
export type BrowserLiveness = "alive" | "closed" | "unknown";

const CLOSED_STATUSES = new Set(["COMPLETED", "TIMED_OUT", "ERROR"]);

/**
 * Maps a Browserbase GET /v1/sessions/{id} result to liveness.
 * httpStatus null means the provider could not be reached; that never ends a session.
 */
export function browserLivenessFrom(httpStatus: number | null, providerStatus?: unknown): BrowserLiveness {
  if (httpStatus === 404) return "closed";
  if (httpStatus === null || httpStatus < 200 || httpStatus >= 300) return "unknown";
  const s = typeof providerStatus === "string" ? providerStatus.toUpperCase() : "";
  if (s === "RUNNING") return "alive";
  if (CLOSED_STATUSES.has(s)) return "closed";
  return "unknown";
}

export type BrowserRowView = { status?: string | null; live_url?: string | null; agent_status?: string | null };

/**
 * The live debugger iframe is only shown for a running row that hasn't failed and that the provider hasn't reported closed.
 * `undefined` means the first check hasn't answered yet: wait for it rather than flash a dead debugger page.
 */
export function showLiveBrowser(row: BrowserRowView | null | undefined, check: BrowserLiveness | undefined): boolean {
  if (!row || row.status !== "running" || !row.live_url) return false;
  if (row.agent_status === "failed") return false;
  return check === "alive" || check === "unknown";
}

/** A running row whose first provider check is still in flight. */
export function awaitingBrowserCheck(row: BrowserRowView | null | undefined, check: BrowserLiveness | undefined): boolean {
  return !!row && row.status === "running" && !!row.live_url && row.agent_status !== "failed" && check === undefined;
}

export const BROWSER_CLOSED_AFTER_FAILURE =
  "The browser closed while Civi was working. Everything it found so far is saved in this chat, ask Civi to pick it back up.";
export const BROWSER_CLOSED = "This browser session has closed. Everything Civi found is saved in this chat.";

/** Friendly text shown in place of the live view once the browser is gone. */
export function closedBrowserMessage(agentStatus: string | null | undefined): string {
  return agentStatus === "failed" ? BROWSER_CLOSED_AFTER_FAILURE : BROWSER_CLOSED;
}

/** Handoff shown when a browser action was cut off partway; Civi never replays it on its own. */
export const BROWSER_PAUSED = "Civi paused so you can check the page before it continues.";
/** Older rows saved the technical wording; show them the plain one. */
export function handoffText(reason: string | null | undefined): string {
  if (!reason) return "Civi needs you in the browser.";
  return /^Interrupted browser action/.test(reason) ? BROWSER_PAUSED : reason;
}
