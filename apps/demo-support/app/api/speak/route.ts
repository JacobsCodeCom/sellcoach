import { redact } from "@/lib/redact";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: "no-key" }, { status: 501 });
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = redact(String(body.text || "")).slice(0, 600);
  if (!text) return Response.json({ error: "empty" }, { status: 400 });
  const voice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_v4_turbo",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });
  if (!response.ok) return Response.json({ error: "tts" }, { status: 502 });
  const audio = await response.arrayBuffer();
  return new Response(audio, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
