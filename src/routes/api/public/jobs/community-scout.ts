import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
// Legacy callback delegates to task-based scheduler; no separate scout cron.
export const Route = createFileRoute('/api/public/jobs/community-scout')({server:{handlers:{POST:async({request})=>{
 const failure=await authenticateCronRequest(request); if(failure) return failure;
 const {runSharedJob}=await import('@/lib/jobs.server');return Response.json(await runSharedJob('scheduler'));
}}}});
