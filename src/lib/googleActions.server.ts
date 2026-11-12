import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { GMAIL_SCOPES } from "./gmail.functions";
import { GOOGLE_APPS } from "./googleApps.functions";

const GATEWAY = "https://connector-gateway.lovable.dev";
type Db = SupabaseClient<Database>;
type Cid = "google_mail" | "google_calendar" | "google_drive";
const SCOPES: Record<Cid, string[]> = { google_mail: GMAIL_SCOPES, google_calendar: [...GOOGLE_APPS.google_calendar.scopes], google_drive: [...GOOGLE_APPS.google_drive.scopes] };

async function call(userId: string, connectorId: Cid, path: string, init?: RequestInit) {
  const { getConnectionForUser } = await import("./appUserConnections.server");
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const c = await getConnectionForUser(userId, connectorId);
  if (!c) throw new Error(`${label(connectorId)} isn't connected — connect it in Connectors.`);
  const res = await callAsAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: c.key, connectorId, path, ...(init ? { init } : {}), requiredScopes: SCOPES[connectorId] });
  if (await appUserReconnectRequired(res)) throw new Error(`${label(connectorId)} access needs to be renewed — press Reconnect next to it in Connectors.`);
  if (!res.ok) { const body = await res.text(); console.error(`${connectorId} ${path} [${res.status}]: ${body.slice(0, 500)}`); throw new Error(`${label(connectorId)} said no (${res.status}): ${body.slice(0, 200)}`); }
  return res;
}
const label = (c: Cid) => (c === "google_mail" ? "Gmail" : c === "google_calendar" ? "Google Calendar" : "Google Drive");

export async function connectedGoogle(userId: string) {
  const { getConnectionForUser } = await import("./appUserConnections.server");
  const [m, c, d] = await Promise.all((["google_mail", "google_calendar", "google_drive"] as const).map((x) => getConnectionForUser(userId, x).catch(() => null)));
  return { gmail: m?.accountName ?? (m ? "Gmail" : null), calendar: c?.accountName ?? (c ? "Calendar" : null), drive: d?.accountName ?? (d ? "Drive" : null) };
}

