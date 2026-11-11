import { describe, expect, it, vi } from 'vitest';
import { eventbriteProfilePhoto, readEventbriteProfile } from '@/lib/eventbriteProfile.server';

describe('Eventbrite account avatars', () => {
  it('reads the authenticated member image, not an event or organization logo', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ name: 'Member', image: { original: { url: 'https://img.evbuc.com/member.jpg' } } })));
    expect(await readEventbriteProfile('owner-token', send)).toEqual({ accountName: 'Member', profilePhoto: 'https://img.evbuc.com/member.jpg' });
    expect(send).toHaveBeenCalledWith('https://www.eventbriteapi.com/v3/users/me/?expand=image', expect.objectContaining({ headers: { Authorization: 'Bearer owner-token' }, redirect: 'manual' }));
  });
  it('resolves an unexpanded account image ID', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Member', image_id: '123' }))).mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://img.evbuc.com/member.jpg' })));
    expect((await readEventbriteProfile('owner-token', send))?.profilePhoto).toBe('https://img.evbuc.com/member.jpg');
    expect(send).toHaveBeenLastCalledWith('https://www.eventbriteapi.com/v3/media/123/', expect.any(Object));
  });
  it('keeps a fallback when no member photo is available', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ name: 'Member' })));
    expect((await readEventbriteProfile('owner-token', send))?.profilePhoto).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not retry provider failures', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429 }));
    expect(await readEventbriteProfile('owner-token', send)).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('rejects unsafe photo addresses', () => {
    expect(eventbriteProfilePhoto({ url: 'javascript:alert(1)' })).toBeNull();
    expect(eventbriteProfilePhoto({ url: 'https://user:secret@example.com/photo' })).toBeNull();
  });
});