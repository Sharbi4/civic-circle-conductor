import { generateResponse } from "@lovable.dev/ai-gateway";
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const MAX_BYTES = 10_000_000;

/** Only public https hosts; blocks localhost/private ranges so a page can't make us fetch internal URLs. */
export function safePdfUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.)/i.test(u.hostname)) return null;
    return u;
  } catch { return null; }
}

async function fetchPdf(raw: string): Promise<Uint8Array> {
  let url = safePdfUrl(raw);
  for (let hop = 0; url && hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (res.status >= 300 && res.status < 400) { url = safePdfUrl(new URL(res.headers.get("location") ?? "", url).href); continue; }
    if (!res.ok) throw new Error(`The venue site returned ${res.status} for the application.`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new Error("The application file is too large.");
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("That link is not a PDF file.");
    return bytes;
  }
  throw new Error("The application link is not a safe public web address.");
}

/** Downloads a venue's PDF application, has the AI fill its fields from what Civi knows, and saves the filled copy privately. */
export async function fillPdfApplication(db: SupabaseClient<Database>, userId: string, threadId: string, pdfUrl: string): Promise<string> {
  const bytes = await fetchPdf(pdfUrl);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const fields = form.getFields().slice(0, 200);
  const [{ data: org }, { data: msgs }] = await Promise.all([
    db.from("organizations").select("name, mission, address, contact_name, contact_email, contact_phone, website").eq("user_id", userId).maybeSingle(),
    db.from("messages").select("role, content").eq("thread_id", threadId).eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);
  const context = `Organization: ${JSON.stringify(org ?? {})}\nRecent chat (newest first):\n${(msgs ?? []).map((m) => `${m.role}: ${m.content.slice(0, 1500)}`).join("\n")}`;
  if (!fields.length) {
    // Flat/scanned PDF: no fillable fields. Read it and return ready-to-copy answers instead.
    return `This application is a flat PDF with no fillable boxes, so I couldn't type into it directly. [Open the original](${pdfUrl}) — print or sign it, and use the details from this chat. Ask me for a ready-to-copy answer sheet if useful.`;
  }
  const spec = fields.map((f) => {
    const kind = f instanceof PDFTextField ? "text" : f instanceof PDFCheckBox ? "checkbox" : f instanceof PDFDropdown ? `choice:${f.getOptions().join("|")}` : f instanceof PDFRadioGroup ? `choice:${f.getOptions().join("|")}` : "other";
    return { name: f.getName(), kind };
  }).filter((f) => f.kind !== "other");
  const res = await generateResponse({
    model: "openai/gpt-6.1-terra",
    instructions: "You fill venue rental applications for a community organization. Return only JSON: {\"values\":{fieldName:value},\"missing\":[plain-language questions]}. Use only facts in the context; never invent insurance numbers, IDs, signatures, card or bank details — leave those out and list them in missing. Checkbox values are true/false; choice values must be one of the listed options.",
    input: `Fields: ${JSON.stringify(spec)}\n\n${context}`,
  });
  let text = "";
  for (const item of res.output ?? []) if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text") text += c.text;
  let parsed: { values?: Record<string, unknown>; missing?: string[] } = {};
  try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { /* empty fill */ }
  let filled = 0;
  for (const [name, value] of Object.entries(parsed.values ?? {})) {
    try {
      const f = form.getField(name);
      if (f instanceof PDFTextField && typeof value === "string" && value.trim()) { f.setText(value.slice(0, 2000)); filled++; }
      else if (f instanceof PDFCheckBox && value === true) { f.check(); filled++; }
      else if ((f instanceof PDFDropdown || f instanceof PDFRadioGroup) && typeof value === "string" && f.getOptions().includes(value)) { f.select(value); filled++; }
    } catch { /* unknown field name */ }
  }
  const out = await pdf.save();
  const path = `${userId}/applications/${crypto.randomUUID()}.pdf`;
  const { error } = await db.storage.from("event-images").upload(path, out, { contentType: "application/pdf" });
  if (error) throw new Error("Could not save the filled application.");
  const { data: signed } = await db.storage.from("event-images").createSignedUrl(path, 7 * 24 * 3600);
  const missing = (parsed.missing ?? []).slice(0, 10).map((q) => `- ${String(q).slice(0, 200)}`).join("\n");
  return `📄 **Filled application ready** — I completed ${filled} of ${spec.length} boxes. [Download the filled PDF](${signed?.signedUrl ?? "#"}) (link works for 7 days).${missing ? `\n\nStill needed before it can be sent:\n${missing}` : ""}\n\nNothing has been submitted or emailed. Review it, add any signature, then tell me to send it.`;
}
