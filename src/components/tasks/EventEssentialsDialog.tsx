import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { saveEventEssentials } from "@/lib/eventGoal";

export function EventEssentialsDialog({ goalId, open, onOpenChange }: { goalId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [budget, setBudget] = useState(""), [people, setPeople] = useState(""), [venue, setVenue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    supabase.from("event_profiles").select("budget, headcount, venue").eq("goal_id", goalId).maybeSingle().then(({ data }) => {
      setBudget(data?.budget?.toString() ?? ""); setPeople(data?.headcount?.toString() ?? ""); setVenue(data?.venue ?? "");
    });
  }, [open, goalId]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await saveEventEssentials(goalId, { budget: budget ? Number(budget.replace(/[^0-9.]/g, "")) || 0 : null, headcount: people ? parseInt(people, 10) || 0 : null, venue: venue.trim() });
      await Promise.all([qc.invalidateQueries({ queryKey: ["event-page", goalId] }), qc.invalidateQueries({ queryKey: ["event-profiles"] })]);
      toast.success("Event details saved"); onOpenChange(false);
    } catch { toast.error("Couldn't save those details"); } finally { setBusy(false); }
  }
  const cls = "w-full rounded-xl border bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-primary";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Budget, people & venue</DialogTitle>
          <DialogDescription>Fill in what you already know. Civi uses this to plan, and it updates your event dashboard.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Budget ($)</span><input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 500" className={cls} /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Expected people</span><input inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} placeholder="e.g. 80" className={cls} /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Venue (if you've picked one)</span><input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Reid Park Ramada 5" className={cls} /></label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="rounded-full" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
