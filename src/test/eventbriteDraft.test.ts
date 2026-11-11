import { describe, expect, it, vi } from 'vitest';
import { reminderTime, futureEventTime, eventbriteIsLive } from '@/lib/eventbriteDraft.shared';
import { publishAndVerifyEvent } from '@/lib/eventbriteDraft.server';
describe('Eventbrite draft decisions', () => {
  const now = Date.parse('2026-11-11T05:46:00Z');
  it('reminds in one day', () => { expect(reminderTime('day', now)).toBe('2026-11-12T05:46:00.000Z'); });
  it('reminds in one week', () => { expect(reminderTime('week', now)).toBe('2026-11-18T05:46:00.000Z'); });
  it('preserves a custom future publishing time', () => { expect(futureEventTime('2026-11-20T18:00:00-07:00', now)).toBe('2026-11-21T01:00:00.000Z'); });
  it('rejects past or invalid publishing times', () => { expect(() => futureEventTime('2026-11-10', now)).toThrow(); expect(() => futureEventTime('invalid', now)).toThrow(); });
  it('draft creation is not publication', () => { expect(eventbriteIsLive('draft')).toBe(false); expect(eventbriteIsLive('live')).toBe(true); });
  it('publishes only the selected existing event and verifies it is live', async () => {
    const call = vi.fn().mockResolvedValueOnce({ status: 'draft' }).mockResolvedValueOnce({ published: true }).mockResolvedValueOnce({ status: 'live', url: 'https://www.eventbrite.com/e/123' });
    expect(await publishAndVerifyEvent('123', call)).toEqual({ ok: true, eventId: '123', url: 'https://www.eventbrite.com/e/123' });
    expect(call).toHaveBeenNthCalledWith(2, '/events/123/publish/', 'POST');
  });
  it('never reports publication success while the provider still says draft', async () => {
    const call = vi.fn().mockResolvedValue({ status: 'draft' });
    await expect(publishAndVerifyEvent('123', call)).rejects.toThrow('Publication is not confirmed');
  });
  it('does not republish an already live event', async () => {
    const call = vi.fn().mockResolvedValue({ status: 'live' });
    await publishAndVerifyEvent('123', call);
    expect(call).toHaveBeenCalledTimes(2);
    expect(call).not.toHaveBeenCalledWith('/events/123/publish/', 'POST');
  });
});