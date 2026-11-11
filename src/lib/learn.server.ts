import { generateResponse } from "@lovable.dev/ai-gateway";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Reads what happened since the last pass (messages, forms, approvals, tasks) and saves up to 6 new,
 * durable facts about the organization into its memory. Returns how many were saved.
 */
export async function learnAboutOrg(db: Db, userId: string, since: string | null): Promise<number> {
  const after = since ?? new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: msgs }, { data: mems }, { data: org }, { data: aps }, { data: tasks }] = await Promise.all([
    db.from("messages").select("role, content, created_at").eq("user_id", userId).gt("created_at", after).order("created_at", { ascending: true }).limit(60),
    db.from("memories").select("content").eq("user_id", userId).order("created_at", { ascending: false }).limit(120),
    db.from("organizations").select("name, mission").eq("user_id", userId).maybeSingle(),
    db.from("approvals").select("title, status").eq("user_id", userId).gt("created_at", after).limit(15),
    db.from("tasks").select("title, done, due_date").eq("user_id", userId).gt("created_at", after).limit(15),
  ]);
  if (!msgs?.length && !aps?.length && !tasks?.length) return 0;
  const instructions = [
    "You are Civi's memory keeper for one community organization. From the new activity, extract NEW durable facts worth remembering long-term to serve them better:",
    "people & roles, partners/vendors/venues, neighborhoods and audiences, recurring events and dates, preferences (tone, platforms, times, budget), what they approved or rejected and why, goals, lessons learned.",
    "Skip small talk, one-off chatter, anything already in known memory, and anything sensitive (passwords, payment details, personal ID numbers).",
    'Each fact is one short standalone sentence. Reply ONLY JSON: {"facts":["..."]} (0-6 facts; empty if nothing new).',
  ].join("\n");
  const input = [
    `Org: ${org?.name ?? "?"} — ${org?.mission ?? ""}`,
    `Known memory:\n- ${(mems ?? []).map((m: { content: string }) => m.content.slice(0, 200)).join("\n- ") || "(none)"}`,
    `New chat:\n${(msgs ?? []).map((m: { role: string; content: string }) => `${m.role}: ${m.content.slice(0, 500)}`).join("\n") || "(none)"}`,
    `Approvals: ${(aps ?? []).map((a: { title: string; status: string }) => `${a.title} → ${a.status}`).join("; ") || "none"}`,
    `New tasks: ${(tasks ?? []).map((t: { title: string }) => t.title).join("; ") || "none"}`,
  ].join("\n\n");
  const res = await generateResponse({ model: "openai/gpt-6.1-terra", instructions, input });
  let text = "";
  for (const item of res.output ?? []) if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text") text += c.text;
  let facts: string[] = [];
  try { facts = (JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).facts ?? []) as string[]; } catch { facts = []; }
  const known = new Set((mems ?? []).map((m: { content: string }) => m.content.trim().toLowerCase()));
  facts = facts.map((f) => String(f).trim().slice(0, 400)).filter((f) => f.length > 8 && !known.has(f.toLowerCase())).slice(0, 6);
  if (facts.length) await db.from("memories").insert(facts.map((content) => ({ user_id: userId, content: `🧠 ${content}`, source: "learned" })));
  return facts.length;
}
