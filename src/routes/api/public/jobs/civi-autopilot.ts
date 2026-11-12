import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
// Compatibility target for callers deployed before the consolidated scheduler.
export const Route = createFileRoute('/api/public/jobs/civi-autopilot')({ server: { handlers: { POST: async ({request}) => {
 const failure=await authenticateCronRequest(request); if(failure) return failure;
 const {startSharedJob} = await import('@/lib/background.server');
 return Response.json(await startSharedJob('scheduler'));
} } } });
