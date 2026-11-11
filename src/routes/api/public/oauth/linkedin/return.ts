import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/oauth/linkedin/return')({
  server: { handlers: { GET: async ({ request }) => {
    const { handleDirectLinkedInCallback } = await import('@/lib/linkedinDirect.server');
    return handleDirectLinkedInCallback(request);
  } } },
});