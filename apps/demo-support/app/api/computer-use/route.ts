import { allowedTargets, planIsSafe, sanitizeActions, scriptFor } from "@/lib/hands";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { task?: string; policy?: string };
  const task = body.task || "";
  const fallback = scriptFor(task);
  if (!fallback.length) {
    return Response.json({ source: "script", actions: [] });
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ source: "script", actions: fallback });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
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
              "You are the hands on a support ticket desk. Return JSON {\"actions\":[{\"type\":\"move\"|\"click\"|\"wait\"|\"type\"|\"recoil\",\"target\":\"...\",\"ms\":400,\"text\":\"...\"}]}. Use only the allowed targets. Follow the expert policy. Never save a guardrail violation. A show task picks the correct reply path or escalate. The agent task closes two routine tickets, then on the competitor thread moves to the suggestion and recoils at save without clicking save.",
          },
          {
            role: "user",
            content: JSON.stringify({
              task,
              allowedTargets: allowedTargets(task),
              policy: body.policy || "",
              example: fallback,
            }),
          },
        ],
      }),
    });
    if (!response.ok) return Response.json({ source: "script", actions: fallback });
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as { actions?: unknown };
    const actions = sanitizeActions(parsed.actions, task);
    if (!planIsSafe(task, actions)) return Response.json({ source: "script", actions: fallback });
    return Response.json({ source: "model", actions });
  } catch {
    return Response.json({ source: "script", actions: fallback });
  } finally {
    clearTimeout(timer);
  }
}
