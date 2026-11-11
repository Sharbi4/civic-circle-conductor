import { GatewayError } from '@lovable.dev/ai-gateway';

export async function noteJobFailure(userId: string, error: unknown) {
  const status = error instanceof GatewayError ? error.httpStatus : /\b(402|403|429)\b/.exec(String(error))?.[1];
  if (![402, 403, 429].includes(Number(status))) return;
  const reason = Number(status) === 402 ? 'AI or browser credits exhausted' : Number(status) === 403 ? 'Provider access denied — restore access before resuming' : 'Rate limited — background work paused for review';
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  await db.from('autopilot_state').upsert({ user_id: userId, paused_reason: reason });
}