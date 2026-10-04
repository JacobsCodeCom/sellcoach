import { askJson } from "@/lib/llm";
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

  const context = `Lesson:\n${JSON.stringify(input.lesson)}\nLearner: ${input.learnerName}\nTaught by: ${input.expertName ?? "a senior colleague"}`;
  const history = input.messages.length
    ? input.messages.map((m) => `${m.role}: ${m.content}`).join("\n")
    : "user: Start the lesson.";

  const out = (await askJson({
    system: SYSTEM,
    user: `${context}\n\nConversation:\n${history}`,
    maxTokens: 280,
    timeoutMs: 12_000,
    priority: "latency",
  })) as { message?: string; passed?: boolean } | null;

  if (out?.message) {
    return Response.json({ message: String(out.message), passed: out.passed === true });
  }
  return Response.json(fallback);
}
