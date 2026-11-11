import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { syncVenueCalls } from "@/lib/calling.server";

const owner = "d0000000-0000-4000-8000-000000000001";
const thread = "d0000000-0000-4000-8000-000000000002";
function fakeDb(options: { owned?: boolean; duplicate?: boolean } = {}) {
  const operations: Array<{ table: string; action: string; value: unknown }> = [];
  const payload = { kind: "venue_call", thread, to: "+15205550123", recipient: "Venue desk", brief: "Check room availability for December 9, 6–8 pm.", agent_id: "agent_test", conversation_id: "conv_test", call_state: "initiated" };
  const db = { from(table: string) {
    let action = "select";
    const chain = {
      select() { return chain; },
      eq(key: string, value: unknown) { operations.push({ table, action: `eq:${key}`, value }); return chain; },
      order() { return chain; }, limit() { return chain; },
      insert(value: unknown) { action = "insert"; operations.push({ table, action, value }); return chain; },
      update(value: unknown) { action = "update"; operations.push({ table, action, value }); return chain; },
      maybeSingle() { return Promise.resolve({ data: options.owned === false ? null : { id: thread }, error: null }); },
      then(resolve: (result: unknown) => unknown) {
        return Promise.resolve({ data: table === "approvals" && action === "select" ? [{ id: owner, payload }] : null, error: table === "messages" && options.duplicate ? { code: "23505" } : null }).then(resolve);
      },
    };
    return chain;
  } } as unknown as SupabaseClient<Database>;
  return { db, operations };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("owner-scoped completed call synchronization", () => {
  it("saves a verified completed conversation to its owning chat without dialing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ agent_id: "agent_test", conversation_id: "conv_test", status: "done", analysis: { transcript_summary: "Room available December 9; quote is $300." } })));
    vi.stubGlobal("fetch", fetcher);
    const { db, operations } = fakeDb();
    expect(await syncVenueCalls(db, owner, thread)).toEqual({ completed: 1, active: 0, unavailable: 0 });
    expect(fetcher).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/convai/conversations/conv_test", expect.objectContaining({ method: "GET" }));
    expect(operations).toContainEqual({ table: "approvals", action: "eq:user_id", value: owner });
    expect(operations).toContainEqual({ table: "threads", action: "eq:user_id", value: owner });
    expect(operations.find((o) => o.table === "messages" && o.action === "insert")?.value).toEqual(expect.objectContaining({ id: owner, user_id: owner, thread_id: thread, content: expect.stringContaining("quote is $300") }));
  });
  it("does not retrieve a call when its chat does not belong to the caller", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await syncVenueCalls(fakeDb({ owned: false }).db, owner, thread)).toEqual({ completed: 0, active: 0, unavailable: 1 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects a provider conversation belonging to a different agent", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ agent_id: "another_agent", conversation_id: "conv_test", status: "done" }))));
    const { db, operations } = fakeDb();
    expect((await syncVenueCalls(db, owner, thread)).unavailable).toBe(1);
    expect(operations.some((o) => o.action === "insert")).toBe(false);
  });
  it("completes a concurrent duplicate report without creating another message", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ agent_id: "agent_test", conversation_id: "conv_test", status: "done" }))));
    const { db, operations } = fakeDb({ duplicate: true });
    expect((await syncVenueCalls(db, owner, thread)).completed).toBe(1);
    expect(operations.find((o) => o.action === "update")?.value).toEqual(expect.objectContaining({ payload: expect.objectContaining({ call_state: "done" }) }));
  });
});