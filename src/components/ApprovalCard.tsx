import { friendlyTimes } from "@/lib/friendlyTimes";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, CalendarCheck, Check, ChevronDown, CreditCard, Facebook, Globe, Linkedin, Loader2, Megaphone, MessageSquare, Phone, Sparkles, Twitter, X } from "lucide-react";
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

function kindMeta(payload: unknown, actionType: string): { Icon: typeof Sparkles; label: string; tile: string } {
  const kind = approvalKind(payload);
  if (kind.startsWith("linkedin_")) return { Icon: Linkedin, label: "LinkedIn", tile: "bg-primary/10 text-primary" };
  if (kind === "x_post") return { Icon: Twitter, label: "X", tile: "bg-accent/10 text-accent" };
  if (kind.startsWith("eventbrite_")) return { Icon: CalendarCheck, label: "Eventbrite", tile: "bg-accent/10 text-accent" };
  if (kind === "venue_call") return { Icon: Phone, label: "Phone call", tile: "bg-primary/10 text-primary" };
  if (kind.startsWith("fb_")) return { Icon: Facebook, label: "Facebook", tile: "bg-primary/10 text-primary" };
  if (kind === "civi_suggestion") return { Icon: Sparkles, label: "Suggestion", tile: "bg-accent/10 text-accent" };
  if (actionType === "payment") return { Icon: CreditCard, label: "Payment", tile: "bg-destructive/10 text-destructive" };
  if (actionType === "booking") return { Icon: CalendarCheck, label: "Booking", tile: "bg-accent/10 text-accent" };
  if (actionType === "outreach") return { Icon: Megaphone, label: "Outreach", tile: "bg-accent/10 text-accent" };
  return { Icon: Globe, label: "Action", tile: "bg-secondary text-muted-foreground" };
}

/** Leading photo for an approval: storage paths are signed; https URLs render directly. */
function ApprovalPhoto({ path, alt, fallback }: { path: string; alt: string; fallback: ReactNode }) {
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
  if (failed) return <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border bg-secondary" aria-hidden>{fallback}</span>;
  if (!url) return <span className="h-14 w-14 animate-pulse rounded-xl bg-muted" aria-hidden />;
  return <img src={url} alt={alt} onError={() => setFailed(true)} className="h-14 w-14 shrink-0 rounded-xl border object-cover" />;
}

/** One compact, consistent approval card — used in the Approvals inbox and the floating chat bar. */
export function ApprovalCard({ approval: a, onIgnore, extra, threadTitle, threadId: threadIdProp }: { approval: ApprovalRow; onIgnore?: (id: string) => void; extra?: ReactNode; threadTitle?: string | undefined; threadId?: string | undefined }) {
  const qc = useQueryClient();
  const runDecision = useServerFn(decideApproval);
  const [busy, setBusy] = useState(false);
  const kind = approvalKind(a.payload);
  const { Icon, label, tile } = kindMeta(a.payload, a.action_type);
  const image = approvalImage(a.payload);
  const pending = a.status === "pending";
  const navigate = useNavigate();
  const chatId = a.thread_id ?? threadIdProp;
  const chatName = threadTitle ?? "Main chat";
  const openChat = () => { if (chatId) navigate({ to: "/chat/$threadId", params: { threadId: chatId } }); };

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
      if (kind.startsWith("fb_")) toast("Queued — waiting for Facebook to finish", { description: `Happening in: ${chatName}`, action: chatId ? { label: "Open chat", onClick: openChat } : undefined });
      else if (kind === "venue_call") toast("Call initiated — not a booking confirmation", { description: `Happening in: ${chatName}`, action: chatId ? { label: "Open chat", onClick: openChat } : undefined });
      else if (a.browser_session_id) {
        const { error } = await supabase.from("browser_sessions").update({ agent_status: "driving", submit_approved: true, active_approval_id: a.id }).eq("id", a.browser_session_id);
        if (error) throw error;
        await supabase.from("approvals").update({ run_state: "running" }).eq("id", a.id);
        toast("Working in the browser", { description: `Happening in: ${chatName}`, action: chatId ? { label: "Open chat", onClick: openChat } : undefined });
      } else if ("ok" in result && result.ok === false) toast.error("Failed — see the chat for details", { description: `Happening in: ${chatName}`, action: chatId ? { label: "Open chat", onClick: openChat } : undefined });
      else if (kind === "eventbrite_create") toast.success("Draft saved on Eventbrite — not published", { description: `Happening in: ${chatName}`, action: chatId ? { label: "Open chat", onClick: openChat } : undefined });
      else if (kind.startsWith("linkedin_") || kind === "x_post") toast.success("Success — confirmed by the service", { description: `Happening in: ${chatName}`, action: chatId ? { label: "Open chat", onClick: openChat } : undefined });
      else toast("Approved", { description: `Happening in: ${chatName}`, action: chatId ? { label: "Open chat", onClick: openChat } : undefined });
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

  /** Card content. Tapping anywhere on it opens the chat where the action happens. */
  const body = (
    <div className="flex items-start gap-3">
      {image ? (
        <ApprovalPhoto path={image} alt={`Photo for ${a.title}`} fallback={<Icon className={`h-7 w-7 ${tile.split(" ")[1] ?? "text-accent"}`} />} />
      ) : (
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl border ${tile}`}><Icon className="h-7 w-7" /></span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 pr-7">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
          {!pending && (
            <span className={`rounded-full bg-secondary px-2 py-0.5 text-[11px] ${a.status === "approved" ? "text-foreground" : "text-muted-foreground line-through"}`}>
              {a.status === "approved" ? approvalStateLabel(a.run_state, a.payload) : a.status}
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug group-hover:text-accent">{a.title}</p>
        {chatId && (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3 w-3 shrink-0" /><span className="shrink-0">{pending ? "Will happen in" : "Happened in"}:</span><span className="min-w-0 truncate font-semibold text-primary">{chatName}</span><ArrowUpRight className="h-3 w-3 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </p>
        )}
        {pending && <p className="mt-0.5 line-clamp-1 text-xs font-medium text-accent">{approvalAction(a.payload, a.action_type)}</p>}
        {a.details && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{friendlyTimes(a.details)}</p>}
        {a.approval_mode === "always" && <p className="mt-1 text-[11px] text-muted-foreground">Always approved for this action and account</p>}
        {a.run_error && <p className="mt-1 text-xs text-destructive">{a.run_error}</p>}
      </div>
    </div>
  );

  return (
    <div className={`group relative rounded-2xl border bg-card p-3 shadow-soft transition-colors ${chatId ? "border-transparent hover:border-accent/50" : ""}`}>
      {chatId ? (
        <Link
          to="/chat/$threadId"
          params={{ threadId: chatId }}
          title={`Open the chat where this happens: ${chatName}`}
          className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {body}
        </Link>
      ) : body}
      {pending && onIgnore && (
        <Button variant="ghost" size="icon" className="absolute right-2 top-2 z-10 h-6 w-6" aria-label={`Ignore ${a.title}`} title="Ignore" disabled={busy} onClick={() => onIgnore(a.id)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
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
