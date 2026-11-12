import type { ReactNode, SyntheticEvent } from "react";
import { noLongDashes } from "@/lib/punctuation.shared";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Check, Copy, ExternalLink, Hourglass, Loader2, MessageCircle, Minus, PauseCircle, RotateCcw } from "lucide-react";
import { stepInfo } from "@/lib/eventSteps.shared";
import { stepDisplay, STEP_ACTION_LABEL, type StepAction } from "@/lib/stepStatus.shared";
import { skipDraft, stepDef } from "@/lib/eventPlan.shared";
import { restartPlanStep } from "@/lib/eventPlan.functions";

export type PlanStep = {
  id: string; title: string; done: boolean; step_key?: string | null; step_state?: string | null;
  step_note?: string | null; result_url?: string | null; last_error?: string | null; thread_id?: string | null;
};
export type StepEvent = { title: string; date: string | null; location: string; link: string | null };

/** One event-plan step: its state, what it's waiting for, what went out, and what you can do about it. */
export function StepStatus({ s, active = false, compact = false, event }: { s: PlanStep; active?: boolean; compact?: boolean; event?: StepEvent }) {
  const state = s.step_state ?? (s.done ? "done" : active ? "running" : "waiting");
  const shown = stepDisplay(state, s.done, s.step_note);
  if (shown.text) shown.text = noLongDashes(shown.text);
  const info = stepInfo(s.title, s.step_key);
  let icon: ReactNode = null;
  let dot = "bg-secondary";
  if (shown.tone === "skipped") { icon = <Minus className="h-2.5 w-2.5" />; dot = "bg-muted text-muted-foreground"; }
  else if (shown.tone === "done") { icon = <Check className="h-2.5 w-2.5" />; dot = "bg-primary text-primary-foreground"; }
  else if (shown.tone === "working") { icon = <Loader2 className="h-2.5 w-2.5 animate-spin" />; dot = "bg-primary/15 text-primary"; }
  else if (shown.tone === "approval") { icon = <Hourglass className="h-2.5 w-2.5" />; dot = "bg-primary/15 text-primary"; }
  else if (shown.tone === "waiting") { icon = state === "on_hold" ? <PauseCircle className="h-2.5 w-2.5" /> : <MessageCircle className="h-2.5 w-2.5" />; dot = "bg-accent text-accent-foreground"; }
  else if (shown.tone === "attention") { icon = <AlertCircle className="h-2.5 w-2.5" />; dot = "bg-warning/20 text-warning-foreground"; }
  const text = compact ? "text-[13px]" : "text-sm";
  const small = compact ? "text-[11px]" : "text-xs";
  const lineTone = shown.tone === "attention" ? "font-medium text-warning-foreground" : shown.tone === "approval" ? "font-medium text-primary" : "text-muted-foreground";
  const def = stepDef(s.step_key);
  const draft = shown.actions.includes("copy_draft") && def && event ? skipDraft(def, event) : null;
  const actions = shown.actions.filter((a) => (a === "copy_draft" ? !!draft : a === "open_chat" ? !!s.thread_id : true));
  return (
    <>
      <span aria-label={shown.text ?? (s.done ? "Done" : "Not started")} className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${dot}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block leading-snug ${text} ${s.done ? "text-muted-foreground" : ""} ${shown.tone === "skipped" ? "line-through decoration-muted-foreground/40" : ""}`}>{s.title}</span>
        {!s.done && info && <span className={`block leading-snug text-muted-foreground ${small}`}>{info}</span>}
        {shown.text && <span className={`block leading-snug ${small} ${lineTone}`}>{shown.text}</span>}
        {(s.result_url || actions.length > 0) && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {s.result_url && (
              <a href={s.result_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={`inline-flex items-center gap-1 font-medium text-primary hover:underline ${small}`}>
                View <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {actions.map((a) => <StepActionButton key={a} action={a} step={s} draft={draft} small={small} />)}
          </span>
        )}
      </span>
    </>
  );
}

function StepActionButton({ action, step, draft, small }: { action: StepAction; step: PlanStep; draft: string | null; small: string }) {
  const restart = useServerFn(restartPlanStep);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const cls = `inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium transition hover:bg-secondary disabled:opacity-60 ${small}`;
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  if (action === "open_chat") {
    return (
      <Link to="/chat/$threadId" params={{ threadId: step.thread_id! }} onClick={stop} className={cls}>
        <MessageCircle className="h-3 w-3" /> {STEP_ACTION_LABEL.open_chat}
      </Link>
    );
  }
  if (action === "copy_draft") {
    return (
      <button type="button" className={cls} onClick={async (e) => { stop(e); try { await navigator.clipboard.writeText(draft ?? ""); toast.success("Draft copied, paste it into the app"); } catch { toast.error("Couldn't copy, open the event chat to copy it"); } }}>
        <Copy className="h-3 w-3" /> {STEP_ACTION_LABEL.copy_draft}
      </button>
    );
  }
  return (
    <button type="button" disabled={busy} className={cls} onClick={async (e) => {
      stop(e);
      setBusy(true);
      const refresh = () => qc.invalidateQueries({ predicate: (q) => ["event-page", "tasks", "messages", "goal-steps"].includes(String(q.queryKey[0])) });
      const started = restart({ data: { taskId: step.id, mode: action } });
      setTimeout(() => void refresh(), 800);
      try { await started; toast.success(action === "another" ? "Civi is working on another option" : "Civi is back on this step"); }
      catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't restart this step"); }
      finally { setBusy(false); void refresh(); }
    }}>
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} {STEP_ACTION_LABEL[action]}
    </button>
  );
}
