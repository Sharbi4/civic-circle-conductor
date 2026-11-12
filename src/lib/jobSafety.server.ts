import { GatewayError } from '@lovable.dev/ai-gateway';
import { PAUSE_ACCESS, PAUSE_CREDITS, PAUSE_RATE } from './background.shared';

/** 402 (credits), 403 (access) or 429 (rate limit) when the AI or a provider stopped the work, else null. */
export function quotaStop(error: unknown): 402 | 403 | 429 | null {
  const status = Number(error instanceof GatewayError ? error.httpStatus : /\b(402|403|429)\b/.exec(String(error))?.[1]);
  return status === 402 || status === 403 || status === 429 ? status : null;
}

export async function noteJobFailure(userId: string, error: unknown) {
  const status = quotaStop(error);
  if (!status) return;
  const reason = status === 402 ? PAUSE_CREDITS : status === 403 ? PAUSE_ACCESS : PAUSE_RATE;
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  await db.from('autopilot_state').upsert({ user_id: userId, paused_reason: reason });
}
