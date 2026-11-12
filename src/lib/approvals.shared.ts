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

/** One plain-language line naming the action this approval will take. */
export function approvalAction(payload: unknown, actionType = ''): string {
  const kind = approvalKind(payload);
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const hasPhoto = typeof p['image'] === 'string' || typeof p['image_prompt'] === 'string';
  switch (kind) {
    case 'linkedin_post': return hasPhoto ? 'Publish this post on LinkedIn with its photo' : 'Publish this post on LinkedIn';
    case 'x_post': return hasPhoto ? 'Publish this post on X with its photo' : 'Publish this post on X';
    case 'linkedin_event_create': return 'Create and publish this event on LinkedIn';
    case 'linkedin_event_update': return 'Update this LinkedIn event';
    case 'linkedin_event_publish': return 'Publish this LinkedIn event';
    case 'eventbrite_create': return 'Create this event as an Eventbrite draft';
    case 'eventbrite_publish': return 'Publish this Eventbrite event';
    case 'venue_call': return `Place a research call to ${typeof p['recipient'] === 'string' ? p['recipient'] : 'the venue'}, no booking or payment`;
    case 'fb_join_group': return 'Join this Facebook group in the live browser';
    case 'fb_page_post': return 'Post this update on your Facebook Page';
    case 'civi_suggestion': return 'Start this suggested action';
    case 'gmail_send': return `Send this email${typeof p['to'] === 'string' ? ` to ${p['to']}` : ''} from your Gmail`;
    case 'calendar_create': return 'Add this event to your Google Calendar';
    case 'gmail_draft': return 'Save this email as a Gmail draft';
    case 'gmail_modify': return 'Archive or label these Gmail emails';
    case 'calendar_cancel': return 'Cancel this Google Calendar event';
    case 'calendar_update': return 'Update this Google Calendar event';
    case 'drive_doc': return typeof p['file_id'] === 'string' ? 'Update this Google Doc in your Drive' : 'Create this Google Doc in your Drive';
    default:
      if (actionType === 'payment') return 'Make this payment';
      if (actionType === 'booking') return 'Make this booking';
      if (actionType === 'outreach') return 'Send this outreach';
      return 'Take this action';
  }
}

/** Storage path (or https URL) of the photo that goes with this approval, if any. */
export function approvalImage(payload: unknown): string | null {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  for (const key of ['image', 'cover_image'] as const) {
    const v = p[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export function executionOutcome(result: { ok?: boolean; started?: boolean; queued?: number }) {
  if (result.ok === false) return 'failed' as const;
  if (result.started !== undefined || result.queued !== undefined) return 'queued' as const;
  return 'succeeded' as const;
}

export function approvalStateLabel(state: string | null, payload: unknown) {
  if (state === 'running') return approvalKind(payload) === 'eventbrite_publish' ? 'Publishing…' : approvalKind(payload).includes('post') ? 'Posting…' : 'Working…';
  if (state === 'succeeded') return approvalKind(payload) === 'eventbrite_create' ? 'Draft saved, not published' : approvalKind(payload) === 'eventbrite_publish' ? 'Published, live' : 'Success';
  if (state === 'failed') return 'Didn\'t complete, nothing was sent';
  if (state === 'queued') return 'In progress';
  if (state === 'needs_review') return 'Please confirm, Civi couldn\'t verify this finished';
  // Older approvals and plain go-aheads have nothing left to run; don't present them as stuck.
  return 'Approved';
}