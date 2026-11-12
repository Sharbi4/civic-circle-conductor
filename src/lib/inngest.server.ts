import { Inngest } from "inngest";
import { serve } from "inngest/edge";
import { BROWSER_STEPS_PER_WAKE, RUNS_PER_WAKE, SCHEDULER_BACKUP_CRON, SHARED_JOB_EVENT, WAKE_EVENT, type SharedJobKind } from "./background.shared";

// The stable production address: the custom domain can briefly serve an older version after a publish,
// which the background service treats as a hard failure.
const SERVE_ORIGIN = "https://project--41d4b04c-b74e-4751-8d66-ce601cd73b60.lovable.app";
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

  // Scheduler, recovery and daily reports: bookkeeping without the five-second cut-off, then the scheduler
  // and reports wake only the organizations that have waiting work.
  const sharedJob = client.createFunction(
    {
      id: "shared-job",
      name: "Run a shared scheduled job",
      triggers: [{ event: SHARED_JOB_EVENT }, { cron: SCHEDULER_BACKUP_CRON }],
      retries: 0,
      concurrency: [{ limit: 1 }],
    },
    async ({ event, step }) => {
      // The cron trigger is the backup: it runs the scheduler only when the last tick didn't finish.
      const backup = event.name === "inngest/scheduled.timer";
      const kind = (backup ? "scheduler" : String((event.data as { kind?: unknown } | undefined)?.kind ?? "")) as SharedJobKind;
      if (!["scheduler", "recovery", "reports"].includes(kind)) return { skipped: "unknown job" };
      if (backup) {
        const stale = await step.run("check-scheduler", async () => (await import("./background.server")).schedulerIsStale());
        if (!stale) return { skipped: "scheduler is up to date" };
      }
      const bookkeeping = await step.run("bookkeeping", async () => {
        const { runSharedJob } = await import("./jobs.server");
        return runSharedJob(kind);
      });
      if (kind === "recovery") return { bookkeeping };
      const sweep = await step.run("wake-organizations", async () => {
        const { sweepBackgroundWork } = await import("./background.server");
        return sweepBackgroundWork();
      });
      return { bookkeeping, sweep };
    },
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
      // A probe tests a paused organization with one task and no browser steps.
      const probe = (event.data as { probe?: unknown } | undefined)?.probe === true;
      if (probe) {
        const lifted = await step.run("lift-pause", async () => (await bg()).liftPauseForProbe(userId));
        if (!lifted) return { paused: true };
      }
      const ready = await step.run("prepare", async () => (await bg()).prepareOwnerWork(userId));
      if (!ready) return { paused: true };
      let tasks = 0;
      for (let i = 1; i <= (probe ? 1 : RUNS_PER_WAKE); i++) {
        const ran = await step.run(`task-${i}`, async () => (await bg()).runOneOwnerTask(userId));
        if (!ran) break;
        tasks += ran;
      }
      if (probe) return { tasks, probe: true };
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

  return serve({ client, functions: [sharedJob, ownerWork], serveOrigin: SERVE_ORIGIN, servePath: "/api/public/inngest" });
}
