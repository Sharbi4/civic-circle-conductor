import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { decideApproval } from "@/lib/approvals.functions";
import { approvalKind } from "@/lib/approvals.shared";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type PendingApproval = {
  id: string;
  title: string;
  details: string;
  payload: unknown;
  browser_session_id: string | null;
};

/** Floating approve/decline bar pinned above the composer of the chat an approval came from. */
export function PendingApprovalsBar({ threadId }: { threadId: string }) {
  const qc = useQueryClient();
  const runDecision = useServerFn(decideApproval);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = useQuery({
    queryKey: ["approvals", "thread", threadId],
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approvals")
        .select("id, title, details, payload, browser_session_id")
        .eq("thread_id", threadId)
        .eq("status", "pending")
        .order("created_at");
      if (error) throw error;
      return data as PendingApproval[];
    },
  });

  async function respond(a: PendingApproval, decision: "approved" | "declined", mode: "once" | "always" = "once") {
    if (busyId) return;
    setBusyId(a.id);
    try {
      if (decision === "declined") {
        const { error } = await supabase.from("approvals").update({ status: "declined", resolved_at: new Date().toISOString() }).eq("id", a.id).eq("status", "pending");
        if (error) throw error;
        toast("Declined — no action will be taken");
        return;
      }
      const result = await runDecision({ data: { approvalId: a.id, mode } });
      const kind = approvalKind(a.payload);
      if (kind.startsWith("fb_")) {
        toast("Queued — waiting for Facebook to finish");
      } else if (kind === "venue_call") {
        toast("Call initiated — not a booking confirmation");
      } else if (a.browser_session_id) {
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
      setBusyId(null);
    }
  }

  const items = pending.data ?? [];
  if (items.length === 0) return null;

  return (
    <div className="mx-auto mb-3 max-w-3xl space-y-2" role="region" aria-label="Approvals waiting in this chat">
      {items.map((a) => (
        <div key={a.id} className="rounded-2xl border bg-card p-3 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{a.title}</p>
              {a.details && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.details}</p>}
            </div>
            {busyId === a.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Working" />}
          </div>
          <div className="mt-2 flex gap-2">
            <div className="flex items-center">
              <Button type="button" size="sm" disabled={busyId !== null} onClick={() => respond(a, "approved")} className="rounded-l-full rounded-r-none">
                <Check className="h-4 w-4" /> Approve
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" disabled={busyId !== null} className="rounded-l-none rounded-r-full border-l border-primary-foreground/30 px-2" aria-label={`Approval options for ${a.title}`}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => respond(a, "approved", "once")}>Approve one time</DropdownMenuItem>
                  <DropdownMenuItem disabled={!approvalKind(a.payload)} onSelect={() => respond(a, "approved", "always")}>Always approve this action</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={busyId !== null} onClick={() => respond(a, "declined")} className="rounded-full">
              <X className="h-4 w-4" /> Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
