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
