export const runtime = "nodejs";

/** Single-use token for ElevenLabs Scribe realtime STT. */
export async function POST() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: "no-key" }, { status: 501 });
  const response = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
    method: "POST",
    headers: { "xi-api-key": key },
  });
  if (!response.ok) return Response.json({ error: "token" }, { status: 502 });
  const payload = (await response.json()) as { token?: string };
  if (!payload.token) return Response.json({ error: "token" }, { status: 502 });
  return Response.json({ token: payload.token });
}
