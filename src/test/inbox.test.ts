import { describe, expect, it } from 'vitest';
import { isChatUnread, isIgnoreSwipe } from '@/lib/inbox.shared';
describe('inbox', () => {
  it('marks new assistant messages unread until read', () => {
    expect(isChatUnread('2026-11-11T04:30:00Z', '2026-11-11T04:29:00Z')).toBe(true);
    expect(isChatUnread('2026-11-11T04:30:00Z', '2026-11-11T04:30:00Z')).toBe(false);
    expect(isChatUnread(null, null)).toBe(false);
  });
  it('ignores only deliberate horizontal swipes', () => {
    expect(isIgnoreSwipe(-100, 10)).toBe(true);
    expect(isIgnoreSwipe(100, 10)).toBe(true);
    expect(isIgnoreSwipe(25, 10)).toBe(false);
    expect(isIgnoreSwipe(100, 100)).toBe(false);
  });
});