import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { eventbriteIsLive } from './eventbriteDraft.shared';

type Db = SupabaseClient<Database>;
export async function publishAndVerifyEvent(eventId: string, call: (path: string, method?: string) => Promise<{ status?: string; url?: string }>) {
  const before = await call(`/events/${eventId}/`);
  if (!eventbriteIsLive(before.status ?? '')) await call(`/events/${eventId}/publish/`, 'POST');
  const after = await call(`/events/${eventId}/`);
  if (!eventbriteIsLive(after.status ?? '')) throw new Error('Publication is not confirmed. Review the event on Eventbrite before trying again.');
  return { ok: true, eventId, url: after.url ?? '' };
}
export async function eventbriteForOwner(userId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { decryptToken } = await import('./tokenCrypto.server');
  const { data } = await supabaseAdmin.from('connector_connections').select('id,updated_at,access_token_ciphertext').eq('user_id', userId).eq('connector', 'eventbrite').maybeSingle();
  if (!data) throw new Error('Connect Eventbrite first.');
  const token = decryptToken(data.access_token_ciphertext);
  return { revision: `${data.id}:${data.updated_at}`, call: async (path: string, method = 'GET') => {
    const response = await fetch(`https://www.eventbriteapi.com/v3${path}`, { method, headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Eventbrite could not complete this action [${response.status}]: ${typeof body.error_description === 'string' ? body.error_description : 'Review the event details and ticket settings on Eventbrite.'}`);
    return body;
  }};
}

export async function publishEventbriteDraft(db: Db, userId: string, approvalId: string) {
  const { data: approval } = await db.from('approvals').select('payload,status').eq('id', approvalId).eq('user_id', userId).single();
  const p = approval?.payload as { event_id?: string; connection?: string } | undefined;
  if (approval?.status !== 'approved' || !p?.event_id || !/^\d+$/.test(p.event_id)) throw new Error('Publication has not been approved.');
  const eb = await eventbriteForOwner(userId);
  if (eb.revision !== p.connection) throw new Error('Eventbrite was reconnected. Approve publishing again for this account.');
  return publishAndVerifyEvent(p.event_id, eb.call);
}

export async function runEventbriteDraftTask(db: Db, userId: string, prompt: string, threadId: string) {
  const data = JSON.parse(prompt) as { kind: string; eventId: string; title: string; approvalId?: string };
  if (data.kind === 'eventbrite_publish' && data.approvalId) {
    const { executeApproval } = await import('./approvals.server');
    const approvalId = data.approvalId;
    const result = await executeApproval(db, userId, approvalId, () => publishEventbriteDraft(db, userId, approvalId));
    const { error } = await db.from('messages').insert({ user_id: userId, thread_id: threadId, role: 'assistant', content: `**Published, live on Eventbrite:** ${data.title}\n\n${result.url}` });
    if (error) throw error;
  } else if (data.kind === 'eventbrite_reminder') {
    const { error } = await db.from('messages').insert({ user_id: userId, thread_id: threadId, role: 'assistant', content: `**Reminder: ${data.title}**, review your Eventbrite draft. This reminder does not publish it.\n\n[[eventbrite_draft:${data.eventId}]]` });
    if (error) throw error;
  } else throw new Error('Invalid Eventbrite scheduled action.');
}