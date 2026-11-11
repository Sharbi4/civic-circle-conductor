import { xProfilePhoto } from './xProfile.shared';

type ProfileRequest = (options: { gatewayBaseUrl: string; connectionAPIKey: string; connectorId: string; path: string; requiredScopes: string[] }) => Promise<Response>;

export async function readXProfile(connectionAPIKey: string, request: ProfileRequest) {
  const response = await request({
    gatewayBaseUrl: 'https://connector-gateway.lovable.dev',
    connectionAPIKey,
    connectorId: 'x',
    path: '/users/me?user.fields=username,name,profile_image_url',
    requiredScopes: ['users.read', 'tweet.read'],
  });
  if (!response.ok) {
    console.warn('X profile photo unavailable', response.status);
    return null;
  }
  const profile = (await response.json()) as { data?: { username?: string; profile_image_url?: unknown } };
  return {
    accountName: profile.data?.username ? `@${profile.data.username}` : null,
    profilePhoto: xProfilePhoto(profile.data?.profile_image_url),
  };
}