import { NEEDS_ATTENTION } from './stepStatus.shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { approvalKind, approvalScope, executionOutcome } from './approvals.shared';

type Db = SupabaseClient<Database>;

export async function getApprovalScope(db: Db, userId: string, payload: unknown) {
  const kind = approvalKind(payload);
  if (kind === 'civi_suggestion') return approvalScope(payload, userId);
  if (kind.startsWith('fb_')) {
    const p = payload as { session?: string };
    const { data } = await db.from('browser_sessions').select('id').eq('id', p.session ?? '').eq('user_id', userId).eq('status', 'running').maybeSingle();
    return data ? approvalScope(payload, data.id) : null;
  }
  const connector = kind.startsWith('linkedin_') ? 'linkedin' : kind === 'x_post' ? 'x' : kind === 'eventbrite_create' ? 'eventbrite' : null;
  if (!connector) return null;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const connection = connector === 'eventbrite'
    ? await supabaseAdmin.from('connector_connections').select('id, updated_at').eq('user_id', userId).eq('connector', connector).maybeSingle()
    : await supabaseAdmin.from('app_user_connections').select('id, updated_at').eq('user_id', userId).eq('connector_id', connector === 'linkedin' ? 'linkedin_direct' : connector).maybeSingle();
  if (connection.error) throw connection.error;
  if (!connection.data) return null;
  const { data: org } = await db.from('organizations').select('linkedin_org_id').eq('user_id', userId).maybeSingle();
  return approvalScope(payload, `${connection.data.id}:${connection.data.updated_at}`, connector === 'linkedin' ? org?.linkedin_org_id ?? '' : '');
}

