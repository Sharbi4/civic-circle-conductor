import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { futureEventTime } from './eventbriteDraft.shared';

export const getEventbriteDraft = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().regex(/^\d+$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { eventbriteForOwner } = await import('./eventbriteDraft.server');
    const eb = await eventbriteForOwner(context.userId);
    const event = await eb.call(`/events/${data.eventId}/`);
    const { data: tasks } = await context.supabase.from('tasks').select('id,job_kind,scheduled_for,last_error,done').eq('user_id', context.userId).eq('schedule_key', `eventbrite:${data.eventId}`).eq('done', false);
    return { title: String(event.name?.text ?? 'Eventbrite event'), status: String(event.status ?? 'unknown'), url: String(event.url ?? ''), task: tasks?.[0] ?? null };
  });

export const manageEventbriteDraft = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().regex(/^\d+$/), action: z.enum(['save', 'remind', 'schedule', 'publish']), when: z.string().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { eventbriteForOwner, publishEventbriteDraft } = await import('./eventbriteDraft.server');
    const { executeApproval } = await import('./approvals.server');
    const eb = await eventbriteForOwner(context.userId);
    const event = await eb.call(`/events/${data.eventId}/`);
    const title = String(event.name?.text ?? 'Eventbrite event');
    const key = `eventbrite:${data.eventId}`;
    const { data: old } = await context.supabase.from('tasks').select('id,run_prompt').eq('schedule_key', key).eq('user_id', context.userId).eq('done', false);
    for (const task of old ?? []) {
      const { data: runs } = await context.supabase.from('agent_task_runs').select('id').eq('task_id', task.id).in('status', ['running','needs_review']);
      if (runs?.length) throw new Error('This event has work running or needing review. Check its result before changing the schedule.');
    }
    const when = data.action === 'remind' || data.action === 'schedule' ? futureEventTime(data.when ?? '') : null;
    if (event.status !== 'draft' && data.action !== 'save') throw new Error(event.status === 'live' ? 'This event is already live.' : 'This event is not a publishable draft. Review it on Eventbrite.');
    for (const task of old ?? []) {
      const payload = JSON.parse(task.run_prompt ?? '{}') as { approvalId?: string };
      if (payload.approvalId) {
        const { data: cancelled } = await context.supabase.from('approvals').update({ status: 'ignored' }).eq('id', payload.approvalId).eq('user_id', context.userId).is('run_state', null).select('id').maybeSingle();
        if (!cancelled) throw new Error('Publishing has already started. Check Eventbrite before changing it.');
      }
    }
    const { error: cancelError } = await context.supabase.from('tasks').update({ done: true, done_at: new Date().toISOString() }).eq('schedule_key', key).eq('user_id', context.userId);
    if (cancelError) throw cancelError;
    if (data.action === 'save') return { message: 'Saved as draft, not published. No reminder or publishing scheduled.' };
    let approvalId: string | undefined;
    if (data.action === 'publish' || data.action === 'schedule') {
      const { data: ap, error } = await context.supabase.from('approvals').insert({ user_id: context.userId, action_type: 'booking', title: `Publish Eventbrite event: ${title}`, status: 'approved', resolved_at: new Date().toISOString(), payload: { kind: 'eventbrite_publish', event_id: data.eventId, connection: eb.revision } }).select('id').single();
      if (error) throw error;
      approvalId = ap.id;
      if (data.action === 'publish') {
        await executeApproval(context.supabase, context.userId, ap.id, () => publishEventbriteDraft(context.supabase, context.userId, ap.id));
        return { message: 'Published, live on Eventbrite. People can register now.' };
      }
    }
    const { data: thread } = await context.supabase.from('threads').select('id').eq('user_id', context.userId).eq('title', 'Eventbrite Agent').maybeSingle();
    const { error } = await context.supabase.from('tasks').upsert({ user_id: context.userId, schedule_key: key, title: `${data.action === 'remind' ? 'Review draft' : 'Publish event'}: ${title}`, job_kind: data.action === 'remind' ? 'eventbrite_reminder' : 'eventbrite_publish', run_prompt: JSON.stringify({ kind: data.action === 'remind' ? 'eventbrite_reminder' : 'eventbrite_publish', eventId: data.eventId, title, approvalId }), scheduled_for: when, due_date: when?.slice(0,10) ?? null, repeat: null, done: false, done_at: null, thread_id: thread?.id ?? null, last_error: null }, { onConflict: 'user_id,schedule_key' });
    if (error) {
      if (approvalId) await context.supabase.from('approvals').update({ status: 'ignored' }).eq('id', approvalId).is('run_state', null);
      throw error;
    }
    return { message: data.action === 'remind' ? 'Reminder saved, event stays unpublished.' : 'Publishing scheduled, approved for this event only.' };
  });