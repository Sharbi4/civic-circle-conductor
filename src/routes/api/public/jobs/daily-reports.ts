import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
export const Route = createFileRoute('/api/public/jobs/daily-reports')({ server: { handlers: { POST: async ({request}) => {
 const failure = await authenticateCronRequest(request); if(failure) return failure;
 const {runSharedJob} = await import('@/lib/jobs.server');
 return Response.json(await runSharedJob('reports'));
} } } });
