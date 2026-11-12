type ProfileRequest = (options: { gatewayBaseUrl: string; connectionAPIKey: string; connectorId: string; path: string; requiredScopes: string[] }) => Promise<Response>;

export async function readGmailProfile(connectionAPIKey: string, request: ProfileRequest) {
  const response = await request({
    gatewayBaseUrl: 'https://connector-gateway.lovable.dev',
    connectionAPIKey,
    connectorId: 'google_mail',
    path: '/gmail/v1/users/me/profile',
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  });
  if (!response.ok) {
    console.warn('Gmail profile unavailable', response.status);
    return null;
  }
  const profile = (await response.json()) as { emailAddress?: string; messagesTotal?: number };
  return { accountName: profile.emailAddress ?? null };
}
