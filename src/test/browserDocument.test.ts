import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ perform: vi.fn(), generateResponse: vi.fn(), readDocumentFacts: vi.fn() }));
vi.mock("@/lib/organizer.server", () => ({ runOrganizer: vi.fn() }));
vi.mock("@/lib/browserAgent.server", () => ({
  withPage: async (_url: string, callback: (page: object) => unknown) => callback({ eval: async () => null }),
  snapshot: async () => ({ url: "https://city.example/forms/room-rental.pdf", title: "", text: "", elements: [], hasPassword: false, contentType: "application/pdf" }),
  perform: mocks.perform,
  parseAction: (text: string) => JSON.parse(text),
}));
vi.mock("@/lib/documentRead.server", () => ({
  eventContext: async () => ({ title: "Meetup", date: "2026-12-09", time: "6–8 p.m.", headcount: 30, venue: null, budget: 300 }),
  readDocumentFacts: mocks.readDocumentFacts,
  fetchDocumentText: async () => null,
}));
vi.mock("@lovable.dev/ai-gateway", () => ({ generateResponse: mocks.generateResponse }));
import { runAgentStep } from "@/lib/browser.server";

describe("the browser reads PDFs it opens", () => {
  it("saves the document's facts and flags a conflict with the event in chat", async () => {
    mocks.readDocumentFacts.mockResolvedValue({ note: "Read PDF https://city.example/forms/room-rental.pdf — Facts: capacity 25; closed Wednesdays", conflicts: ["Closed on Wednesdays — your event is Wednesday, Dec 9."], text: "..." });
    const writes: Array<{ table: string; value: Record<string, unknown> }> = [];
    const row = { id: "session", thread_id: "thread", goal: "Check the Ward 3 room rental rules", status: "running", agent_status: "driving", connect_url: "wss://browser.example", active_approval_id: null, steps: [] };
    const db = { from(table: string) {
      const chain = {
        select: () => chain, eq: () => chain, or: () => chain,
        update: (value: Record<string, unknown>) => { writes.push({ table, value }); return chain; },
        insert: (value: Record<string, unknown>) => { writes.push({ table, value }); return chain; },
        maybeSingle: async () => ({ data: row, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      }; return chain;
    } };
    expect(await runAgentStep(db, "owner", "session")).toEqual({ agentStatus: "driving" });
    expect(mocks.generateResponse).not.toHaveBeenCalled();
    const saved = writes.find((w) => w.table === "browser_sessions" && Array.isArray(w.value["steps"]))?.value["steps"] as { note: string }[];
    expect(saved.at(-1)?.note).toContain("capacity 25");
    const msg = String(writes.find((w) => w.table === "messages")?.value["content"]);
    expect(msg).toContain("Closed on Wednesdays");
  });
});
