import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const decideApproval = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ approvalId: z.string().uuid(), mode: z.enum(['once', 'always']) }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: row, error } = await db.from('approvals').select('id, payload, title').eq('id', data.approvalId).eq('user_id', context.userId).eq('status', 'pending').maybeSingle();
    if (error) throw error;
    if (!row) throw new Error('This approval has already been decided.');
    const { getApprovalScope, dispatchApproval } = await import('./approvals.server');
    if (data.mode === 'always') {
      const scope = await getApprovalScope(db, context.userId, row.payload);
      if (!scope) throw new Error('This action needs one-time approval; connect the account first if applicable.');
      const { error: saved } = await db.from('approval_preferences').upsert({ user_id: context.userId, scope_key: scope, label: row.title }, { onConflict: 'user_id,scope_key' });
      if (saved) throw saved;
    }
    const { data: claimed, error: claimError } = await db.from('approvals').update({ status: 'approved', approval_mode: data.mode, resolved_at: new Date().toISOString() }).eq('id', row.id).eq('user_id', context.userId).eq('status', 'pending').select('id').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) throw new Error('This approval has already been decided.');
    return dispatchApproval(db, context.userId, row.id, row.payload);
  });