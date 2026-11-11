export function reminderTime(period: 'day' | 'week', now = Date.now()) {
  return new Date(now + (period === 'day' ? 1 : 7) * 86400000).toISOString();
}
export function futureEventTime(value: string, now = Date.now()) {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time <= now) throw new Error('Choose a future date and time.');
  return new Date(time).toISOString();
}
export function eventbriteIsLive(status: string) { return status === 'live'; }