export function isChatUnread(latest: string | null, read: string | null) {
  return !!latest && (!read || Date.parse(latest) > Date.parse(read));
}
export function isIgnoreSwipe(dx: number, dy: number) {
  return Math.abs(dx) >= 80 && Math.abs(dx) > Math.abs(dy) * 1.5;
}