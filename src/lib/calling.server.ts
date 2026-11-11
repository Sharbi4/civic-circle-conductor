import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CALL_SAFETY, callRequestSchema, completedCallReport, safeCallText } from "./calling.shared";

async function voice(path: string, body?: unknown) {
  const key = process.env["ELEVENLABS_API_KEY"];
  if (!key) throw new Error("Connect ElevenLabs before placing calls.");
  const response = await fetch(`https://api.elevenlabs.io/v1/convai${path}`, { method: body ? "POST" : "GET", headers: { "xi-api-key": key, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual" });
  if (!response.ok) throw new Error(`Calling service rejected the request [${response.status}]. Check phone setup and account permissions; no automatic retry was made.`);
  return response.json() as Promise<Record<string, unknown>>;
}

export async function syncVenueCalls(db: SupabaseClient<Database>, userId: string, threadId?: string) {
  let query = db.from("approvals").select("id,payload").eq("user_id", userId).eq("status", "approved")
    .eq("payload->>kind", "venue_call").eq("payload->>call_state", "initiated").order("created_at").limit(5);
  if (threadId) query = query.eq("payload->>thread", threadId);
  const { data: calls, error } = await query;
  if (error) throw new Error("Could not check saved calls.");
  let completed = 0;
  let active = 0;
  let unavailable = 0;
  for (const call of calls ?? []) {
    const payload = call.payload as Record<string, unknown>;
    const parsed = callRequestSchema.safeParse(payload);
    if (!parsed.success || typeof payload["conversation_id"] !== "string" || !/^[a-zA-Z0-9_-]+$/.test(payload["conversation_id"]) || typeof payload["agent_id"] !== "string") { unavailable++; continue; }
    const { data: thread } = await db.from("threads").select("id").eq("id", parsed.data.thread).eq("user_id", userId).maybeSingle();
    if (!thread) { unavailable++; continue; }
    try {
      const conversation = await voice(`/conversations/${encodeURIComponent(payload["conversation_id"])}`);
      if (conversation["agent_id"] !== payload["agent_id"] || conversation["conversation_id"] !== payload["conversation_id"]) { unavailable++; continue; }
      const report = completedCallReport(conversation);
      if (!report) { active++; continue; }
      // Reusing this approval's UUID makes report insertion idempotent across chat and job refreshes.
      const { error: insertError } = await db.from("messages").insert({ id: call.id, user_id: userId, thread_id: parsed.data.thread, role: "assistant", content: `**Call report — ${safeCallText(parsed.data.recipient)}**\n\n${report.text}\n\nNo binding reservation or payment was authorized. Review availability, written terms and the exact cost before approving booking or secure checkout.` });
      if (insertError && insertError.code !== "23505") throw new Error("Could not save the call report.");
      const { error: saveError } = await db.from("approvals").update({ payload: { ...payload, call_state: report.state, reported_at: new Date().toISOString() } }).eq("id", call.id).eq("user_id", userId).eq("payload->>call_state", "initiated");
      if (saveError) throw new Error("Could not save completed call status.");
      completed++;
    } catch { unavailable++; }
  }
  return { completed, active, unavailable };
}

export async function executeVenueCall(db: SupabaseClient<Database>, userId: string, approvalId: string) {
  const { data: approval } = await db.from("approvals").select("payload").eq("id", approvalId).eq("user_id", userId).eq("status", "approved").single();
  const request = callRequestSchema.parse(approval?.payload);
  const { data: thread } = await db.from("threads").select("id").eq("id", request.thread).eq("user_id", userId).maybeSingle();
  if (!thread) throw new Error("Call chat not found.");
  const { data: org } = await db.from("organizations").select("name").eq("user_id", userId).maybeSingle();
  const numbers = await voice("/phone-numbers") as unknown;
  const phone = (Array.isArray(numbers) ? numbers : []).find((n: { supports_outbound?: boolean; provider?: string }) => n.supports_outbound && n.provider === "twilio") as { phone_number_id?: string } | undefined;
  if (!phone?.phone_number_id) throw new Error("Import an outbound Twilio number into ElevenLabs before placing calls.");
  const agent = await voice("/agents/create", { name: `Civi availability — ${approvalId}`, conversation_config: { agent: { first_message: `Hello, I'm Civi, an AI assistant calling for ${safeCallText(org?.name) || "a community organization"} about room availability. Is now a suitable time?`, prompt: { prompt: `${CALL_SAFETY}\nOrganization: ${safeCallText(org?.name) || "Community organization"}\nApproved recipient: ${safeCallText(request.recipient)}\nApproved brief: ${safeCallText(request.brief)}` } }, conversation: { max_duration_seconds: 300 } } });
  if (typeof agent["agent_id"] !== "string") throw new Error("Calling agent could not be prepared.");
  // Persist the provider boundary before placing the non-idempotent call.
  const { error: boundaryError } = await db.from("approvals").update({ payload: { ...request, agent_id: agent["agent_id"], call_state: "starting" } }).eq("id", approvalId).eq("user_id", userId);
  if (boundaryError) throw new Error("Could not save the call authorization; no call was placed.");
  try {
    const result = await voice("/twilio/outbound-call", { agent_id: agent["agent_id"], agent_phone_number_id: phone.phone_number_id, to_number: request.to, call_recording_enabled: false });
    if (result["success"] !== true) throw new Error("The calling service did not confirm call initiation.");
    const { error: outcomeError } = await db.from("approvals").update({ payload: { ...request, agent_id: agent["agent_id"], conversation_id: typeof result["conversation_id"] === "string" ? result["conversation_id"] : null, call_state: "initiated" } }).eq("id", approvalId).eq("user_id", userId);
    if (outcomeError) throw outcomeError;
    await db.from("messages").insert({ user_id: userId, thread_id: request.thread, role: "assistant", content: `Call initiated to ${request.recipient} for availability research. This does not mean the recipient answered or the room is booked. No payment or binding reservation is authorized.` });
    return { started: true };
  } catch {
    throw new Error("Call outcome needs review — the service may have started the call. Check ElevenLabs call history before approving any new attempt; no automatic redial was made.");
  }
}