import { describe, it, expect } from 'vitest';
import { approvalScope, executionOutcome } from '@/lib/approvals.shared';

describe('approval rules', () => {
  it('always approval matches future posts on the same account', () => {
    expect(approvalScope({ kind: 'linkedin_post', text: 'First' }, 'account-a')).toBe(approvalScope({ kind: 'linkedin_post', text: 'Next' }, 'account-a'));
  });
  it('never shares approval with another account', () => {
    expect(approvalScope({ kind: 'linkedin_post' }, 'account-a')).not.toBe(approvalScope({ kind: 'linkedin_post' }, 'account-b'));
  });
  it('never extends a post approval to another type of action', () => {
    expect(approvalScope({ kind: 'linkedin_post' }, 'account-a')).not.toBe(approvalScope({ kind: 'linkedin_event_create' }, 'account-a'));
  });
  it('never extends a page approval to another page', () => {
    expect(approvalScope({ kind: 'linkedin_post' }, 'account-a', '1')).not.toBe(approvalScope({ kind: 'linkedin_post' }, 'account-a', '2'));
  });
  it('only reports success after the provider succeeds', () => {
    expect(executionOutcome({ ok: true })).toBe('succeeded');
  });
  it('reports provider failure as failed', () => {
    expect(executionOutcome({ ok: false })).toBe('failed');
  });
  it('does not report a queued browser action as success', () => {
    expect(executionOutcome({ started: true, queued: 1 })).toBe('queued');
  });
  it('does not create blanket payment approval', () => {
    expect(approvalScope({ kind: 'payment' }, 'account-a')).toBeNull();
  });
});