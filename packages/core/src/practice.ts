import type { WorkMap, WorkMapGuardrail, WorkMapStep } from "./types";

/** A situation the expert never showed, built from one of their guardrails. */
export type PracticeCase = {
  id: string;
  situation: string;
  question: string;
  stepId: string | null;
  guardrailId: string | null;
};

export type PracticeVerdict = {
  verdict: "ok" | "stop" | "unsure";
  guardrailId: string | null;
  stepId: string | null;
  /** Spoken line: encouragement, or "<Expert> would stop here…" asking why. */
  ask: string;
  /** The expert's reasoning in their own words (revealed after the learner answers why). */
  explain: string;
};

export type PracticeResult = {
  caseId: string;
  guardrailId: string | null;
  stops: number;
  passed: boolean;
};

const STOP = new Set(
  "the a an and or to of in on for at by with is are be it this that when what you your they them if then do does not would will i we".split(
    " ",
  ),
);

function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w)),
    ),
  ];
}

export function overlapScore(answer: string, target: string): { hits: number; ratio: number } {
  const want = keywords(target);
  const said = new Set(keywords(answer));
  const hits = want.filter((w) => said.has(w)).length;
  return { hits, ratio: hits / Math.max(want.length, 1) };
}

export function stepForGuardrail(map: WorkMap, guardrailId: string | null): WorkMapStep | undefined {
  if (!guardrailId) return undefined;
  return (
    map.steps.find((s) => s.guardrailIds.includes(guardrailId) && s.isJudgmentCall) ??
    map.steps.find((s) => s.guardrailIds.includes(guardrailId))
  );
}

/** Offline cases: one per guardrail (max 4), phrased from the guardrail type. */
export function localPracticeCases(map: WorkMap): PracticeCase[] {
  const pool: WorkMapGuardrail[] = map.guardrails.length
    ? map.guardrails
    : map.steps
        .filter((s) => s.reason)
        .map((s, i) => ({ id: `R${i + 1}`, type: "limit" as const, rule: s.reason, quote: s.reason, t: s.t, momentId: s.momentId }));
  return pool.slice(0, 4).map((g, i) => {
    const step = stepForGuardrail(map, g.id) ?? map.steps[i % Math.max(map.steps.length, 1)];
    const where = step ? `You're at "${step.title}".` : "You're doing this task on your own.";
    const twist =
      g.type === "stop_and_ask"
        ? "This case isn't routine, and the person is pushing you to hurry."
        : g.type === "exception"
          ? "The usual way doesn't quite fit this case."
          : "Someone asks you to go further than you normally would.";
    return {
      id: `C${i + 1}`,
      situation: `${where} ${twist}`,
      question: "What do you do, and why?",
      stepId: step?.id ?? null,
      guardrailId: map.guardrails.some((x) => x.id === g.id) ? g.id : null,
    };
  });
}

/** Offline check: pass when the answer overlaps the guardrail's rule and the expert's words. */
export function localPracticeCheck(
  map: WorkMap,
  practice: PracticeCase,
  answer: string,
  expertFirst: string,
): PracticeVerdict {
  const g = map.guardrails.find((x) => x.id === practice.guardrailId);
  const step = map.steps.find((s) => s.id === practice.stepId) ?? stepForGuardrail(map, practice.guardrailId ?? null);
  const target = `${g?.rule ?? ""} ${g?.quote ?? ""} ${step?.reason ?? ""}`.trim();
  if (!target) {
    return { verdict: "unsure", guardrailId: null, stepId: step?.id ?? null, ask: `I'm not sure ${expertFirst} covered this. Check with a senior colleague.`, explain: "" };
  }
  const { hits, ratio } = overlapScore(answer, target);
  const enough = answer.trim().split(/\s+/).length >= 4 && (hits >= 2 || ratio >= 0.25);
  if (enough) {
    return { verdict: "ok", guardrailId: g?.id ?? null, stepId: step?.id ?? null, ask: `Good call. That's how ${expertFirst} does it.`, explain: g?.quote || g?.rule || step?.reason || "" };
  }
  return {
    verdict: "stop",
    guardrailId: g?.id ?? null,
    stepId: step?.id ?? null,
    ask: `${expertFirst} would stop here. Why do you think?`,
    explain: g?.quote || g?.rule || step?.reason || "",
  };
}

/** Mastered = guardrails practised without a stop; practise next = guardrails that stopped the learner. */
export function practiceReport(map: WorkMap, results: PracticeResult[]) {
  const shaky = new Set(
    results.filter((r) => r.guardrailId && (r.stops > 0 || !r.passed)).map((r) => r.guardrailId as string),
  );
  const practised = new Set(results.filter((r) => r.guardrailId).map((r) => r.guardrailId as string));
  return {
    mastered: map.guardrails.filter((g) => practised.has(g.id) && !shaky.has(g.id)),
    practise: map.guardrails.filter((g) => shaky.has(g.id)),
    caught: results.reduce((n, r) => n + r.stops, 0),
    good: results.filter((r) => r.passed && r.stops === 0).length,
  };
}

export function normalizePracticeCases(raw: unknown, map: WorkMap): PracticeCase[] {
  const list = Array.isArray(raw) ? raw : [];
  const stepIds = new Set(map.steps.map((s) => s.id));
  const guardIds = new Set(map.guardrails.map((g) => g.id));
  return list
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c.situation === "string" && c.situation.trim()))
    .slice(0, 5)
    .map((c, i) => ({
      id: `C${i + 1}`,
      situation: String(c.situation).trim(),
      question: typeof c.question === "string" && c.question.trim() ? c.question.trim() : "What do you do, and why?",
      stepId: stepIds.has(String(c.stepId)) ? String(c.stepId) : null,
      guardrailId: guardIds.has(String(c.guardrailId)) ? String(c.guardrailId) : null,
    }));
}

export function normalizeVerdict(raw: unknown, map: WorkMap): PracticeVerdict | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const verdict = r.verdict === "ok" || r.verdict === "stop" || r.verdict === "unsure" ? r.verdict : null;
  if (!verdict || typeof r.ask !== "string" || !r.ask.trim()) return null;
  return {
    verdict,
    guardrailId: map.guardrails.some((g) => g.id === r.guardrailId) ? String(r.guardrailId) : null,
    stepId: map.steps.some((s) => s.id === r.stepId) ? String(r.stepId) : null,
    ask: r.ask.trim(),
    explain: typeof r.explain === "string" ? r.explain.trim() : "",
  };
}
