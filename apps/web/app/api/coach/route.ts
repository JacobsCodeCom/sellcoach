export const runtime = "nodejs";

type Body = {
  title?: string;
  passCriteria?: string;
  summary?: string;
  image?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const title = String(body.title || "Lesson").trim();
  const passCriteria = String(body.passCriteria || "").trim();
  const summary = String(body.summary || "").trim();
  const image = typeof body.image === "string" && body.image.startsWith("data:") ? body.image : "";

  const fallback = {
    hint: passCriteria
      ? `Look for whether you followed: ${passCriteria}`
      : `Stay on the lesson: ${title}`,
    status: "unclear" as const,
    source: "fallback" as const,
  };

  const key = process.env.OPENAI_API_KEY;
  if (!key || !passCriteria) {
    return Response.json(fallback);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [
      {
        type: "text",
        text: JSON.stringify({
          title,
          passCriteria,
          summary,
          ask: "Give one short coaching hint for the hire based on the rule and optional screenshot.",
        }),
      },
    ];
    if (image) {
      userContent.push({ type: "image_url", image_url: { url: image } });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You coach a new hire on a work screen. Return JSON {"hint":"under 140 chars","status":"on_track"|"risk"|"unclear"}. hint is the next thing to do or check. status risk if the screenshot likely violates passCriteria; on_track if it looks compliant; unclear if you cannot tell. Never invent click coordinates. Never control the desktop. Do not repeat secrets, emails, or phone numbers.',
          },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!response.ok) return Response.json(fallback);
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as { hint?: string; status?: string };
    const status =
      parsed.status === "on_track" || parsed.status === "risk" || parsed.status === "unclear"
        ? parsed.status
        : "unclear";
    const hint = String(parsed.hint || "").trim().slice(0, 160) || fallback.hint;
    return Response.json({ hint, status, source: "model" as const });
  } catch {
    return Response.json(fallback);
  } finally {
    clearTimeout(timer);
  }
}
