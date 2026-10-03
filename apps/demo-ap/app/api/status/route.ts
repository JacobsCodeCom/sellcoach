export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    eleven: Boolean(process.env.ELEVENLABS_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    agent: Boolean(process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID),
  });
}
