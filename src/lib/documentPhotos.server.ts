import type { SupabaseClient } from "@supabase/supabase-js";
import { documentPhotoQuery, reusablePhotoLicense, safeWikimediaPhoto } from "./documentStandards";

type CommonsPage = { title?: string; imageinfo?: { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] };
const clean = (value: string) => value.replace(/<[^>]*>/g, "").replace(/[\[\]()*_`]/g, "").trim().slice(0, 240);

/** Real licensed photos only; persist bytes privately, never hotlink source images. */
export async function addDocumentPhotos(db: SupabaseClient, owner: string, title: string, body: string): Promise<string> {
  const query = documentPhotoQuery(title, body);
  const params = new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: `${query} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "8", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1200" });
  try {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "CiviMeet/1.0 (https://civimeet.com)" } });
    if (!response.ok) throw new Error("Photo source unavailable");
    const result = await response.json() as { query?: { pages?: Record<string, CommonsPage> } };
    for (const page of Object.values(result.query?.pages ?? {})) {
      const photo = page.imageinfo?.[0];
      const license = photo?.extmetadata?.["LicenseShortName"]?.value ?? "";
      if (!photo?.thumburl || !photo.descriptionurl || !reusablePhotoLicense(license) || !safeWikimediaPhoto(photo.thumburl)) continue;
      const source = new URL(photo.descriptionurl);
      if (source.protocol !== "https:" || source.hostname !== "commons.wikimedia.org") continue;
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
  return `${body}\n\n## Photography note\nA relevant real, reusable photograph could not be retrieved. Add an organization-owned photo before external distribution; no generated or unverified image has been substituted.`;
}