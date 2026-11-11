import { describe, expect, it, vi } from 'vitest';
import { createDirectLinkedInTransport } from '@/lib/linkedinDirect.server';
import { canCompleteLinkedInState, validLinkedInOrigin } from '@/lib/linkedinDirect.shared';

const token = { accessToken: 'test-fixture', expiresAt: '2099-01-01T00:00:00Z', scopes: ['w_member_social'] };
describe('organization LinkedIn authorization', () => {
  it('uploads bytes to the exact returned www endpoint, not the API host', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    const transport = createDirectLinkedInTransport(token, send);
    const body = new Blob(['original-photo']);
    const url = 'https://www.linkedin.com/dms-uploads/photo?sync=1&signature=a%2Bb';
    const response = await transport.upload(url, { method: 'PUT', body });
    expect(response.status).toBe(201);
    expect(send.mock.calls[0]?.[0]).toBe(url);
    expect(send.mock.calls[0]?.[1]?.body).toBe(body);
    expect(send.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(send.mock.calls[0]?.[1]?.redirect).toBe('manual');
    expect(new Headers(send.mock.calls[0]?.[1]?.headers).has('Authorization')).toBe(true);
  });
  it('never sends organization credentials to another host', () => {
    const send = vi.fn<typeof fetch>();
    const transport = createDirectLinkedInTransport(token, send);
    expect(() => transport.upload('https://www.linkedin.com.evil.test/dms-uploads/photo', { method: 'PUT' })).toThrow('unexpected');
    expect(() => transport.upload('https://www.linkedin.com:8443/dms-uploads/photo', { method: 'PUT' })).toThrow('unexpected');
    expect(send).not.toHaveBeenCalled();
  });
  it('keeps API reads on the API host and refuses arbitrary paths', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    const transport = createDirectLinkedInTransport(token, send);
    await transport.call('/v2/userinfo');
    expect(send.mock.calls[0]?.[0]).toBe('https://api.linkedin.com/v2/userinfo');
    expect(() => transport.call('//evil.test/v2/userinfo')).toThrow('Unexpected');
  });
  it('does not use an expired organization token', () => {
    expect(() => createDirectLinkedInTransport({ ...token, expiresAt: '2000-01-01T00:00:00Z' })).toThrow('expired');
  });
  it('cannot complete another organization’s authorization', () => {
    expect(canCompleteLinkedInState({ user_id: 'org-a', status: 'complete', expires_at: '2099-01-01' }, 'org-b')).toBe(false);
    expect(canCompleteLinkedInState({ user_id: 'org-a', status: 'complete', expires_at: '2099-01-01' }, 'org-a')).toBe(true);
  });
  it('cannot replay a consumed or expired authorization', () => {
    expect(canCompleteLinkedInState({ user_id: 'org-a', status: 'consumed', expires_at: '2099-01-01' }, 'org-a')).toBe(false);
    expect(canCompleteLinkedInState({ user_id: 'org-a', status: 'complete', expires_at: '2000-01-01' }, 'org-a')).toBe(false);
  });
  it('never sends authorization completion to an unrelated origin', () => {
    expect(validLinkedInOrigin('https://civimeet.com')).toBe(true);
    expect(validLinkedInOrigin('https://civimeet.com.evil.test')).toBe(false);
  });
});
describe('worker-compatible redirect handling', () => {
  it('never asks the runtime for unsupported redirect mode and refuses redirects', async () => {
    const { createDirectLinkedInTransport } = await import('@/lib/linkedinDirect.server');
    const send = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example/' } }));
    const t = createDirectLinkedInTransport({ accessToken: 'x', expiresAt: new Date(Date.now() + 3600_000).toISOString(), scopes: [] }, send as unknown as typeof fetch);
    await expect(t.call('/v2/userinfo')).rejects.toThrow(/redirected/);
    expect(send.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });
});
