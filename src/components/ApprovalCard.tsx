import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, CalendarCheck, Check, ChevronDown, Facebook, Globe, Linkedin, Loader2, Megaphone, Phone, Sparkles, Twitter, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { decideApproval } from "@/lib/approvals.functions";
import { approvalAction, approvalImage, approvalKind, approvalStateLabel } from "@/lib/approvals.shared";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type ApprovalRow = {
  id: string;
  action_type: string;
  title: string;
  details: string | null;
  payload: unknown;
  status: string;
  run_state: string | null;
  run_error: string | null;
  browser_session_id: string | null;
  approval_mode?: string | null;
  thread_id?: string | null;
};

function kindMeta(payload: unknown, actionType: string): { Icon: typeof Sparkles; label: string } {
  const kind = approvalKind(payload);
  if (kind.startsWith("linkedin_")) return { Icon: Linkedin, label: "LinkedIn" };
  if (kind === "x_post") return { Icon: Twitter, label: "X" };
  if (kind.startsWith("eventbrite_")) return { Icon: CalendarCheck, label: "Eventbrite" };
  if (kind === "venue_call") return { Icon: Phone, label: "Phone call" };
  if (kind.startsWith("fb_")) return { Icon: Facebook, label: "Facebook" };
  if (kind === "civi_suggestion") return { Icon: Sparkles, label: "Suggestion" };
  if (actionType === "payment") return { Icon: Sparkles, label: "Payment" };
  if (actionType === "booking") return { Icon: CalendarCheck, label: "Booking" };
  if (actionType === "outreach") return { Icon: Megaphone, label: "Outreach" };
  return { Icon: Globe, label: "Action" };
}

/** Leading photo for an approval: storage paths are signed; https URLs render directly. */
function ApprovalPhoto({ path, alt }: { path: string; alt: string }) {
  const isHttp = /^https:\/\//.test(path);
  const signed = useQuery({
    queryKey: ["event-image", path],
    enabled: !isHttp,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user.id || !path.startsWith(`${session.session.user.id}/`)) return null;
      const { data, error } = await supabase.storage.from("event-images").createSignedUrl(path, 3600);
      if (error) return null;
      return data.signedUrl;
    },
  });
  const url = isHttp ? path : signed.data;
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border bg-secondary" aria-hidden><Sparkles className="h-6 w-6 text-accent" /></span>;
  if (!url) return <span className="h-14 w-14 animate-pulse rounded-xl bg-muted" aria-hidden />;
  return <img src={url} alt={alt} onError={() => setFailed(true)} className="h-14 w-14 shrink-0 rounded-xl border object-cover" />;
}

/** One compact, consistent approval card — used in the Approvals inbox and the floating chat bar. */
export function ApprovalCard({ approval: a, onIgnore, extra, threadTitle }: { approval: ApprovalRow; onIgnore?: (id: string) => void; extra?: ReactNode; threadTitle?: string | undefined }) {
  const qc = useQueryClient();
  const runDecision = useServerFn(decideApproval);
  const [busy, setBusy] = useState(false);
  const kind = approvalKind(a.payload);
  const { Icon, label } = kindMeta(a.payload, a.action_type);
  const image = approvalImage(a.payload);
  const pending = a.status === "pending";

  async function respond(decision: "approved" | "declined", mode: "once" | "always" = "once") {
    if (busy) return;
    setBusy(true);
    try {
      if (decision === "declined") {
        const { error } = await supabase.from("approvals").update({ status: "declined", resolved_at: new Date().toISOString() }).eq("id", a.id).eq("status", "pending");
        if (error) throw error;
        toast("Declined — no action will be taken");
        return;
      }
      const result = await runDecision({ data: { approvalId: a.id, mode } });
      if (kind.startsWith("fb_")) toast("Queued — waiting for Facebook to finish");
      else if (kind === "venue_call") toast("Call initiated — not a booking confirmation");
      else if (a.browser_session_id) {
        const { error } = await supabase.from("browser_sessions").update({ agent_status: "driving", submit_approved: true, active_approval_id: a.id }).eq("id", a.browser_session_id);
        if (error) throw error;
        await supabase.from("approvals").update({ run_state: "running" }).eq("id", a.id);
        toast("Working in the browser");
      } else if ("ok" in result && result.ok === false) toast.error("Failed — see the chat for details");
      else if (kind === "eventbrite_create") toast.success("Draft saved on Eventbrite — not published");
      else if (kind.startsWith("linkedin_") || kind === "x_post") toast.success("Success — confirmed by the service");
      else toast("Approved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't complete this action");
    } finally {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["approvals"] }),
        qc.invalidateQueries({ queryKey: ["messages"] }),
        qc.invalidateQueries({ queryKey: ["approval_preferences"] }),
        qc.invalidateQueries({ queryKey: ["browser_session"] }),
      ]);
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-3 shadow-soft">
      <div className="flex items-start gap-3">
        {image ? (
          <ApprovalPhoto path={image} alt={`Photo for ${a.title}`} />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border bg-secondary"><Icon className="h-6 w-6 text-accent" /></span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
            {!pending && (
              <span className={`rounded-full bg-secondary px-2 py-0.5 text-[11px] ${a.status === "approved" ? "text-foreground" : "text-muted-foreground line-through"}`}>
                {a.status === "approved" ? approvalStateLabel(a.run_state, a.payload) : a.status}
              </span>
            )}
            {a.thread_id && threadTitle && (
              <Link
                to="/chat/$threadId"
                params={{ threadId: a.thread_id }}
                className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-accent hover:underline"
                title={`Open chat: ${threadTitle}`}
              >
                {threadTitle} <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
            {pending && onIgnore && (
              <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" aria-label={`Ignore ${a.title}`} title="Ignore" disabled={busy} onClick={() => onIgnore(a.id)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">{a.title}</p>
          {pending && <p className="mt-0.5 line-clamp-1 text-xs font-medium text-accent">{approvalAction(a.payload, a.action_type)}</p>}
          {a.details && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.details}</p>}
          {a.approval_mode === "always" && <p className="mt-1 text-[11px] text-muted-foreground">Always approved for this action and account</p>}
          {a.run_error && <p className="mt-1 text-xs text-destructive">{a.run_error}</p>}
        </div>
      </div>
      {extra}
      {busy && (
        <p role="status" className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />{kind.includes("post") ? "Posting…" : "Working…"}
        </p>
      )}
      {pending && (
        <div className="mt-2.5 flex gap-2">
          <div className="flex items-center">
            <Button type="button" size="sm" disabled={busy} onClick={() => respond("approved")} className="rounded-l-full rounded-r-none">
              <Check className="h-4 w-4" /> Approve
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" disabled={busy} className="rounded-l-none rounded-r-full border-l border-primary-foreground/30 px-2" aria-label={`Approval options for ${a.title}`}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => respond("approved", "once")}>Approve one time</DropdownMenuItem>
                <DropdownMenuItem disabled={!kind} onSelect={() => respond("approved", "always")}>Always approve this action</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => respond("declined")} className="rounded-full">
            <X className="h-4 w-4" /> Decline
          </Button>
        </div>
      )}
    </div>
  );
}
