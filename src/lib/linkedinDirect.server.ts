import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getConnectionForUser, saveConnectionKeyForUser, deleteConnectionForUser } from './appUserConnections.server';
import { encryptConnectionKey, decryptConnectionKey } from './connectionKeyCrypto.server';
import { LINKEDIN_REDIRECT_URI, LINKEDIN_SCOPES, validLinkedInOrigin, canCompleteLinkedInState, linkedInTokenUsable } from './linkedinDirect.shared';

const tokenSchema = z.object({ accessToken: z.string().min(1), expiresAt: z.string(), scopes: z.array(z.string()) });
type DirectToken = z.infer<typeof tokenSchema>;
const hashState = (state: string) => createHash('sha256').update(state).digest('hex');

function credentials() {
  const id = process.env['LINKEDIN_DIRECT_CLIENT_ID'];
  const secret = process.env['LINKEDIN_DIRECT_CLIENT_SECRET'];
  if (!id || !secret) throw new Error('LinkedIn direct photo publishing needs its app credentials before you can reconnect.');
  return { id, secret };
}

export function directLinkedInConfigured() {
  return Boolean(process.env['LINKEDIN_DIRECT_CLIENT_ID'] && process.env['LINKEDIN_DIRECT_CLIENT_SECRET']);
}

/** OAuth tokens never leave the server; the browser receives only connection status. */
export async function getDirectLinkedInConnection(userId: string) {
  const saved = await getConnectionForUser(userId, 'linkedin_direct');
  if (!saved) return null;
  return { token: tokenSchema.parse(JSON.parse(saved.key)), accountName: saved.accountName };
}

export async function disconnectDirectLinkedIn(userId: string) {
  await deleteConnectionForUser(userId, 'linkedin_direct');
}

/** Constrain the API and signed upload destinations before adding the owner's bearer token. */
export function createDirectLinkedInTransport(token: DirectToken, send: typeof fetch = fetch) {
  if (!linkedInTokenUsable(token)) throw new Error('Your LinkedIn access has expired. Reconnect LinkedIn before publishing.');
  const request = async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token.accessToken}`);
    // Do not follow redirects with OAuth credentials or signed upload queries.
    return send(url, { ...init, headers, redirect: 'error' });
  };
  return {
    call: (path: string, init?: RequestInit) => {
      if (!/^\/(?:v2|rest)\//.test(path) || path.includes('\\') || path.includes('..')) throw new Error('Unexpected LinkedIn API address.');
      return request(`https://api.linkedin.com${path}`, init);
    },
    upload: (address: string, init: RequestInit) => {
      const url = new URL(address);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !['www.linkedin.com', 'api.linkedin.com'].includes(url.hostname) || !/^\/(?:dms-uploads|mediaUpload)\//.test(url.pathname)) {
        throw new Error('LinkedIn returned an unexpected photo upload address.');
      }
      return request(address, init);
    },
  };
}

export async function startDirectLinkedIn(userId: string, origin: string, page: boolean) {
  if (!validLinkedInOrigin(origin)) throw new Error('LinkedIn connection must start from Civi Meet.');
  const { id } = credentials();
  const state = randomBytes(32).toString('hex');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('linkedin_oauth_states').insert({
    user_id: userId, state_hash: hashState(state), opener_origin: origin, redirect_uri: LINKEDIN_REDIRECT_URI,
  });
  if (error) throw new Error('Could not start LinkedIn authorization. Please try again.');
  // Page permissions are requested only when the organization has selected a page.
  const scopes = page ? [...LINKEDIN_SCOPES, 'w_organization_social', 'r_organization_social', 'rw_organization_admin', 'r_events', 'rw_events'] : LINKEDIN_SCOPES;
  const query = new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: LINKEDIN_REDIRECT_URI, scope: scopes.join(' '), state });
  return { authorizationUrl: `https://www.linkedin.com/oauth/v2/authorization?${query}` };
}

