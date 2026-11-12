import type { ReactNode } from "react";
import { AlertCircle, Check, ExternalLink, Loader2, MessageCircle, Minus, Scale } from "lucide-react";
import { stepInfo, stepStateLabel } from "@/lib/eventSteps.shared";

export type PlanStep = {
  id: string; title: string; done: boolean; step_key?: string | null; step_state?: string | null;
  step_note?: string | null; result_url?: string | null; last_error?: string | null;
};

/** One event-plan step: its state icon, what it's waiting for, and a link to what went out. */
export function StepStatus({ s, active = false, compact = false }: { s: PlanStep; active?: boolean; compact?: boolean }) {
  const state = s.step_state ?? (s.done ? "done" : active ? "running" : "waiting");
  const skipped = state === "skipped";
  const note0 = s.step_note && s.step_note !== stepStateLabel(state, s.done) ? s.step_note : null;
  // "Waiting on a reply · Waiting to hear back…" says the same thing twice; the specific note is enough.
  const label = state === "awaiting_reply" && note0 ? null : stepStateLabel(state, s.done);
  const note = note0;
  const info = stepInfo(s.title, s.step_key);
  let icon: ReactNode = null;
  let tone = "bg-secondary";
  if (skipped) { icon = <Minus className="h-2.5 w-2.5" />; tone = "bg-muted text-muted-foreground"; }
  else if (s.done) { icon = <Check className="h-2.5 w-2.5" />; tone = "bg-primary text-primary-foreground"; }
  else if (state === "running" || state === "ready") { icon = <Loader2 className="h-2.5 w-2.5 animate-spin" />; tone = "bg-primary/15 text-primary"; }
  else if (state === "awaiting_approval") { icon = <Scale className="h-2.5 w-2.5" />; tone = "bg-primary/15 text-primary"; }
  else if (state === "awaiting_reply") { icon = <MessageCircle className="h-2.5 w-2.5" />; tone = "bg-accent/20 text-accent-foreground"; }
  else if (state === "failed") { icon = <AlertCircle className="h-2.5 w-2.5" />; tone = "bg-destructive/15 text-destructive"; }
  const text = compact ? "text-[13px]" : "text-sm";
  const small = compact ? "text-[11px]" : "text-xs";
  return (
    <>
      <span aria-label={label ?? (s.done ? "Done" : "Not started")} className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${tone}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block leading-snug ${text} ${s.done ? "text-muted-foreground" : ""} ${skipped ? "line-through decoration-muted-foreground/40" : ""}`}>{s.title}</span>
        {!s.done && info && <span className={`block leading-snug text-muted-foreground ${small}`}>{info}</span>}
        {(label || note) && (
          <span className={`block leading-snug ${small} ${state === "failed" ? "text-destructive" : state === "awaiting_approval" ? "font-medium text-primary" : "text-muted-foreground"}`}>
            {[label, note].filter(Boolean).join(" · ")}
          </span>
        )}
        {state === "failed" && !note && s.last_error && <span className={`block text-destructive ${small}`}>{s.last_error}</span>}
        {s.result_url && (
          <a href={s.result_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={`inline-flex items-center gap-1 font-medium text-primary hover:underline ${small}`}>
            View <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </span>
    </>
  );
}
