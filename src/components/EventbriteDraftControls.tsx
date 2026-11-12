import { useState } from 'react';
import { formatAppTime } from "@/lib/appTimeZone";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Bell, CalendarClock, Check, ExternalLink, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getEventbriteDraft, manageEventbriteDraft } from '@/lib/eventbriteDraft.functions';
import { reminderTime } from '@/lib/eventbriteDraft.shared';

export function EventbriteDraftControls({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const get = useServerFn(getEventbriteDraft);
  const manage = useServerFn(manageEventbriteDraft);
  const event = useQuery({ queryKey: ['eventbrite-draft', eventId], queryFn: () => get({ data: { eventId } }), staleTime: 60_000, refetchInterval: 60_000 });
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'remind' | 'schedule' | 'publish' | null>(null);
  const [when, setWhen] = useState('');
  async function act(action: 'save' | 'remind' | 'schedule' | 'publish', time?: string) {
    setBusy(true);
    try {
      const result = await manage({ data: { eventId, action, when: time } });
      toast.success(result.message); setMode(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not complete this action.'); }
    finally { setBusy(false); await Promise.all(['eventbrite-draft', 'tasks', 'approvals'].map(key => qc.invalidateQueries({ queryKey: [key] }))); }
  }
  if (event.isError) return <a className="text-sm underline" href={`https://www.eventbrite.com/myevent?eid=${eventId}`} target="_blank" rel="noreferrer">Review draft on Eventbrite <ExternalLink className="inline h-3 w-3" /></a>;
  if (!event.data) return <p className="text-sm text-muted-foreground">Checking Eventbrite status…</p>;
  const live = event.data.status === 'live';
  return <div className="space-y-2 border-t pt-3">
    <p className="flex items-center gap-2 text-sm font-medium">{live && <Check className="h-4 w-4" />}{live ? 'Published — live on Eventbrite' : event.data.status === 'draft' ? 'Draft — not published; registration is not open' : `Eventbrite status: ${event.data.status}`}</p>
    {event.data.task && <p className="text-xs text-muted-foreground">{event.data.task.job_kind === 'eventbrite_publish' ? 'Publishing' : 'Reminder'}: {event.data.task.scheduled_for ? formatAppTime(event.data.task.scheduled_for) : 'Awaiting review'}{event.data.task.last_error ? ` · ${event.data.task.last_error}` : ''}</p>}
    {!live && <div className="flex flex-wrap gap-1">
      <Button size="sm" disabled={busy} onClick={() => setMode('publish')}><Send className="h-4 w-4" />Publish now</Button>
      <Button size="icon" variant="outline" title="Save as draft for later" aria-label="Save as draft for later" disabled={busy} onClick={() => act('save')}><Save className="h-4 w-4" /></Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="outline" title="Remind me" aria-label="Remind me" disabled={busy}><Bell className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent>
        <DropdownMenuItem onSelect={() => act('remind', reminderTime('day'))}>In a day</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => act('remind', reminderTime('week'))}>In a week</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setMode('remind')}>Custom reminder…</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
      <Button size="icon" variant="outline" title="Schedule publishing" aria-label="Schedule publishing" disabled={busy} onClick={() => setMode('schedule')}><CalendarClock className="h-4 w-4" /></Button>
    </div>}
    {mode && <div className="space-y-2">
      <p className="text-sm">{mode === 'publish' ? 'Publish this event publicly now? Confirm the venue and event details first.' : mode === 'schedule' ? 'Publish automatically at this time (within 15 minutes). Confirm the venue and event details first.' : 'Remind me to review this draft:'}</p>
      {mode !== 'publish' && <Input type="datetime-local" aria-label={mode === 'schedule' ? 'Publishing date and time' : 'Reminder date and time'} value={when} onChange={e => setWhen(e.target.value)} />}
      <div className="flex gap-2"><Button size="sm" disabled={busy || (mode !== 'publish' && !when)} onClick={() => act(mode, mode === 'publish' ? undefined : new Date(when).toISOString())}>{busy ? mode === 'publish' ? 'Publishing…' : 'Saving…' : mode === 'publish' ? 'Confirm publish' : 'Save'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancel</Button></div>
    </div>}
  </div>;
}