/** The public callback verifies and atomically claims an unexpired server-created state. */
export async function handleDirectLinkedInCallback(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const state = query.get('state') ?? '';
  const code = query.get('code') ?? '';
  if (!/^[a-f0-9]{64}$/.test(state) || code.length > 4096) return new Response('LinkedIn connection failed: invalid authorization state.', { status: 400 });
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: row, error } = await supabaseAdmin.from('linkedin_oauth_states').update({ status: 'exchanging' })
    .eq('state_hash', hashState(state)).eq('status', 'pending').gt('expires_at', new Date().toISOString())
    .select('id, opener_origin, redirect_uri').maybeSingle();
  if (error || !row || !validLinkedInOrigin(row.opener_origin)) return new Response('LinkedIn connection failed: authorization expired or was already used.', { status: 400 });
  let success = false;
  let message = 'LinkedIn authorization was declined or did not return a code.';
  let stage = 'consent';
  try {
    if (!code || query.has('error')) throw new Error(message);
    stage = 'credentials';
    const { id, secret } = credentials();
    stage = 'token_exchange';
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: row.redirect_uri, client_id: id, client_secret: secret }),
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const providerCode = z.object({ error: z.string() }).safeParse(body);
      const knownCodes = ['invalid_client', 'invalid_client_id', 'invalid_client_secret', 'invalid_grant', 'invalid_redirect_uri', 'unauthorized_client'];
      const reason = providerCode.success && knownCodes.includes(providerCode.data.error) ? providerCode.data.error : 'unclassified';
      console.error(`LinkedIn OAuth token exchange failed [${response.status}] reason=${reason}`);
      if (['invalid_client', 'invalid_client_id', 'invalid_client_secret', 'unauthorized_client'].includes(reason)) {
        throw new Error(`LinkedIn rejected the app credentials [${response.status}]. The saved client ID and client secret must match the Civimeet LinkedIn app; publish after updating them.`);
      }
      if (reason === 'invalid_redirect_uri') throw new Error(`LinkedIn rejected the callback address [${response.status}]. Its authorized redirect URL must exactly match ${LINKEDIN_REDIRECT_URI}.`);
      if (reason === 'invalid_grant') throw new Error(`LinkedIn authorization expired or was already used [${response.status}]. Start a new connection attempt.`);
      throw new Error(`LinkedIn authorization failed [${response.status}]. Please try a new connection attempt.`);
    }
    stage = 'token_validation';
    const received = z.object({ access_token: z.string().min(1), expires_in: z.number().positive(), scope: z.string().optional() }).parse(await response.json());
    const token: DirectToken = { accessToken: received.access_token, expiresAt: new Date(Date.now() + received.expires_in * 1000).toISOString(), scopes: received.scope?.split(' ') ?? LINKEDIN_SCOPES };
    stage = 'profile_request';
    const profile = await createDirectLinkedInTransport(token).call('/v2/userinfo');
    if (!profile.ok) {
      console.error(`LinkedIn OAuth profile confirmation failed [${profile.status}]`);
      throw new Error(`LinkedIn profile confirmation failed [${profile.status}]. Check that OpenID Connect is enabled with openid and profile permissions, then reconnect.`);
    }
    stage = 'profile_validation';
    const identity = z.object({ sub: z.string().min(1), name: z.string().optional() }).parse(await profile.json());
    stage = 'token_encryption';
    const ciphertext = encryptConnectionKey(JSON.stringify(token));
    stage = 'authorization_storage';
    const { error: saved } = await supabaseAdmin.from('linkedin_oauth_states').update({ status: 'complete', token_ciphertext: ciphertext, account_name: identity.name ?? 'LinkedIn account' }).eq('id', row.id).eq('status', 'exchanging');
    if (saved) throw new Error('Could not save LinkedIn authorization. Please reconnect.');
    success = true;
    message = 'LinkedIn authorized. Return to Civi Meet to finish connecting.';
  } catch (error) {
    // Never log OAuth responses or callback URLs: they can contain credentials.
    console.error(`LinkedIn OAuth callback did not complete stage=${stage} category=${error instanceof z.ZodError ? 'invalid_response' : 'operation_failed'}`);
    const stageMessages: Record<string, string> = {
      credentials: 'Civi Meet could not load its LinkedIn app credentials. They must be saved and published.',
      token_exchange: 'Civi Meet could not finish the LinkedIn authorization exchange. Please try a new connection attempt.',
      token_validation: 'LinkedIn returned an unexpected authorization response. Your connection was not saved.',
      profile_request: 'Civi Meet could not confirm your LinkedIn profile. Your connection was not saved.',
      profile_validation: 'LinkedIn returned an unexpected profile response. Your connection was not saved.',
      token_encryption: 'LinkedIn authorized your account, but Civi Meet could not securely store the connection. No post was published.',
      authorization_storage: 'LinkedIn authorized your account, but Civi Meet could not save the connection. No post was published.',
    };
    // Preserve only deliberately authored errors, never arbitrary exception messages.
    const safeError = error instanceof Error && !(error instanceof z.ZodError)
      && /^(LinkedIn (rejected|authorization (failed|expired|was)|profile confirmation failed)|Could not save LinkedIn authorization)/.test(error.message);
    message = safeError ? error.message : stageMessages[stage] ?? 'LinkedIn connection could not be completed. Please reconnect.';
    await supabaseAdmin.from('linkedin_oauth_states').update({ status: 'failed', token_ciphertext: null }).eq('id', row.id);
  }
  const result = JSON.stringify({ type: success ? 'civiLinkedInOAuthComplete' : 'civiLinkedInOAuthFailed', connectorId: 'linkedin', state: success ? state : null, message }).replace(/</g, '\\u003c');
  const origin = JSON.stringify(row.opener_origin);
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
  return new Response(`<!doctype html><html><head><title>LinkedIn connection — Civi Meet</title></head><body><p>${escape(message)}</p><script>if(window.opener){window.opener.postMessage(${result},${origin});setTimeout(()=>window.close(),500);}</script></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

export async function completeDirectLinkedIn(userId: string, state: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: row, error } = await supabaseAdmin.from('linkedin_oauth_states').select('id,user_id,status,expires_at,token_ciphertext,account_name')
    .eq('state_hash', hashState(state)).eq('user_id', userId).maybeSingle();
  if (error || !row || !canCompleteLinkedInState(row, userId) || !row.token_ciphertext) throw new Error('LinkedIn authorization expired or belongs to a different account. Reconnect.');
  const serialized = decryptConnectionKey(row.token_ciphertext);
  tokenSchema.parse(JSON.parse(serialized));
  const { data: claimed, error: claimError } = await supabaseAdmin.from('linkedin_oauth_states').update({ status: 'consumed', token_ciphertext: null })
    .eq('id', row.id).eq('user_id', userId).eq('status', 'complete').gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
  if (claimError || !claimed) throw new Error('LinkedIn authorization has already been used. Reconnect.');
  await saveConnectionKeyForUser(userId, 'linkedin_direct', serialized, row.account_name);
  return { accountName: row.account_name ?? 'LinkedIn account' };
}