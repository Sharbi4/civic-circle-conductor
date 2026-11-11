import { GatewayError } from "@lovable.dev/ai-gateway";

export class UsageLimitError extends Error {}
export async function reserveUsage(userId: string, kind: "ai" | "browser", units = 1) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data, error } = await db.rpc("reserve_org_usage", { p_user: userId, p_kind: kind, p_units: units });
  if (error || !data) throw new UsageLimitError("Organization usage limit reached or paid work paused. Review Usage controls in My account.");
}
export async function checkOrgWork(userId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data, error } = await db.from("organizations").select("automation_paused, usage_pause_reason").eq("user_id", userId).single();
  if (error || !data || data.automation_paused || data.usage_pause_reason) throw new UsageLimitError("Organization paid work is paused. Review Usage controls in My account.");
}
export async function noteUsageFailure(userId: string, error: unknown) {
  const status = error instanceof GatewayError ? error.httpStatus : /\[(402|403|429)\]/.exec(String(error))?.[1];
  if (![402, 403, 429].includes(Number(status))) return;
  const reason = Number(status) === 402 ? "AI or browser credits exhausted" : Number(status) === 403 ? "Provider access denied — restore access before resuming" : "Rate limited — paid work paused for review";
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  await db.from("organizations").update({ usage_pause_reason: reason }).eq("user_id", userId);
}