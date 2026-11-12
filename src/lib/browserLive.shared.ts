// Decides when the live browser view is safe to show. The provider's debugger page turns into a raw
// "WebSocket disconnected" error once the cloud browser behind it closes, so the chat must stop
// embedding it as soon as the session is gone — even if our row still says "running".

export type BrowserRowLike = {
  status?: string | null;
  live_url?: string | null;
  agent_status?: string | null;
};

/** Provider session statuses that mean the browser is still open. Anything else (COMPLETED, TIMED_OUT, ERROR) is gone. */
export function providerSessionAlive(providerStatus: string | null | undefined): boolean {
  return (providerStatus ?? "").toUpperCase() === "RUNNING";
}

/** Show the embedded live view only for an open session the agent hasn't lost, and only while the provider still has it. */
export function showLiveFrame(
  row: BrowserRowLike | null | undefined,
  providerAlive: boolean | null | undefined,
): boolean {
  if (!row || row.status !== "running" || !row.live_url) return false;
  if (row.agent_status === "failed") return false;
  return providerAlive !== false;
}

/** Friendly copy for a browser card whose session is over. */
export function endedBrowserMessage(agentStatus: string | null | undefined): string {
  if (agentStatus === "failed")
    return "The browser closed while Civi was working. Everything it found so far is saved in this chat — ask Civi to pick it back up.";
  return "This browser session has closed. Everything Civi found is saved in this chat.";
}
