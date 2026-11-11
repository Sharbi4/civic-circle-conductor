import { z } from 'zod';

export const discoveryIdeaSchema = z.object({
  kind: z.enum(['blog', 'event', 'post']),
  title: z.string().min(1).max(160),
  description: z.string().max(500),
  connector: z.enum(['internal', 'eventbrite', 'linkedin', 'x']),
  prompt: z.string().min(1).max(1800),
});
export type DiscoveryIdea = z.infer<typeof discoveryIdeaSchema>;
export function isScoutBriefing(content: string) {
  return /^🔎\s*\*\*Community Scout\s*[—–-]/.test(content.trim());
}
export function discoveryIdeas(value: unknown, summary: string): DiscoveryIdea[] {
  const parsed = z.array(discoveryIdeaSchema).max(6).safeParse(value);
  if (parsed.success && parsed.data.length) return parsed.data;
  const context = summary.slice(0, 1200);
  return [
    { kind: 'blog', connector: 'internal', title: 'Community spotlight blog', description: 'Turn these discoveries into a sourced article for your community.', prompt: `Draft a community spotlight blog as a saved document using this research. Cite sources and preserve all unknowns.\n${context}` },
    { kind: 'event', connector: 'eventbrite', title: 'Explore a community gathering', description: 'Develop a gathering idea with a researched partner or venue; confirm availability first.', prompt: `Develop an event idea from this research, then prepare an Eventbrite draft only once date, venue and budget are confirmed. Ask one question at a time. Do not invent availability or partnership interest.\n${context}` },
    { kind: 'post', connector: 'linkedin', title: 'Share a local discovery', description: 'Draft a LinkedIn post connecting a discovery to your mission.', prompt: `Draft a sourced LinkedIn community spotlight with a photo using this research. Preserve unknowns. Prepare it for approval; do not claim a partnership exists.\n${context}` },
  ];
}