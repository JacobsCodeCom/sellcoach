import {
  learnerAsksForHelp,
  localLiveTutor,
  normalizeLiveTutorAction,
  sanitizeLiveTutorAction,
  type LiveTutorAction,
  type WorkMap,
} from "@mira/core";
import { askJson } from "@/lib/llm";

export const runtime = "nodejs";

const SYSTEM = `You are a patient voice tutor coaching a new hire on THEIR OWN shared screen using an expert's Work Map.

Your job each turn:
- GUIDE with concrete detail from the Work Map: page URL (step.pageUrl — say it aloud when they ask for the URL/link), what to look for on screen (step.screen), what the expert did (step.decision), and WHY (step.reason). If they ask "where do I click?", "what's the URL?", or sound stuck, GUIDE again with those specifics and keep the same stepIndex. Show the expert moment when it helps.
- At judgment calls, ask them to explain WHY — not only what they clicked.
- INTERVENE if they are about to break a guardrail. Speak: "<Expert first name> would stop here. Why do you think?" Set explain to the expert's words. Keep the same stepIndex.
- ADVANCE only when the learner clearly finished THIS step (they say so, or the screen shows the step's outcome — not merely that a page started loading). Move exactly one step. When advancing, briefly restate the WHY, then introduce the next step with what to look for.
- DONE only when they finished the LAST step with evidence. Never say congratulations mid-lesson.
- On a vague screen change with no confirmation: if awaitingPredict is already true, SKIP (stay quiet). Otherwise one short PREDICT is ok. Do NOT advance or done from screen change alone.
- SKIP when mid-typing, nothing meaningful changed, or you already asked and are waiting for speech.

Rules:
- Never invent UI labels the Work Map does not contain; use step.screen / decision / reason.
- Max ~35 words for speak, natural spoken English.
- Never recite personal data from the screen.
- Prefer teaching over rushing. A confused learner needs GUIDE, not DONE.

Return JSON only:
{"action":"skip"|"guide"|"predict"|"intervene"|"advance"|"done","speak":string,"stepIndex":number,"guardrailId":string|null,"stepId":string|null,"replayMomentId":string|null,"explain":string,"requestHighlight":boolean}`;

type Body = {
  expertName?: string;
  learnerName?: string;
  workMap?: WorkMap;
  stepIndex?: number;
  guidedThisStep?: boolean;
  awaitingPredict?: boolean;
  learnerSaid?: string;
  screenChanged?: boolean;
  elapsedMs?: number;
  quietMs?: number;
  forceHint?: boolean;
  /** Learner tapped Need a hint (not idle stuck). */
  explicitHint?: boolean;
  image?: string;
  recentSpoken?: string[];
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const map = body.workMap;
  if (!map?.steps?.length) return Response.json({ error: "workMap required" }, { status: 400 });

  const expertFirst = (body.expertName || "The expert").split(/\s+/)[0];
  const learnerFirst = (body.learnerName || "there").split(/\s+/)[0];
  const stepIndex = Math.max(0, Math.min(map.steps.length - 1, Number(body.stepIndex) || 0));
  const hasLearnerSpeech = Boolean(String(body.learnerSaid || "").trim());
  const input = {
    expertFirst,
    learnerFirst,
    map,
    stepIndex,
    guidedThisStep: Boolean(body.guidedThisStep),
    awaitingPredict: Boolean(body.awaitingPredict),
    learnerSaid: body.learnerSaid,
    screenChanged: Boolean(body.screenChanged),
    elapsedMs: Number(body.elapsedMs) || 0,
    quietMs: Number(body.quietMs) || 0,
    forceHint: Boolean(body.forceHint),
    explicitHint: Boolean(body.explicitHint),
  };

  const requestHighlight =
    Boolean(body.explicitHint) || learnerAsksForHelp(String(body.learnerSaid || ""));

  const fallback = {
    ...sanitizeLiveTutorAction(localLiveTutor(input), map, stepIndex, hasLearnerSpeech),
    requestHighlight,
  };
  if (input.forceHint) {
    return Response.json(fallback);
  }
  // Speech-only turns: current + next step and related guardrails (no vision payload).
  const stepWindow = hasLearnerSpeech
    ? map.steps.slice(stepIndex, Math.min(map.steps.length, stepIndex + 2))
    : map.steps;
  const stepIds = new Set(stepWindow.map((s) => s.id));
  const guardrailIds = new Set(stepWindow.flatMap((s) => s.guardrailIds));
  const lean = {
    title: map.title,
    steps: stepWindow.map(({ momentId, t: _t, ...s }) => ({ ...s, momentId })),
    guardrails: map.guardrails
      .filter((g) => !hasLearnerSpeech || guardrailIds.has(g.id) || stepIds.size === 0)
      .map(({ momentId, t: _t, ...g }) => ({ ...g, momentId })),
  };
  const currentStep = lean.steps.find((s) => s.id === map.steps[stepIndex]?.id) ?? lean.steps[0];

  const out = (await askJson({
    system: SYSTEM,
    user: {
      expertFirstName: expertFirst,
      learnerFirstName: learnerFirst,
      workMap: lean,
      currentStepIndex: stepIndex,
      currentStep,
      totalSteps: map.steps.length,
      guidedThisStep: input.guidedThisStep,
      awaitingPredict: input.awaitingPredict,
      learnerSaid: input.learnerSaid || null,
      screenChangedSinceLastTurn: input.screenChanged,
      elapsedMs: input.elapsedMs,
      recentSpoken: (body.recentSpoken ?? []).slice(-4),
      reminder:
        "If learner asks where to click, what's the URL/link/page, or sounds stuck → GUIDE with currentStep.pageUrl (say the URL), screen, decision, reason. If only screenChanged and awaitingPredict → skip. If only screenChanged and not awaiting → one short predict, never done. done only on last step with evidence.",
      screen: body.image ? "Current learner screen frame is attached." : "No screen frame — use Work Map and learner speech.",
    },
    images: body.image ? [body.image] : [],
    maxTokens: hasLearnerSpeech ? 280 : 400,
    timeoutMs: hasLearnerSpeech ? 10_000 : 14_000,
    priority: "latency",
  })) as LiveTutorAction | null;

  const normalized = normalizeLiveTutorAction(out, map, stepIndex);
  if (!normalized) return Response.json({ ...fallback, source: "local" });
  const safe = sanitizeLiveTutorAction(normalized, map, stepIndex, hasLearnerSpeech);
  // Highlight is derived from explicit learner ask — never from the model alone.
  return Response.json({ ...safe, requestHighlight, source: "model" });
}
