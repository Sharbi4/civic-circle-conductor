import { encryptConnectionKey, decryptConnectionKey } from "@/lib/connectionKeyCrypto.server";

export async function saveConnectionKeyForUser(userId: string, connectorId: string, connectionAPIKey: string, accountName?: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
      account_name: accountName ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw error;
}

export async function getConnectionForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_user_connections")
    .select("connection_key_ciphertext, account_name")
    .eq("user_id", userId).eq("connector_id", connectorId).maybeSingle();
  if (error) throw error;
  return data ? { key: decryptConnectionKey(data.connection_key_ciphertext), accountName: data.account_name } : null;
}

/** Replaces a generic stored label ("Gmail account") with the real address once it can be read. */
export async function rememberAccountName(userId: string, connectorId: string, accountName: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("app_user_connections").update({ account_name: accountName }).eq("user_id", userId).eq("connector_id", connectorId).neq("account_name", accountName);
}

export async function deleteConnectionForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_user_connections").delete().eq("user_id", userId).eq("connector_id", connectorId);
  if (error) throw error;
}
