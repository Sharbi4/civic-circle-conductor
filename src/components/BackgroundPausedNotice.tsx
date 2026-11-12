import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PauseCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getBackgroundStatus, resumeBackgroundWork } from "@/lib/jobs.functions";
import { pauseMessage } from "@/lib/background.shared";

/** Tells the organizer when Civi's background work has paused itself, and lets them resume it. */
export function BackgroundPausedNotice() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getBackgroundStatus);
  const resume = useServerFn(resumeBackgroundWork);
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["background-status"], queryFn: () => getStatus(), refetchInterval: 5 * 60_000, staleTime: 60_000 });
  const message = pauseMessage(status.data?.pausedReason);
  if (!message) return null;
  const onResume = async () => {
    setBusy(true);
    try {
      await resume();
      toast.success("Background work resumed");
      await qc.invalidateQueries({ queryKey: ["background-status"] });
    } catch {
      toast.error("Couldn't resume right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="status" className="flex items-start gap-3 border-b border-warning/30 bg-warning/10 py-2.5 pl-14 pr-14 text-sm text-warning-foreground md:pl-4">
      <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1 leading-snug">{message}</p>
      <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={onResume} disabled={busy}>
        {busy ? "Resuming…" : "Resume"}
      </Button>
    </div>
  );
}
