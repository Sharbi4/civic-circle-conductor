import { describe, expect, it, vi } from 'vitest';
import { readXProfile } from '@/lib/xProfile.server';
import { xProfilePhoto } from '@/lib/xProfile.shared';

describe('connected X account avatar', () => {
  it('reads the authenticated account photo using its own connection', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { username: 'tucsonorg', profile_image_url: 'https://pbs.twimg.com/profile_images/member.jpg' } })));
    expect(await readXProfile('owner-connection', request)).toEqual({ accountName: '@tucsonorg', profilePhoto: 'https://pbs.twimg.com/profile_images/member.jpg' });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ connectionAPIKey: 'owner-connection', connectorId: 'x', path: '/users/me?user.fields=username,name,profile_image_url' }));
  });
  it('keeps the fallback when the account has no photo', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { username: 'tucsonorg' } })));
    expect((await readXProfile('owner-connection', request))?.profilePhoto).toBeNull();
  });
  it('keeps the fallback if X cannot return the photo', async () => {
    const request = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    expect(await readXProfile('owner-connection', request)).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects executable and credential-bearing photo addresses', () => {
    expect(xProfilePhoto('javascript:alert(1)')).toBeNull();
    expect(xProfilePhoto('https://user:secret@example.com/photo')).toBeNull();
    expect(xProfilePhoto('http://pbs.twimg.com/photo')).toBeNull();
  });
});