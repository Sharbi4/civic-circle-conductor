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
    return result;
  } catch (error) {
    await db.from('approvals').update({ run_state: 'failed', run_error: error instanceof Error ? error.message : 'The action failed. Check the service before trying again.', run_finished_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
    throw error;
  }
}

export async function dispatchApproval(db: Db, userId: string, id: string, payload: unknown) {
  const kind = approvalKind(payload);
  if (kind.startsWith('linkedin_')) {
    const { executeLinkedinApproval } = await import('./linkedinApproval.server');
    return executeApproval(db, userId, id, () => executeLinkedinApproval(db, userId, id));
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