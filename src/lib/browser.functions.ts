import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/udc_browserbase";

type SupabaseLike = {
  from: (table: string) => any;
};

async function bbRequest(
  path: string,
  init: RequestInit,
  lovableKey: string,
  connKey: string,
) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Browserbase request failed [${res.status}]: ${body}`);
    throw new Error(`Browser service error [${res.status}]`);
  }
  return res.json();
}

/**
 * Opens a real cloud browser session, stores it and returns the row.
 * Called from server-function handlers only — keys are read in the handler.
 */
export async function openBrowserSession(opts: {
  supabase: SupabaseLike;
  userId: string;
  threadId: string;
  task: string;
  lovableKey: string;
  connKey: string;
}) {
  const { supabase, userId, threadId, task, lovableKey, connKey } = opts;

  const session = await bbRequest(
    "/v1/sessions",
    { method: "POST", body: JSON.stringify({ timeout: 3600 }) },
    lovableKey,
    connKey,
  );
  const debug = await bbRequest(
    `/v1/sessions/${session.id}/debug`,
    { method: "GET" },
    lovableKey,
    connKey,
  );

  const { data: row, error } = await supabase
    .from("browser_sessions")
    .insert({
      user_id: userId,
      thread_id: threadId,
      task,
      session_id: session.id,
      live_url: debug.debuggerFullscreenUrl,
      status: "running",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string, sessionId: session.id as string };
}

export const startBrowserSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ threadId: z.string().uuid(), task: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const connKey = process.env["UDC_BROWSERBASE_API_KEY"];
    if (!lovableKey || !connKey) throw new Error("The browser service is not connected yet.");

    const { data: thread, error: tErr } = await supabase
      .from("threads").select("id").eq("id", data.threadId).maybeSingle();
    if (tErr || !thread) throw new Error("Chat not found");

    const { id } = await openBrowserSession({
      supabase, userId, threadId: data.threadId, task: data.task, lovableKey, connKey,
    });

    await supabase.from("messages").insert({
      thread_id: data.threadId,
      user_id: userId,
      role: "assistant",
      content: `I've opened a live browser to work on: **${data.task}**. Watch it below — you can click into it and take over anytime.\n\n[[browser: ${id} | ${data.task}]]`,
    });

    return { id };
  });

export const endBrowserSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionRowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const connKey = process.env["UDC_BROWSERBASE_API_KEY"];

    const { data: row, error } = await supabase
      .from("browser_sessions")
      .select("id, session_id, status")
      .eq("id", data.sessionRowId)
      .maybeSingle();
    if (error || !row) throw new Error("Browser session not found");

    if (row.status === "running" && lovableKey && connKey) {
      try {
        const session = await bbRequest(
          `/v1/sessions/${row.session_id}`,
          { method: "GET" },
          lovableKey,
          connKey,
        );
        await bbRequest(
          `/v1/sessions/${row.session_id}`,
          {
            method: "PUT",
            body: JSON.stringify({ projectId: session.projectId, status: "REQUEST_RELEASE" }),
          },
          lovableKey,
          connKey,
        );
      } catch {
        // Best effort — sessions also expire on their own.
      }
    }

    const { error: upErr } = await supabase
      .from("browser_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.sessionRowId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });
