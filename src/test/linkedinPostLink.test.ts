import { describe, it, expect } from 'vitest';
import { stepKeyForAction, stepResultPatch, isDeadApproval } from '@/lib/eventActivity.shared';
import { isRunnableApproval } from '@/lib/approvals.shared';

const POST = 'https://www.linkedin.com/feed/update/urn:li:share:7526733300963627008';

describe('a published post links the event step it belongs to', () => {
  it('sends a LinkedIn post to the event\'s LinkedIn post step', () => {
    expect(stepKeyForAction('linkedin_post')).toBe('linkedin_post');
  });
  it('sends LinkedIn event work to the event\'s LinkedIn event step', () => {
    expect(stepKeyForAction('linkedin_event_create')).toBe('linkedin_event');
    expect(stepKeyForAction('linkedin_event_publish')).toBe('linkedin_event');
  });
  it('sends an X post and an Eventbrite listing to their own steps', () => {
    expect(stepKeyForAction('x_post')).toBe('x_post');
    expect(stepKeyForAction('eventbrite_create')).toBe('eventbrite');
  });
  it('leaves actions that belong to no event step alone', () => {
    expect(stepKeyForAction('')).toBeNull();
    expect(stepKeyForAction('venue_call')).toBeNull();
  });
  it('gives a step that already finished the post link it was missing', () => {
    expect(stepResultPatch({ done: true, result_url: null }, POST)).toEqual({ result_url: POST });
  });
  it('never overwrites a link the step already has', () => {
    expect(stepResultPatch({ done: true, result_url: 'https://x.com/i/web/status/2120402704677646690' }, POST)).toBeNull();
  });
  it('finishes a step that hasn\'t run yet and keeps its link', () => {
    const patch = stepResultPatch({ done: false, result_url: null }, POST, '2026-11-12T19:50:59.000Z');
    expect(patch).toMatchObject({ done: true, done_at: '2026-11-12T19:50:59.000Z', result_url: POST });
  });
  it('writes no link when the action returned none', () => {
    const patch = stepResultPatch({ done: false, result_url: null }, null);
    expect(patch).toMatchObject({ done: true });
    expect(patch && 'result_url' in patch).toBe(false);
  });
  it('treats a plain go-ahead as nothing to run', () => {
    expect(isRunnableApproval('')).toBe(false);
    expect(isRunnableApproval('linkedin_post')).toBe(true);
  });
  it('hides an approved go-ahead that can never finish from the activity list', () => {
    expect(isDeadApproval({ status: 'approved', run_state: null, payload: null })).toBe(true);
    expect(isDeadApproval({ status: 'approved', run_state: 'succeeded', payload: { kind: 'linkedin_post' } })).toBe(false);
    expect(isDeadApproval({ status: 'pending', run_state: null, payload: null })).toBe(false);
  });
});
