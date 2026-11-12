import { Inngest } from "inngest";
import { serve } from "inngest/edge";
import { BROWSER_STEPS_PER_WAKE, RUNS_PER_WAKE, SWEEP_CRON, WAKE_EVENT } from "./background.shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Background job service functions. Built per request so keys are read from the Worker env.
 * No automatic retries: a step that fails partway may already have done work, so it goes to
 * review (recovery job) instead of being replayed. Checkpointing is off so every step gets its own request.
 */
export function inngestHandler() {
  const signingKey = process.env['INNGEST_SIGNING_KEY'];
  if (!signingKey) throw new Error("Background job service is not connected");
  const client = new Inngest({ id: "civi-meet", isDev: false, checkpointing: false, signingKey });

  const sweep = client.createFunction(
    { id: "background-sweep", name: "Find organizations with waiting work", triggers: [{ cron: SWEEP_CRON }], retries: 0, concurrency: { limit: 1 } },
    async ({ step }) => step.run("wake-organizations", async () => {
      const { sweepBackgroundWork } = await import("./background.server");
      return sweepBackgroundWork();
    }),
  );

  const ownerWork = client.createFunction(
    {
      id: "owner-background-work",
      name: "Keep one organization's work moving",
      triggers: [{ event: WAKE_EVENT }],
      retries: 0,
      concurrency: [{ key: "event.data.userId", limit: 1 }, { limit: 5 }],
    },
    async ({ event, step }) => {
      const userId = String((event.data as { userId?: unknown } | undefined)?.userId ?? "");
      if (!UUID.test(userId)) return { skipped: "unknown organization" };
      const bg = () => import("./background.server");
      const ready = await step.run("prepare", async () => (await bg()).prepareOwnerWork(userId));
      if (!ready) return { paused: true };
      let tasks = 0;
      for (let i = 1; i <= RUNS_PER_WAKE; i++) {
        const ran = await step.run(`task-${i}`, async () => (await bg()).runOneOwnerTask(userId));
        if (!ran) break;
        tasks += ran;
      }
      const sessionId = await step.run("find-browser", async () => (await bg()).findUnattendedBrowser(userId));
      let browserSteps = 0;
      if (sessionId) {
        for (let i = 1; i <= BROWSER_STEPS_PER_WAKE; i++) {
          const status = await step.run(`browser-${i}`, async () => (await bg()).driveBrowserOnce(userId, sessionId));
          browserSteps++;
          if (status !== "driving") break;
        }
      }
      return { tasks, browserSteps };
    },
  );

  return serve({ client, functions: [sweep, ownerWork] });
}
