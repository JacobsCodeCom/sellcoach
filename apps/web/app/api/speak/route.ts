export const runtime = "nodejs";

/**
 * ElevenLabs Text to Speech — v4 API shape.
 * model_id: eleven_v4 (quality) | eleven_v4_turbo (low latency)
 * voice_settings: stability + similarity_boost only (style/speed N/A on v4)
 * Audio tags like [excited], [softly], [whisper] may appear in `text`.
 */
export async function POST(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: "no-key" }, { status: 501 });

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    /** Promo / walkthrough narration — more expressive voice + settings. */
    promo?: boolean;
  };
  // Keep [audio tags]; only collapse whitespace.
  const text = String(body.text || "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, 600);
  if (!text) return Response.json({ error: "empty" }, { status: 400 });

  const promo = Boolean(body.promo);
  // Product default: Rachel + turbo. Promo: George + fuller model (tags land better).
  const voiceId =
    (promo
      ? process.env.ELEVENLABS_PROMO_VOICE_ID || process.env.ELEVENLABS_VOICE_ID
      : process.env.ELEVENLABS_VOICE_ID) ||
    (promo ? "JBFqnCBsd6RMkjVDRZzb" : "21m00Tcm4TlvDq8ikWAM");
  // Promo prefers v3 when available (audio tags like [curious]); fall back via env.
  const modelId =
    (promo
      ? process.env.ELEVENLABS_PROMO_MODEL_ID || process.env.ELEVENLABS_MODEL_ID
      : process.env.ELEVENLABS_MODEL_ID) || (promo ? "eleven_v3" : "eleven_v4_turbo");

  // Prefer the streaming endpoint so bytes start flowing sooner; still buffer once
  // for browser Audio() playback, but ElevenLabs can start synthesis with lower latency.
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      optimize_streaming_latency: promo ? 0 : 3,
      voice_settings: promo
        ? {
            stability: 0.28,
            similarity_boost: 0.82,
            style: 0.55,
            use_speaker_boost: true,
          }
        : {
            stability: 0.5,
            similarity_boost: 0.75,
          },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("ElevenLabs TTS failed", response.status, detail.slice(0, 300));
    return Response.json({ error: "tts" }, { status: 502 });
  }

  // Pass the stream through when available so the client can begin buffering immediately.
  if (response.body) {
    return new Response(response.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  }

  const audio = await response.arrayBuffer();
  return new Response(audio, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
