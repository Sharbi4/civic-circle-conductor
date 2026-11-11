import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Only provider handlers call this, after verifying an approval and receiving provider success.
export async function recordActionReceipt(db: SupabaseClient<Database>, userId: string, approvalId: string, result: { action: string; platform: string; account: string; url?: string; details?: string }) {
  const { data: ap } = await db.from("approvals").select("activity_id, status, resolved_at").eq("id", approvalId).eq("user_id", userId).single();
  if (!ap || ap.status !== "approved") throw new Error("Receipt requires an approved action.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("action_receipts").upsert({ user_id: userId, activity_id: ap.activity_id, approval_id: approvalId, action: result.action, platform: result.platform, account_name: result.account, object_url: result.url ?? null, approval_required: true, approved_at: ap.resolved_at, details: result.details ?? "" }, { onConflict: "approval_id" });
  if (error) { console.error("Receipt save failed", error.message); return; }
  await db.from("approvals").update({ execution_status: "completed" }).eq("id", approvalId);
}