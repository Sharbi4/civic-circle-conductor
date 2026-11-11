import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah — warm, clear

function key() {
  const k = process.env["ELEVENLABS_API_KEY"];
  if (!k) throw new Error("Voice isn't connected yet.");
  return k;
}

export const speakText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(1).max(4500) }).parse(d))
  .handler(async ({ data }) => {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key(), "Content-Type": "application/json" },
      body: JSON.stringify({ text: data.text, model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true } }),
    });
    if (!res.ok) { const b = await res.text(); console.error(`ElevenLabs TTS failed [${res.status}]: ${b}`); throw new Error(`Voice failed (${res.status})`); }
    return { audio: Buffer.from(await res.arrayBuffer()).toString("base64") };
  });

export const transcribeSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ audio: z.string().min(10).max(15_000_000), mime: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from(data.audio, "base64")], { type: data.mime }), "speech.webm");
    fd.append("model_id", "scribe_v2");
    fd.append("language_code", "eng");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key() }, body: fd });
    if (!res.ok) { const b = await res.text(); console.error(`ElevenLabs STT failed [${res.status}]: ${b}`); throw new Error(`Couldn't hear that (${res.status})`); }
    const j = (await res.json()) as { text?: string };
    return { text: (j.text ?? "").trim() };
  });
