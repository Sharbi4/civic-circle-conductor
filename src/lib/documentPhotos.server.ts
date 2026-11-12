import type { SupabaseClient } from "@supabase/supabase-js";
import { documentPhotoQuery, photoMatchesSubject, photoSubjectWords, reusablePhotoLicense, safeWikimediaPhoto } from "./documentStandards";

type CommonsPage = { title?: string; imageinfo?: { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] };
const clean = (value: string) => value.replace(/<[^>]*>/g, "").replace(/[\[\]()*_`]/g, "").trim().slice(0, 240);

/** Real licensed photos only; persist bytes privately, never hotlink source images. */
export async function addDocumentPhotos(db: SupabaseClient, owner: string, title: string, body: string): Promise<string | null> {
  const subject = photoSubjectWords(title);
  if (!subject.length) return null;
  const location = documentPhotoQuery(title, body).replace(/ city$/, "");
  const query = `${subject.slice(0, 3).join(" ")}${/^[A-Z]/.test(location) && !subject.includes(location.toLowerCase()) ? ` ${location}` : ""}`;
  const params = new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: `${query} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "8", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1200" });
  try {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "CiviMeet/1.0 (https://civimeet.com)" } });
    if (!response.ok) throw new Error("Photo source unavailable");
    const result = await response.json() as { query?: { pages?: Record<string, CommonsPage> } };
    for (const page of Object.values(result.query?.pages ?? {})) {
      const photo = page.imageinfo?.[0];
      const license = photo?.extmetadata?.["LicenseShortName"]?.value ?? "";
      if (!photoMatchesSubject(page.title ?? "", subject)) continue;
      if (!photo?.thumburl || !photo.descriptionurl || !reusablePhotoLicense(license) || !safeWikimediaPhoto(photo.thumburl)) continue;
      const source = new URL(photo.descriptionurl);
      if (source.protocol !== "https:" || source.hostname !== "commons.wikimedia.org") continue;
      // Vary pictures: skip a photo this organization's documents already use.
      const { count: used } = await db.from("documents").select("id", { count: "exact", head: true }).eq("user_id", owner).like("content", `%${source.href}%`);
      if (used) continue;
      const image = await fetch(photo.thumburl, { redirect: "manual", signal: AbortSignal.timeout(12000) });
      if (!image.ok || !/^image\/(jpeg|png|webp)(;|$)/.test(image.headers.get("content-type") ?? "")) continue;
      if (Number(image.headers.get("content-length")) > 6_000_000) continue;
      const bytes = await image.arrayBuffer();
      if (bytes.byteLength > 6_000_000) continue;
      const path = `${owner}/documents/${crypto.randomUUID()}.jpg`;
      const { error } = await db.storage.from("event-images").upload(path, bytes, { contentType: image.headers.get("content-type") ?? "image/jpeg" });
      if (error) continue;
      const label = clean(page.title?.replace(/^File:/, "").replace(/\.[^.]+$/, "") ?? query);
      const creator = clean(photo.extmetadata?.["Artist"]?.value ?? "See original source");
      return `![${label}](document-photo:${path})\n\n*Contextual photograph — ${label}. Not evidence of a partnership, confirmed venue or attendance. Photo: ${creator}. License: ${clean(license)}. [Original source and license](${source.href}).*\n\n${body.replace(/!\[[^\]]*\]\(https?:\/\/[^)]+\)/g, "")}`;
    }
  } catch { console.warn("Document photography unavailable; preserved document text"); }
  return null;
}

/** When no real licensed photo fits, Civi makes a clearly labeled illustration so no document ships without a picture. */
export async function addDocumentIllustration(db: SupabaseClient, owner: string, title: string, body: string, about: string): Promise<string | null> {
  const { generateImage } = await import("@lovable.dev/ai-gateway");
  const prompt = `Warm, professional editorial illustration (flat vector style, soft natural colors) to head a document titled "${title}". ${about} Show the spirit of the subject — community, place and purpose — with simple stylized figures and setting. No text, letters, numbers, logos or recognizable real people.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const img = await generateImage({ model: "openai/gpt-image-2.5-sunburst", prompt, size: "1536x1024", output_format: "jpeg", quality: "high" });
      const b64 = img.data?.[0]?.b64_json;
      if (!b64) continue;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const path = `${owner}/documents/${crypto.randomUUID()}.jpg`;
      const { error } = await db.storage.from("event-images").upload(path, bytes, { contentType: "image/jpeg" });
      if (error) continue;
      const label = clean(title);
      return `![Illustration for ${label}](document-photo:${path})\n\n*Illustration created by Civi for this document — not a photograph of an actual event, venue or attendees.*\n\n${body.replace(/!\[[^\]]*\]\(https?:\/\/[^)]+\)/g, "")}`;
    } catch (e) { console.warn("Document illustration attempt failed", e instanceof Error ? e.message : e); }
  }
  return null;
}