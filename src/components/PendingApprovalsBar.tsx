import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ApprovalCard, type ApprovalRow } from "@/components/ApprovalCard";

/** Floating approve/decline bar pinned above the composer of the chat an approval came from. */
export function PendingApprovalsBar({ threadId }: { threadId: string }) {
  const pending = useQuery({
    queryKey: ["approvals", "thread", threadId],
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approvals")
        .select("id, action_type, title, details, payload, status, run_state, run_error, browser_session_id, approval_mode")
        .eq("thread_id", threadId)
        .eq("status", "pending")
        .order("created_at");
      if (error) throw error;
      return data as ApprovalRow[];
    },
  });

  const items = pending.data ?? [];
  if (items.length === 0) return null;

  return (
    <div className="mx-auto mb-3 max-w-3xl space-y-2" role="region" aria-label="Approvals waiting in this chat">
      {items.map((a) => (
        <ApprovalCard key={a.id} approval={a} />
      ))}
    </div>
  );
}
