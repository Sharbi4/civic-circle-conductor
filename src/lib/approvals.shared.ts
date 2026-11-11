export function approvalKind(payload: unknown): string {
  return payload && typeof payload === 'object' && 'kind' in payload && typeof payload.kind === 'string' ? payload.kind : '';
}

export function approvalScope(payload: unknown, account: string, page = ''): string | null {
  const kind = approvalKind(payload);
  const supported = ['linkedin_post', 'linkedin_event_create', 'linkedin_event_update', 'linkedin_event_publish', 'x_post', 'eventbrite_create', 'civi_suggestion', 'fb_join_group', 'fb_page_post'];
  if (!supported.includes(kind) || !account) return null;
  const p = payload as Record<string, unknown>;
  const target = kind.includes('event_update') || kind.includes('event_publish') ? p['event_id'] : kind.startsWith('fb_') ? p['url'] : kind === 'civi_suggestion' ? p['thread'] : '';
  return JSON.stringify([kind, account, page, target ?? '']);
}

export function executionOutcome(result: { ok?: boolean; started?: boolean; queued?: number }) {
  if (result.ok === false) return 'failed' as const;
  if (result.started !== undefined || result.queued !== undefined) return 'queued' as const;
  return 'succeeded' as const;
}

export function approvalStateLabel(state: string | null, payload: unknown) {
  if (state === 'running') return approvalKind(payload) === 'eventbrite_publish' ? 'Publishing…' : approvalKind(payload).includes('post') ? 'Posting…' : 'Working…';
  if (state === 'succeeded') return approvalKind(payload) === 'eventbrite_create' ? 'Draft saved — not published' : approvalKind(payload) === 'eventbrite_publish' ? 'Published — live' : 'Success';
  if (state === 'failed') return 'Failed';
  if (state === 'queued') return 'Queued — awaiting completion';
  if (state === 'needs_review') return 'Outcome unknown — review needed';
  return 'Approved — awaiting completion';
}