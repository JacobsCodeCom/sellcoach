import { redact } from "@/lib/redact";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    before?: string;
    after?: string;
    image?: string;
  };
  const before = redact(String(body.before || ""));
  const after = redact(String(body.after || ""));
  const changed = before !== after ? after : null;
  const key = process.env.OPENAI_API_KEY;
  if (!key || !body.image || !changed) {
    return Response.json({ event: changed, source: "diff" });
  }
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Describe one change on a dispatch screen in under 12 words. Do not repeat phone numbers or emails.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Previous: ${before}\nNow: ${after}` },
              { type: "image_url", image_url: { url: body.image } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) return Response.json({ event: changed, source: "diff" });
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const event = redact(payload.choices?.[0]?.message?.content || changed).slice(0, 140);
    return Response.json({ event, source: "vision" });
  } catch {
    return Response.json({ event: changed, source: "diff" });
  }
}
