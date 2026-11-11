import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ perform: vi.fn(), generateResponse: vi.fn(), runOrganizer: vi.fn() }));
vi.mock("@/lib/organizer.server", () => ({ runOrganizer: mocks.runOrganizer }));
vi.mock("@/lib/browserAgent.server", () => ({
  withPage: async (_url: string, callback: (page: object) => unknown) => callback({}),
  snapshot: async () => ({ url: "https://venue.example/contact", hasPassword: false, text: "Booking desk: +15205550123. Availability requires an inquiry." }),
  perform: mocks.perform,
  parseAction: (text: string) => JSON.parse(text),
}));
vi.mock("@lovable.dev/ai-gateway", () => ({ generateResponse: mocks.generateResponse }));
import { runAgentStep } from "@/lib/browser.server";

describe("proactive research checkpoint", () => {
  it("posts a next-step report at 25 steps without performing further navigation or claiming approved success", async () => {
    mocks.generateResponse.mockResolvedValue({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ action: "navigate", url: "https://venue.example" }) }] }] });
    const writes: Array<{ table: string; value: Record<string, unknown> }> = [];
    const row = { id: "session", thread_id: "thread", goal: "Research meeting room availability", status: "running", agent_status: "driving", connect_url: "wss://browser.example", active_approval_id: "approval", steps: Array.from({ length: 25 }, () => ({ action: "navigate", note: "Reviewed venue page" })) };
    const db = { from(table: string) {
      const chain = {
        select: () => chain, eq: () => chain, or: () => chain,
        update: (value: Record<string, unknown>) => { writes.push({ table, value }); return chain; },
        insert: (value: Record<string, unknown>) => { writes.push({ table, value }); return chain; },
        maybeSingle: async () => ({ data: row, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      }; return chain;
    } };
    expect(await runAgentStep(db, "owner", "session")).toEqual({ agentStatus: "done" });
    expect(mocks.perform).not.toHaveBeenCalled();
    const message = writes.find((w) => w.table === "messages")?.value["content"];
    expect(message).toContain("Find booking contact");
    expect(message).not.toContain("Take over");
    expect(writes.some((w) => w.table === "approvals" && w.value["run_state"] === "succeeded")).toBe(false);
    expect(writes.some((w) => w.table === "approvals" && w.value["run_state"] === "needs_review")).toBe(true);
    expect(mocks.runOrganizer).toHaveBeenCalledOnce();
    const followUp = mocks.runOrganizer.mock.calls[0]?.[2] as { threadId: string; content: string };
    expect(followUp.threadId).toBe("thread");
    expect(followUp.content).toContain("venue_call");
    expect(followUp.content).toContain("Do not place a call without approval");
  });

  it("does not invoke the call follow-up when availability was confirmed online", async () => {
    mocks.runOrganizer.mockClear();
    mocks.generateResponse.mockResolvedValue({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ action: "done", summary: "The room is available on December 9; the reservation confirmed page shows reference ABC-123." }) }] }] });
    const row = { id: "session", thread_id: "thread", goal: "Check venue availability", status: "running", agent_status: "driving", connect_url: "wss://browser.example", active_approval_id: null, steps: [] };
    const db = { from() {
      const chain = {
        select: () => chain, eq: () => chain, or: () => chain,
        update: () => chain, insert: () => chain,
        maybeSingle: async () => ({ data: row, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      }; return chain;
    } };
    expect(await runAgentStep(db, "owner", "session")).toEqual({ agentStatus: "done" });
    expect(mocks.runOrganizer).not.toHaveBeenCalled();
  });
});