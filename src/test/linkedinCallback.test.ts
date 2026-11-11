import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleDirectLinkedInCallback } from '@/lib/linkedinDirect.server';

vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: { from: () => ({ update: () => ({
    eq: () => ({ eq: () => ({ gt: () => ({ select: () => ({ maybeSingle: async () => ({
      data: { id: 'fixture', opener_origin: 'https://civimeet.com', redirect_uri: 'https://civimeet.com/api/public/oauth/linkedin/return' }, error: null,
    }) }) }) }) }),
  }) }) },
}));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('LinkedIn callback failure diagnosis', () => {
  it('reports the failing token validation stage without logging a returned token', async () => {
    vi.stubEnv('LINKEDIN_DIRECT_CLIENT_ID', 'fixture-client');
    vi.stubEnv('LINKEDIN_DIRECT_CLIENT_SECRET', 'fixture-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'private-token-fixture', expires_in: '5184000' }))));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await handleDirectLinkedInCallback(new Request(`https://civimeet.com/api/public/oauth/linkedin/return?state=${'b'.repeat(64)}&code=fixture-code`));
    expect(await response.text()).toContain('LinkedIn returned an unexpected authorization response');
    expect(JSON.stringify(log.mock.calls)).toContain('stage=token_validation');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-token-fixture');
  });
  it('identifies rejected app credentials without revealing credentials or the provider body', async () => {
    vi.stubEnv('LINKEDIN_DIRECT_CLIENT_ID', 'fixture-client');
    vi.stubEnv('LINKEDIN_DIRECT_CLIENT_SECRET', 'fixture-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_client', error_description: 'sensitive-provider-detail' }), { status: 401 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await handleDirectLinkedInCallback(new Request(`https://civimeet.com/api/public/oauth/linkedin/return?state=${'a'.repeat(64)}&code=fixture-code`));
    const html = await response.text();
    expect(html).toContain('LinkedIn rejected the app credentials');
    expect(html).not.toContain('fixture-secret');
    expect(html).not.toContain('sensitive-provider-detail');
    expect(html).toContain('civiLinkedInOAuthFailed');
  });
});