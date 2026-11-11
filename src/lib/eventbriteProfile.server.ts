type EventbriteProfile = { name?: string; image_id?: string; image?: unknown };

export function eventbriteProfilePhoto(image: unknown): string | null {
  if (!image || typeof image !== 'object') return null;
  const value = image as { url?: unknown; original?: { url?: unknown } };
  const address = value.original?.url ?? value.url;
  if (typeof address !== 'string') return null;
  try {
    const url = new URL(address);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export async function readEventbriteProfile(token: string, send: typeof fetch = fetch) {
  const headers = { Authorization: `Bearer ${token}` };
  const response = await send('https://www.eventbriteapi.com/v3/users/me/?expand=image', { headers, redirect: 'manual' });
  if (!response.ok) {
    console.warn('Eventbrite profile photo unavailable', response.status);
    return null;
  }
  const profile = await response.json() as EventbriteProfile;
  let photo = eventbriteProfilePhoto(profile.image);
  if (!photo && profile.image_id && /^\d+$/.test(profile.image_id)) {
    const image = await send(`https://www.eventbriteapi.com/v3/media/${profile.image_id}/`, { headers, redirect: 'manual' });
    if (image.ok) photo = eventbriteProfilePhoto(await image.json());
  }
  return { accountName: profile.name ?? null, profilePhoto: photo };
}