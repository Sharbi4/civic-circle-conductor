export const LINKEDIN_REDIRECT_URI = 'https://civimeet.com/api/public/oauth/linkedin/return';
export const LINKEDIN_SCOPES = ['openid', 'profile', 'w_member_social'];
export const LINKEDIN_APP_ORIGINS = [
  'https://civimeet.com', 'https://www.civimeet.com',
  'https://civic-circle-conductor.lovable.app',
  'https://id-preview--41d4b04c-b74e-4751-8d66-ce601cd73b60.lovable.app',
  'http://localhost:8080',
];

export function validLinkedInOrigin(origin: string) {
  return LINKEDIN_APP_ORIGINS.includes(origin);
}

export function canCompleteLinkedInState(row: { user_id: string; status: string; expires_at: string }, userId: string, now = Date.now()) {
  return row.user_id === userId && row.status === 'complete' && Date.parse(row.expires_at) > now;
}

export function linkedInTokenUsable(token: { expiresAt: string }, now = Date.now()) {
  return Date.parse(token.expiresAt) > now + 60_000;
}

/** Profile images are display-only; never accept executable or credential-bearing URLs. */
export function linkedInProfilePhoto(picture: unknown): string | null {
  if (typeof picture !== 'string') return null;
  try {
    const url = new URL(picture);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}