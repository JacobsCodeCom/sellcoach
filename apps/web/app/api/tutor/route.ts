import { localTutorReply, type TutorRequest } from "@/lib/tutor";

export const runtime = "nodejs";

const SYSTEM = `You are Mira, a friendly voice tutor for someone new at their job. You teach ONE lesson that came from an experienced colleague. Spoken-friendly: 1–3 short sentences, no lists, no markdown.

Flow:
- First turn (no learner message): greet them by first name, say who the lesson comes from, explain the rule simply with the why, then ask them to say it back in their own words: when it applies and what they do.
- If they ask a question, answer it from the lesson only, then re-ask for their explanation.
- If their explanation covers the pass criteria (the situation + the action; wording can differ), set "passed": true and congratulate briefly.
- If it's partly right, say what's right, give one small hint, and ask again. Never lecture.
- If they seem lost, give a concrete example from the lesson.

Respond with JSON only: { "message": string, "passed": boolean }`;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<TutorRequest>;
  const input: TutorRequest = {
    learnerName: String(body.learnerName || ""),
    expertName: body.expertName ? String(body.expertName) : undefined,
    lesson: {
      title: String(body.lesson?.title || "Lesson"),
      summary: String(body.lesson?.summary || ""),
      prompt: String(body.lesson?.prompt || ""),
      passCriteria: String(body.lesson?.passCriteria || ""),
    },
    messages: Array.isArray(body.messages) ? body.messages.slice(-12) : [],
  };
  const fallback = localTutorReply(input);

  const context = `Lesson:\n${JSON.stringify(input.lesson, null, 2)}\nLearner: ${input.learnerName}\nTaught by: ${input.expertName ?? "a senior colleague"}`;
  const turns = input.messages.length
    ? input.messages.map((m) => ({ role: m.role, content: m.content }))
    : [{ role: "user" as const, content: "Start the lesson." }];

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
          max_tokens: 400,
          temperature: 0.3,
          system: `${SYSTEM}\n\n${context}`,
          messages: turns[0]?.role === "user" ? turns : [{ role: "user", content: "Continue." }, ...turns],
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { content?: { type?: string; text?: string }[] };
        const raw = (payload.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        const parsed = parseTutorJson(raw);
        if (parsed) return Response.json(parsed);
      }
    } catch {
      /* fall through */
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: `${SYSTEM}\n\n${context}` }, ...turns],
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const parsed = parseTutorJson(payload.choices?.[0]?.message?.content || "");
        if (parsed) return Response.json(parsed);
      }
    } catch {
      /* fall through */
    }
  }

  return Response.json(fallback);
}

function parseTutorJson(raw: string) {
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!unfenced) return null;
  try {
    const parsed = JSON.parse(unfenced) as { message?: string; passed?: boolean };
    if (!parsed.message) return null;
    return { message: String(parsed.message), passed: parsed.passed === true };
  } catch {
    return null;
  }
}
