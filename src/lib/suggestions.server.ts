import { noLongDashes, withNoDashes } from "./punctuation.shared";
import { isScoutBriefing } from "./discovery.shared";
import { generateResponse } from "@lovable.dev/ai-gateway";

export type Suggestion = { label: string; prompt: string; browser_goal?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Reviews a chat plus the org's state and returns 2-4 obvious next steps. Cached per thread until new messages arrive. */
export async function generateSuggestions(supabase: Db, userId: string, threadId: string, force = false): Promise<Suggestion[]> {
  const { data: msgs } = await supabase.from("messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(16);
  const count = (msgs ?? []).length;
  const { data: cached } = await supabase.from("suggestions").select("items, based_on_count, created_at").eq("thread_id", threadId).maybeSingle();
  const { count: total } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("thread_id", threadId);
  if (!force && cached && cached.based_on_count === (total ?? count)) return cached.items as Suggestion[];

  const [{ data: org }, { data: aps }, { data: browsers }] = await Promise.all([
    supabase.from("organizations").select("name, mission, facebook_setup_location").eq("user_id", userId).maybeSingle(),
    supabase.from("approvals").select("title, status").eq("user_id", userId).eq("status", "pending").limit(10),
    supabase.from("browser_sessions").select("site, signed_in, agent_status, goal").eq("thread_id", threadId).eq("status", "running").limit(1),
  ]);
  const transcript = [...(msgs ?? [])].filter((m: { content: string }) => !isScoutBriefing(m.content)).reverse().map((m: { role: string; content: string }) => `${m.role}: ${m.content.slice(0, 600)}`).join("\n");
  const instructions = [
    "You are Civi, a proactive AI community organizer. Review this chat and the org's state, then propose the 2-4 most obvious next moves, like quick-reply chips.",
    "North star: keep the org consistently engaged with its community and turn that into successful events with follow-up (engage → strategize → organize → fund → promote → run → follow up). If no touchpoint happened recently, propose one. Prefer, when relevant: Facebook Page TLC (add contact details, update description, photos), follow-ups on unfinished tasks and pending approvals, posts & events (draft a scheduled post, plan the next event), finding/joining more relevant groups.",
    "Each label is 2-6 words, action-first (e.g. \"Add Page contact details\"). Each prompt is what the organizer would say to you to do it. If it needs the live browser (Facebook etc.) and a browser is open, set browser_goal to a concrete browser instruction that never joins, posts or submits without approval.",
    'Reply ONLY JSON: {"items":[{"label":"...","prompt":"...","browser_goal":"optional"}]}',
  ].join("\n");
  const input = `Org: ${org?.name ?? "?"}, ${org?.mission ?? ""}\nLocation: ${org?.facebook_setup_location ?? "unknown"}\nPending approvals: ${(aps ?? []).map((a: { title: string }) => a.title).join("; ") || "none"}\nOpen browser: ${browsers?.[0] ? `${browsers[0].site ?? "?"} signed_in=${browsers[0].signed_in} status=${browsers[0].agent_status}` : "none"}\n\nChat:\n${transcript || "(empty)"}`;
  const res = await generateResponse({ model: "openai/gpt-6.1-terra", instructions: withNoDashes(instructions), input });
  let text = "";
  for (const item of res.output ?? []) if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text") text += noLongDashes(c.text);
  let items: Suggestion[] = [];
  try {
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { items?: Suggestion[] };
    items = (parsed.items ?? []).filter((x) => x?.label && x?.prompt).slice(0, 4).map((x) => ({
      label: String(x.label).slice(0, 48), prompt: String(x.prompt).slice(0, 1000),
      ...(x.browser_goal ? { browser_goal: String(x.browser_goal).slice(0, 1000) } : {}),
    }));
  } catch { items = []; }
  await supabase.from("suggestions").upsert({ user_id: userId, thread_id: threadId, items, based_on_count: total ?? count, created_at: new Date().toISOString() }, { onConflict: "thread_id" });
  return items;
}
