import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { scopedDb } from "./scopedDb.server";
import { SHARED_JOB_EVENT, WAKE_EVENT, browserIsUnattended, ownersToWake, sharedJobEventId, wakeEventId, type SharedJobKind } from "./background.shared";

type Db = SupabaseClient<Database>;
const GATEWAY_URL = "https://connector-gateway.lovable.dev/inngest";

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function isPaused(db: Db, userId: string): Promise<boolean> {
  const { data } = await db.from("autopilot_state").select("paused_reason").eq("user_id", userId).maybeSingle();
  return !!data?.paused_reason;
}

/** Sends wake events to the background job service. Event ids make repeats in the same slot harmless. */
export async function sendBackgroundEvents(events: { id: string; name: string; data: Record<string, unknown> }[]): Promise<number> {
  if (!events.length) return 0;
  const lovableKey = process.env['LOVABLE_API_KEY'];
  const connectionKey = process.env['INNGEST_API_KEY'];
  if (!lovableKey || !connectionKey) throw new Error("Background job service is not connected");
  const res = await fetch(`${GATEWAY_URL}/e/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" },
    body: JSON.stringify(events),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Background wake failed [${res.status}]: ${body.slice(0, 300)}`);
    throw new Error(`Background wake failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  return events.length;
}

/**
 * Called by the managed schedules, whose HTTP call hangs up after about five seconds: hands the job to the
 * background service and answers at once. If the service can't be reached, runs the job inline as before.
 */
export async function startSharedJob(kind: SharedJobKind) {
  try {
    await sendBackgroundEvents([{ id: sharedJobEventId(kind), name: SHARED_JOB_EVENT, data: { kind } }]);
    return { ok: true, handedOff: true };
  } catch (e) {
    console.error("Background hand-off failed, running inline", e instanceof Error ? e.message : e);
    const { runSharedJob } = await import("./jobs.server");
    return runSharedJob(kind);
  }
}

/**
 * The sweep: close quiet planning reviews without AI, then wake only organizations that have
 * queued work or a browser task nobody is watching. Organizations with nothing waiting cost nothing.
 */
export async function sweepBackgroundWork(): Promise<{ settled: number; woken: number }> {
  const db = await admin();
  const { error: enqueueError } = await db.rpc("enqueue_due_agent_tasks");
  if (enqueueError) throw new Error("Could not enqueue due work");
  const { data: settled, error: settleError } = await db.rpc("settle_quiet_reviews");
  if (settleError) console.error("Quiet review check failed", settleError.message);
  const [queued, browsers, paused] = await Promise.all([
    db.from("agent_task_runs").select("user_id").eq("status", "queued").lt("attempt", 3).order("created_at").limit(500),
    db.from("browser_sessions").select("user_id, driver_lease, last_step_at").eq("status", "running").eq("agent_status", "driving").limit(200),
    db.from("autopilot_state").select("user_id").not("paused_reason", "is", null).limit(1000),
  ]);
  const owners = ownersToWake({
    queued: (queued.data ?? []).map((r) => r.user_id),
    browsers: (browsers.data ?? []).filter((b) => browserIsUnattended(b)).map((b) => b.user_id),
    paused: (paused.data ?? []).map((r) => r.user_id),
  });
  const now = Date.now();
  const woken = await sendBackgroundEvents(owners.map((userId) => ({ id: wakeEventId(userId, now), name: WAKE_EVENT, data: { userId } })));
  return { settled: Number(settled ?? 0), woken };
}

/** Moves the organization's event plans forward and queues due work. False when its background work is paused. */
export async function prepareOwnerWork(userId: string): Promise<boolean> {
  const db = await admin();
  if (await isPaused(db, userId)) return false;
  try { const { advanceEventPlans } = await import("./eventPlan.server"); await advanceEventPlans(db, userId); }
  catch (e) { console.error("Event plan scan failed", e instanceof Error ? e.message : e); }
  const { error } = await db.rpc("enqueue_due_agent_tasks");
  if (error) throw new Error("Could not enqueue due work");
  return true;
}

/** Runs at most one queued task for the organization; returns how many ran (0 or 1). */
export async function runOneOwnerTask(userId: string): Promise<number> {
  const db = await admin();
  const { processQueuedRuns } = await import("./jobs.server");
  return processQueuedRuns(db, "scheduler", 1, userId);
}

/** The organization's driving browser that no open chat is stepping, if any. */
export async function findUnattendedBrowser(userId: string): Promise<string | null> {
  const db = await admin();
  if (await isPaused(db, userId)) return null;
  const { data } = await db.from("browser_sessions").select("id, driver_lease, last_step_at")
    .eq("user_id", userId).eq("status", "running").eq("agent_status", "driving").order("created_at").limit(5);
  return (data ?? []).find((b) => browserIsUnattended(b))?.id ?? null;
}

/** One browser step for the organization; the session's own lease keeps it to one driver at a time. */
export async function driveBrowserOnce(userId: string, sessionId: string): Promise<string | null> {
  const db = await admin();
  if (await isPaused(db, userId)) return "paused";
  const { runAgentStep } = await import("./browser.server");
  const { agentStatus } = await runAgentStep(scopedDb(db, userId), userId, sessionId);
  return agentStatus;
}
