import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const takeDiscoveryAction = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ findingId: z.string().uuid(), ideaIndex: z.number().int().min(0).max(5) }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: finding, error } = await db.from('scout_findings').select('summary, ideas').eq('id', data.findingId).eq('user_id', context.userId).maybeSingle();
    if (error) throw error;
    if (!finding) throw new Error('This discovery is no longer available.');
    const { discoveryIdeas } = await import('./discovery.shared');
    const idea = discoveryIdeas(finding.ideas, finding.summary)[data.ideaIndex];
    if (!idea) throw new Error('This idea is no longer available.');
    if (idea.connector !== 'internal') {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const connection = idea.connector === 'eventbrite'
        ? await supabaseAdmin.from('connector_connections').select('id').eq('user_id', context.userId).eq('connector', idea.connector).maybeSingle()
        : await supabaseAdmin.from('app_user_connections').select('id').eq('user_id', context.userId).eq('connector_id', idea.connector).maybeSingle();
      if (connection.error) throw connection.error;
      if (!connection.data) return { needsConnection: idea.connector, threadId: null };
    }
    const agent = idea.connector === 'eventbrite' ? 'Eventbrite Agent' : idea.connector === 'linkedin' ? 'LinkedIn Agent' : 'X Agent';
    let query = db.from('threads').select('id').eq('user_id', context.userId);
    query = idea.connector === 'internal' ? query.eq('kind', 'main') : query.eq('kind', 'side').eq('title', agent);
    const { data: existing, error: threadError } = await query.maybeSingle();
    if (threadError) throw threadError;
    let threadId = existing?.id;
    if (!threadId) {
      const { data: created, error: createError } = await db.from('threads').insert({ user_id: context.userId, kind: idea.connector === 'internal' ? 'main' : 'side', title: idea.connector === 'internal' ? 'Main chat' : agent }).select('id').single();
      if (createError) throw createError;
      threadId = created.id;
    }
    const { runOrganizer } = await import('./organizer.server');
    await runOrganizer(db, context.userId, { threadId, content: `Take this Discovery action: ${idea.title}\n${idea.prompt}\nUse only the sources and facts in the discovery; verify missing details before execution. Follow the organization's approval preferences.` });
    return { needsConnection: null, threadId };
  });