/** Recent inbox messages (metadata + snippet) for Civi to read and summarize. */
export async function readInbox(userId: string, query = "in:inbox", max = 10) {
  const list = (await (await call(userId, "google_mail", `/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(query)}`)).json()) as { messages?: { id: string }[] };
  const ids = (list.messages ?? []).map((m) => m.id);
  const msgs = await Promise.all(ids.map(async (id) => {
    const m = (await (await call(userId, "google_mail", `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)).json()) as { id: string; snippet?: string; labelIds?: string[]; payload?: { headers?: { name: string; value: string }[] } };
    const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
    return { id: m.id, from: h("From"), subject: h("Subject"), date: h("Date"), unread: m.labelIds?.includes("UNREAD") ?? false, snippet: (m.snippet ?? "").slice(0, 300) };
  }));
  return msgs;
}

export async function upcomingEvents(userId: string, max = 10) {
  const j = (await (await call(userId, "google_calendar", `/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=${max}&timeMin=${encodeURIComponent(new Date().toISOString())}`)).json()) as { items?: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; location?: string }[] };
  return (j.items ?? []).map((e) => ({ id: e.id, summary: e.summary ?? "(no title)", start: e.start?.dateTime ?? e.start?.date ?? "", location: e.location ?? "" }));
}

const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const hdr = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);
const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

export const gmailSendSchema = z.object({ kind: z.literal("gmail_send"), to: z.string().min(3).max(500), cc: z.string().max(500).nullish(), subject: z.string().min(1).max(300), body: z.string().min(1).max(20000), reply_to: z.string().max(100).nullish() });
export const calendarSchema = z.object({ kind: z.enum(["calendar_create", "calendar_update"]), event_id: z.string().max(200).nullish(), summary: z.string().max(300).nullish(), start: z.string().max(40).nullish(), end: z.string().max(40).nullish(), timezone: z.string().max(60).nullish(), location: z.string().max(500).nullish(), description: z.string().max(8000).nullish(), attendees: z.array(z.string().email()).max(50).nullish() });
export const driveDocSchema = z.object({ kind: z.literal("drive_doc"), title: z.string().min(1).max(200), content: z.string().min(1).max(100000) });

export async function executeGoogleApproval(db: Db, userId: string, approvalId: string) {
  const { data: ap } = await db.from("approvals").select("status, payload, thread_id").eq("id", approvalId).maybeSingle();
  if (!ap || ap.status !== "approved") throw new Error("This action isn't approved.");
  const say = async (content: string) => { if (ap.thread_id) await db.from("messages").insert({ thread_id: ap.thread_id, user_id: userId, role: "assistant", content }); };
  const kind = (ap.payload as { kind?: string })?.kind;

  if (kind === "gmail_send") {
    const p = gmailSendSchema.parse(ap.payload);
    let threadId: string | undefined; let refs = "";
    if (p.reply_to) {
      const m = (await (await call(userId, "google_mail", `/gmail/v1/users/me/messages/${encodeURIComponent(p.reply_to)}?format=metadata&metadataHeaders=Message-ID`)).json()) as { threadId?: string; payload?: { headers?: { name: string; value: string }[] } };
      threadId = m.threadId; const mid = m.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value;
      if (mid) refs = `In-Reply-To: ${mid}\r\nReferences: ${mid}\r\n`;
    }
    const raw = b64(`To: ${clean(p.to)}\r\n${p.cc ? `Cc: ${clean(p.cc)}\r\n` : ""}Subject: ${hdr(clean(p.subject))}\r\n${refs}MIME-Version: 1.0\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${p.body}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await call(userId, "google_mail", "/gmail/v1/users/me/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(threadId ? { raw, threadId } : { raw }) });
    await say(`✅ Email sent to **${clean(p.to)}** — “${clean(p.subject)}”.`);
    return { ok: true };
  }
  if (kind === "calendar_create" || kind === "calendar_update") {
    const p = calendarSchema.parse(ap.payload);
    const tz = p.timezone || "America/Phoenix";
    const body: Record<string, unknown> = {};
    if (p.summary) body["summary"] = p.summary;
    if (p.location) body["location"] = p.location;
    if (p.description) body["description"] = p.description;
    if (p.start) body["start"] = p.start.length <= 10 ? { date: p.start } : { dateTime: p.start, timeZone: tz };
    if (p.end) body["end"] = p.end.length <= 10 ? { date: p.end } : { dateTime: p.end, timeZone: tz };
    if (p.attendees?.length) body["attendees"] = p.attendees.map((email) => ({ email }));
    if (kind === "calendar_create") {
      if (!p.summary || !p.start || !p.end) throw new Error("The event needs a title, start and end.");
      const e = (await (await call(userId, "google_calendar", "/calendar/v3/calendars/primary/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json()) as { htmlLink?: string };
      await say(`✅ Added **${p.summary}** to your Google Calendar.${e.htmlLink ? ` [Open in Calendar](${e.htmlLink})` : ""}`);
    } else {
      if (!p.event_id) throw new Error("Which calendar event should change?");
      const e = (await (await call(userId, "google_calendar", `/calendar/v3/calendars/primary/events/${encodeURIComponent(p.event_id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json()) as { htmlLink?: string; summary?: string };
      await say(`✅ Updated **${e.summary ?? "the event"}** on your Google Calendar.${e.htmlLink ? ` [Open in Calendar](${e.htmlLink})` : ""}`);
    }
    return { ok: true };
  }
  if (kind === "drive_doc") {
    const p = driveDocSchema.parse(ap.payload);
    const boundary = `civi${crypto.randomUUID()}`;
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: p.title, mimeType: "application/vnd.google-apps.document" })}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${p.content}\r\n--${boundary}--`;
    const f = (await (await call(userId, "google_drive", "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipart })).json()) as { webViewLink?: string };
    await say(`✅ Created the Google Doc **${p.title}** in your Drive.${f.webViewLink ? ` [Open it](${f.webViewLink})` : ""}`);
    return { ok: true };
  }
  throw new Error("Unknown Google action");
}
