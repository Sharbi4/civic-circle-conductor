/** Shared event-cover helpers. Server-only — import only from server function handlers. */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Downloads a user-uploaded picture from the event-images bucket, scoped to the owning user. */
export async function loadEventImage(
  supabase: SupabaseClient,
  userId: string,
  path?: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string } | undefined> {
  if (!path) return undefined;
  if (!path.startsWith(`${userId}/`)) throw new Error("Image not found");
  const { data: f, error } = await supabase.storage.from("event-images").download(path);
  if (error || !f) throw new Error("Couldn't read the uploaded image");
  return { bytes: new Uint8Array(await f.arrayBuffer()), type: f.type || "image/jpeg" };
}

/** Builds cover bytes: the user's own upload as-is, an AI remix of their inspiration picture, or a fresh AI image. */
export async function buildCoverBytes(
  platform: string,
  opts: { prompt: string; cover?: Uint8Array<ArrayBuffer> | undefined; inspiration?: { bytes: Uint8Array<ArrayBuffer>; type: string } | undefined },
): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string }> {
  if (opts.cover) return { bytes: opts.cover, type: "image/jpeg" };
  const fullPrompt = `${platform} event cover image, wide banner composition with the subject centered and important details away from the top and bottom edges. No small text. ${opts.prompt}`;
  if (opts.inspiration) {
    const { editImage } = await import("@lovable.dev/ai-gateway");
    const img = await editImage({
      model: "openai/gpt-image-2",
      image: new Blob([opts.inspiration.bytes], { type: opts.inspiration.type }),
      prompt: `Use the attached picture as inspiration (style, colors, logo or subject). ${fullPrompt}`,
      size: "1536x1024",
      output_format: "jpeg",
    });
    const b64 = img.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");
    return { bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), type: "image/jpeg" };
  }
  const { generateImage } = await import("@lovable.dev/ai-gateway");
  const img = await generateImage({
    model: "openai/gpt-image-2.5-sunburst", prompt: fullPrompt, size: "1792x1024", output_format: "jpeg", quality: "high",
  });
  const b64 = img.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");
  return { bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), type: "image/jpeg" };
}

/** Reads pixel size from JPEG/PNG/WebP headers (no image library needed on the edge). */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50) return { width: (b[16]! << 24 | b[17]! << 16 | b[18]! << 8 | b[19]!) >>> 0, height: (b[20]! << 24 | b[21]! << 16 | b[22]! << 8 | b[23]!) >>> 0 };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1]!;
      const len = b[i + 2]! << 8 | b[i + 3]!;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: b[i + 5]! << 8 | b[i + 6]!, width: b[i + 7]! << 8 | b[i + 8]! };
      i += 2 + len;
    }
    return null;
  }
  if (b[8] === 0x57 && b[9] === 0x45 && b[12] === 0x56 && b[15] === 0x58) return { width: 1 + (b[24]! | b[25]! << 8 | b[26]! << 16), height: 1 + (b[27]! | b[28]! << 8 | b[29]! << 16) };
  return null;
}

/** Centered 2:1 crop box (Eventbrite's banner shape) for an image of this size. */
export function bannerCrop(width: number, height: number) {
  if (width / height > 2) { const w = Math.round(height * 2); return { top_left: { x: Math.round((width - w) / 2), y: 0 }, width: w, height }; }
  const h = Math.round(width / 2);
  return { top_left: { x: 0, y: Math.round((height - h) / 2) }, width, height: h };
}