export async function executeApproval<T extends { ok?: boolean; started?: boolean; queued?: number }>(db: Db, userId: string, id: string, run: () => Promise<T>) {
  const { data: claim, error } = await db.from('approvals').update({ run_state: 'running', run_error: null })
    .eq('id', id).eq('user_id', userId).eq('status', 'approved').is('run_state', null).select('id').maybeSingle();
  if (error) throw error;
  if (!claim) throw new Error('This action is already running or has an outcome. It will not be repeated.');
  try {
    const result = await run();
    const state = executionOutcome(result);
    const { error: saved } = await db.from('approvals').update({ run_state: state, run_finished_at: state === 'queued' ? null : new Date().toISOString(), run_error: state === 'failed' ? 'The service did not complete this action. See the chat for details.' : null }).eq('id', id).eq('user_id', userId);
    if (saved) throw new Error('Could not save the outcome. Check the service before attempting another action.');
    // Keep the link to what went out (post, event, doc) so the event page can offer "View".
    const link = state === 'succeeded' ? resultLink(result) : null;
    if (link) {
      const { data: row } = await db.from('approvals').select('payload').eq('id', id).eq('user_id', userId).maybeSingle();
      const payload = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
      await db.from('approvals').update({ payload: { ...payload, result_url: link } }).eq('id', id).eq('user_id', userId);
    }
    return result;
  } catch (error) {
    await db.from('approvals').update({ run_state: 'failed', run_error: error instanceof Error ? error.message : 'The action failed. Check the service before trying again.', run_finished_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
    throw error;
  }
}

export async function dispatchApproval(db: Db, userId: string, id: string, payload: unknown) {
  try {
    const result = await runApprovalDispatch(db, userId, id, payload);
    await recordLaunchProgress(db, userId, payload, null, result);
    return result;
  } catch (error) {
    await recordLaunchProgress(db, userId, payload, error);
    throw error;
  }
}

/** Marks an event-launch-chain task done (or failed) when its queued approval executes, and reports progress in chat. */
async function recordLaunchProgress(db: Db, userId: string, payload: unknown, error: unknown, result?: unknown) {
  try {
    const taskId = (payload as { launch_task_id?: unknown } | null)?.launch_task_id;
    if (typeof taskId !== 'string' || !taskId) return;
    // Placing a call or accepting a suggestion is not the step itself being done.
    if (['venue_call', 'civi_suggestion'].includes(approvalKind(payload))) return;
    // A step only finishes when its action really went out; an "ok: false" result is a failure, not success.
    const failed = !!error || (result as { ok?: boolean } | undefined)?.ok === false;
    if (failed) {
      await db.from('tasks').update({ step_state: 'failed', step_note: NEEDS_ATTENTION, last_error: 'Step failed, see Approvals for details' }).eq('id', taskId).eq('user_id', userId).eq('done', false);
      return;
    }
    if ((result as { queued?: number } | undefined)?.queued) return;
    // An inquiry or application going out doesn't book the venue: the step waits for the venue's answer instead of finishing.
    const { data: step } = await db.from('tasks').select('step_key').eq('id', taskId).eq('user_id', userId).maybeSingle();
    if (step?.step_key === 'venue' || step?.step_key === 'essentials') {
      const { data: org } = await db.from('organizations').select('time_zone').eq('user_id', userId).maybeSingle();
      const { stepStatusPatch } = await import('./stepStatus.shared');
      const follow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      await db.from('tasks').update({ ...stepStatusPatch({ state: 'waiting_on', who: 'a reply', follow_up: follow }, Date.now(), org?.time_zone ?? ''), last_error: null }).eq('id', taskId).eq('user_id', userId).eq('done', false);
      return;
    }
    const url = resultLink(result);
    await db.from('tasks').update({ done: true, done_at: new Date().toISOString(), last_error: null, step_state: 'done', step_note: null, scheduled_for: null, ...(url ? { result_url: url } : {}) }).eq('id', taskId).eq('user_id', userId);
    const { data: task } = await db.from('tasks').select('title, goal_id, thread_id, step_key').eq('id', taskId).maybeSingle();
    if (!task?.thread_id) return;
    const noun = task.step_key ? 'Event step' : 'Launch step';
    let line = `✅ ${noun} done: **${task.title}**${url ? `, [see it](${url})` : ''}.`;
    if (task.goal_id) {
      const { data: sibs } = await db.from('tasks').select('done').eq('goal_id', task.goal_id);
      const total = sibs?.length ?? 0;
      const doneN = (sibs ?? []).filter((s) => s.done).length;
      if (total) line = `${line.slice(0, -1)}, ${doneN}/${total} steps complete.${doneN === total ? ' 🎉 Every step is finished!' : task.step_key ? " I'll start whatever this unlocks on the next check." : ''}`;
    }
    await db.from('messages').insert({ thread_id: task.thread_id, user_id: userId, role: 'assistant', content: line });
  } catch (e) { console.error('Launch progress update failed', e); }
}

/** The public link an executed action returned (post, event, email), if any. */
export function resultLink(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  for (const k of ['url', 'link', 'permalink']) { const v = r[k]; if (typeof v === 'string' && /^https:\/\//.test(v)) return v.slice(0, 500); }
  return null;
}

async function runApprovalDispatch(db: Db, userId: string, id: string, payload: unknown) {
  const kind = approvalKind(payload);
  if (kind === 'venue_call') {
    const { executeVenueCall } = await import('./calling.server');
    return executeApproval(db, userId, id, () => executeVenueCall(db, userId, id));
  }
  if (kind.startsWith('linkedin_')) {
    const { executeLinkedinApproval } = await import('./linkedinApproval.server');
    return executeApproval(db, userId, id, () => executeLinkedinApproval(db, userId, id));
  }
  if (['gmail_send', 'gmail_draft', 'gmail_modify', 'calendar_create', 'calendar_update', 'calendar_cancel', 'drive_doc'].includes(kind)) {
    const { executeGoogleApproval } = await import('./googleActions.server');
    return executeApproval(db, userId, id, () => executeGoogleApproval(db, userId, id));
  }
  if (kind === 'x_post') {
    const { executeXApproval } = await import('./xApproval.server');
    return executeApproval(db, userId, id, () => executeXApproval(db, userId, id));
  }
  if (kind === 'eventbrite_create') {
    const { executeEventbriteApproval } = await import('./eventbriteApproval.server');
    return executeApproval(db, userId, id, async () => ({ ...await executeEventbriteApproval(db, userId, id), ok: true }));
  }
  if (kind.startsWith('fb_')) {
    const { executeFacebookApproval } = await import('./browser.server');
    return executeApproval(db, userId, id, () => executeFacebookApproval(db, userId, id));
  }
  if (kind === 'civi_suggestion') {
    const p = payload as { thread: string; prompt: string };
    const { runOrganizer } = await import('./organizer.server');
    return executeApproval(db, userId, id, async () => { await runOrganizer(db, userId, { threadId: p.thread, content: p.prompt }); return { ok: true, threadId: p.thread }; });
  }
  return { ok: true };
}

export async function applyStandingApprovals(db: Db, userId: string, rows: { id: string; payload: unknown }[]) {
  for (const row of rows) {
    const scope = await getApprovalScope(db, userId, row.payload);
    if (!scope) continue;
    const { data: preference, error } = await db.from('approval_preferences').select('id').eq('user_id', userId).eq('scope_key', scope).maybeSingle();
    if (error || !preference) continue;
    const { data: claimed } = await db.from('approvals').update({ status: 'approved', approval_mode: 'always', resolved_at: new Date().toISOString() }).eq('id', row.id).eq('user_id', userId).eq('status', 'pending').select('id').maybeSingle();
    if (!claimed) continue;
    try { await dispatchApproval(db, userId, row.id, row.payload); }
    catch (error) { console.error('Standing approval action failed', error); }
  }
}