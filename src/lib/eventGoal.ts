import { supabase } from "@/integrations/supabase/client";

export async function resetEventProgress(goalId: string) {
  const { error } = await supabase.from("tasks").update({ done: false, done_at: null }).eq("goal_id", goalId);
  if (error) throw error;
  await supabase.from("tasks").update({ done: false, done_at: null }).eq("id", goalId);
}

export async function saveEventEssentials(goalId: string, v: { budget: number | null; headcount: number | null; venue: string }) {
  const { data: u } = await supabase.auth.getUser();
  const { data: cur } = await supabase.from("event_profiles").select("goal_id").eq("goal_id", goalId).maybeSingle();
  const patch = { budget: v.budget, headcount: v.headcount, venue: v.venue, updated_at: new Date().toISOString() };
  const { error } = cur
    ? await supabase.from("event_profiles").update(patch).eq("goal_id", goalId)
    : await supabase.from("event_profiles").insert({ goal_id: goalId, user_id: u.user!.id, ...patch });
  if (error) throw error;
}

export async function uploadEventCover(goalId: string, file: File) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user!.id;
  const path = `${uid}/covers/${goalId}-${Date.now()}.${(file.name.split(".").pop() || "jpg").toLowerCase()}`;
  const { error } = await supabase.storage.from("event-images").upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { data: cur } = await supabase.from("event_profiles").select("goal_id").eq("goal_id", goalId).maybeSingle();
  const r = cur
    ? await supabase.from("event_profiles").update({ cover_path: path }).eq("goal_id", goalId)
    : await supabase.from("event_profiles").insert({ goal_id: goalId, user_id: uid, cover_path: path });
  if (r.error) throw r.error;
}

export async function signedCover(path: string | null | undefined) {
  if (!path) return null;
  const { data } = await supabase.storage.from("event-images").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// Scheduled tasks get their own chat (like ChatGPT scheduled tasks); future runs post there.
export async function openScheduledTaskChat(task: { id: string; title: string; thread_id?: string | null }) {
  if (task.thread_id) {
    const { data: t } = await supabase.from("threads").select("id, kind").eq("id", task.thread_id).maybeSingle();
    if (t?.kind === "scheduled") return t.id;
  }
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("threads").insert({ user_id: u.user!.id, kind: "scheduled", title: task.title }).select("id").single();
  if (error) throw error;
  await supabase.from("tasks").update({ thread_id: data.id }).eq("id", task.id);
  await supabase.from("messages").insert({ thread_id: data.id, user_id: u.user!.id, role: "assistant", content: `🕒 This is the chat for your scheduled task **${task.title}**. Each time it runs, I'll post the results here. Ask me to change what it does or when it runs.` });
  return data.id;
}
