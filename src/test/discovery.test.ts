import { it, expect } from 'vitest';
import { discoveryIdeas, isScoutBriefing } from '@/lib/discovery.shared';
it('hides historical Scout briefings but preserves normal chat messages', () => {
  expect(isScoutBriefing('🔎 **Community Scout — Tucson, Arizona**\nBriefing')).toBe(true);
  expect(isScoutBriefing('Let’s plan a Tucson cookout.')).toBe(false);
});
it('offers blog, event and post actions from existing findings', () => {
  const ideas = discoveryIdeas([], 'Tucson discovery briefing');
  expect(ideas.map(i => i.kind)).toEqual(['blog', 'event', 'post']);
  expect(ideas.map(i => i.connector)).toEqual(['internal', 'eventbrite', 'linkedin']);
});