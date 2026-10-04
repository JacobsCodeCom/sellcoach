import {
  localPracticeCases,
  localPracticeCheck,
  normalizePracticeCases,
  normalizeVerdict,
  type PracticeCase,
  type WorkMap,
} from "@mira/core";
import { askJson } from "@/lib/llm";

export const runtime = "nodejs";

const CASES_SYSTEM = `You are a tutor preparing practice for a new hire. You have an expert's Work Map (steps, reasons in the expert's words, guardrails).
Write 3–4 short realistic situations the expert did NOT show, each one testing a different guardrail or judgment call. A good case tempts the new hire to break the rule (urgency, a senior person asking, an almost-normal case).
Each case: situation (2 sentences, concrete, no personal data), question (one spoken line, e.g. "What do you do, and why?"), guardrailId (from the map, or null), stepId (the step it belongs to).
Never reveal the answer in the situation.
Return JSON: {"cases": [{"situation": string, "question": string, "guardrailId": string|null, "stepId": string|null}]}`;

const CHECK_SYSTEM = `You are a tutor coaching a new hire through a case the expert never showed. You have the expert's Work Map.
Given the case and what the new hire says they would do, decide if they would break a guardrail or contradict the expert's reasoning.
If yes: verdict "stop". "ask": one short spoken line that starts with "<Expert first name> would stop here." and asks WHY, without giving the answer away. "explain": the expert's reasoning in the expert's own words (quote the guardrail). Give the guardrailId and the stepId whose screen moment should be replayed.
If the answer is fine: verdict "ok", "ask" is a short encouraging line (max 12 words), "explain" is the expert's words that back it up.
Judge only on the Work Map. If the Work Map does not cover this situation, verdict "unsure" and "ask" suggests checking with a senior colleague.
Return JSON: {"verdict": "ok"|"stop"|"unsure", "guardrailId": string|null, "stepId": string|null, "ask": string, "explain": string}`;

type Body = {
  mode?: "cases" | "check";
  expertName?: string;
  workMap?: WorkMap;
  practice?: PracticeCase;
  answer?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const map = body.workMap;
  if (!map?.steps?.length) return Response.json({ error: "workMap required" }, { status: 400 });
  const expertFirst = (body.expertName || "The expert").split(/\s+/)[0];
  const lean = { title: map.title, steps: map.steps.map(({ momentId: _m, t: _t, ...s }) => s), guardrails: map.guardrails.map(({ momentId: _m, t: _t, ...g }) => g) };

  if (body.mode === "check") {
    if (!body.practice) return Response.json({ error: "practice required" }, { status: 400 });
    const answer = String(body.answer || "").slice(0, 1200);
    const fallback = localPracticeCheck(map, body.practice, answer, expertFirst);
    const out = await askJson({
      system: CHECK_SYSTEM,
      user: { expertFirstName: expertFirst, workMap: lean, practiceCase: body.practice, newHireAnswer: answer },
      maxTokens: 320,
      timeoutMs: 12_000,
      priority: "latency",
    });
    const verdict = normalizeVerdict(out, map);
    return Response.json(verdict ? { ...verdict, source: "model" } : { ...fallback, source: "local" });
  }

  const fallback = localPracticeCases(map);
  const out = (await askJson({
    system: CASES_SYSTEM,
    user: { expertFirstName: expertFirst, workMap: lean },
    maxTokens: 900,
    timeoutMs: 20_000,
    priority: "latency",
  })) as { cases?: unknown } | null;
  const cases = normalizePracticeCases(out?.cases, map);
  return Response.json(cases.length ? { cases, source: "model" } : { cases: fallback, source: "local" });
}
