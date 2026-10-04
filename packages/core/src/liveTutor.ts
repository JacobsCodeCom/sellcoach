import { overlapScore, stepForGuardrail } from "./practice";
import type { WorkMap, WorkMapStep } from "./types";

/** Timing for the live screen tutor (ms). */
export const LIVE_TUTOR = {
  /** Pause after the learner stops talking before we treat continuous mic speech as a turn. */
  quietMs: 700,
  minGapMs: 7_000,
  firstGuideAfterMs: 1_500,
  answerTimeoutMs: 45_000,
  frameIntervalMs: 2_000,
  /** Quiet + no progress after a guide → proactive sharper hint. */
  stuckMs: 25_000,
};

/** Learner is stuck or asking how / where to click. */
export function learnerAsksForHelp(said: string): boolean {
  return /\b(where|which|how (do|did|can|to)|what do i|what should i|help|click|find|can'?t see|don'?t know|stuck|show me|point me)\b/i.test(
    said,
  );
}

/**
 * Learner said they finished the *current* step.
 * Vague "got it" / "done" alone is not enough — need a strong cue or overlap with the step.
 */
export function learnerClaimsStepDone(said: string, stepTitle: string, stepDecision: string, stepScreen = ""): boolean {
  if (learnerAsksForHelp(said)) return false;
  const text = said.toLowerCase();
  const strongCue =
    /\b(already|finished|completed|signed in|logged in|i'?m done|i am done|i did (that|it|this)|moved on|i'?ve done)\b/.test(
      text,
    );
  const weakCue = /\b(done|got it|all set|next step)\b/.test(text);
  if (!strongCue && !weakCue) return false;
  const { hits, ratio } = overlapScore(said, `${stepTitle} ${stepDecision} ${stepScreen}`);
  if (strongCue && (hits >= 1 || ratio >= 0.1 || /\b(signed|logged|opened|saved|posted|coded|clicked|selected)\b/.test(text))) {
    return true;
  }
  return weakCue && (hits >= 2 || ratio >= 0.25);
}

export type LiveTutorActionKind = "skip" | "guide" | "predict" | "intervene" | "advance" | "done";

/** One turn from the vision/voice tutor watching the new hire's screen. */
export type LiveTutorAction = {
  action: LiveTutorActionKind;
  /** Spoken line (empty when skip). */
  speak: string;
  /** Step the learner should be on after this turn. */
  stepIndex: number;
  guardrailId: string | null;
  stepId: string | null;
  /** Expert moment JPEG to show (usually on intervene / help). */
  replayMomentId: string | null;
  /** Expert reasoning revealed on intervene / after why. */
  explain: string;
  /**
   * Ask the extension to spotlight a UI target on the learner's tab.
   * Only for explicit help ("where do I click?") or Need a hint — never proactive.
   */
  requestHighlight: boolean;
};

export type LiveTutorInput = {
  expertFirst: string;
  learnerFirst: string;
  map: WorkMap;
  stepIndex: number;
  /** True once the tutor has guided this step. */
  guidedThisStep: boolean;
  /** True once a predict question is outstanding. */
  awaitingPredict: boolean;
  /** Learner reply to a predict / why question, if any. */
  learnerSaid?: string;
  /** Screen changed since the last tutor turn. */
  screenChanged: boolean;
  /** Milliseconds into the live session. */
  elapsedMs: number;
  /** Force a stuck/help guide (Need a hint or idle timeout). */
  forceHint?: boolean;
  /**
   * Learner tapped Need a hint (not an idle stuck timer).
   * Combined with forceHint to allow an on-page highlight.
   */
  explicitHint?: boolean;
  /** Quiet time since last speech or screen change (for stuck detection). */
  quietMs?: number;
};

function tutorAction(
  partial: Omit<LiveTutorAction, "requestHighlight"> & { requestHighlight?: boolean },
): LiveTutorAction {
  return { requestHighlight: false, ...partial };
}

function clampStep(map: WorkMap, index: number): number {
  if (!map.steps.length) return 0;
  return Math.max(0, Math.min(map.steps.length - 1, index));
}

function stepGuardrails(map: WorkMap, stepIndex: number) {
  const step = map.steps[stepIndex];
  if (!step) return [];
  return step.guardrailIds.map((id) => map.guardrails.find((g) => g.id === id)).filter((g): g is NonNullable<typeof g> => Boolean(g));
}

/** Concrete how-to line from the Work Map (for "where do I click?"). */
export function guideSpeakForStep(expertFirst: string, step: WorkMapStep, stepIndex: number): string {
  const look = step.screen?.trim() ? ` On screen, look for: ${step.screen.trim()}.` : "";
  const did = step.decision?.trim() ? ` ${expertFirst} did this: ${step.decision.trim()}.` : "";
  const why = step.reason?.trim() ? ` Why: ${step.reason.trim()}` : "";
  const page = step.pageUrl?.trim() ? ` Open the page ${step.pageUrl.trim()} if you aren't there yet.` : "";
  return `Step ${stepIndex + 1}: ${step.title}.${page}${look}${did}${why}`.replace(/\s+/g, " ").trim();
}

/** Sharper tip when the learner is stuck or taps Need a hint. */
export function stuckHintSpeakForStep(expertFirst: string, step: WorkMapStep, stepIndex: number): string {
  const look = step.screen?.trim()
    ? `Find this on screen: ${step.screen.trim()}.`
    : `Stay on "${step.title}".`;
  const did = step.decision?.trim() ? ` ${expertFirst}'s move: ${step.decision.trim()}.` : "";
  const page = step.pageUrl?.trim() ? ` Make sure you're on ${step.pageUrl.trim()}.` : "";
  return `Hint for step ${stepIndex + 1}.${page} ${look}${did} Say when you've done it.`.replace(/\s+/g, " ").trim();
}

function advanceSpeak(
  expertFirst: string,
  learnerFirst: string,
  map: WorkMap,
  fromStep: WorkMapStep,
  nextIndex: number,
  claimedDone: boolean,
): { action: "advance" | "done"; speak: string; stepIndex: number; explain: string } {
  const why = fromStep.reason?.trim() ? ` Remember why: ${fromStep.reason.trim()}` : "";
  if (nextIndex >= map.steps.length) {
    return {
      action: "done",
      speak: `Nice work, ${learnerFirst}. You finished the last step.${why}`,
      stepIndex: map.steps.length - 1,
      explain: fromStep.reason || "",
    };
  }
  const next = map.steps[nextIndex];
  const tip = next.screen?.trim() ? ` Look for: ${next.screen.trim()}.` : "";
  const nextWhy = next.reason?.trim() ? ` ${expertFirst} says: ${next.reason.trim()}` : "";
  const ack = claimedDone ? "Got it." : "Good.";
  return {
    action: "advance",
    speak: `${ack}${why} Next — ${next.title}.${tip}${nextWhy}`.replace(/\s+/g, " ").trim(),
    stepIndex: nextIndex,
    explain: fromStep.reason || "",
  };
}

/** Offline / no-key tutor turns driven by Work Map text + learner speech. */
export function localLiveTutor(input: LiveTutorInput): LiveTutorAction {
  const {
    expertFirst,
    learnerFirst,
    map,
    guidedThisStep,
    awaitingPredict,
    learnerSaid,
    screenChanged,
    elapsedMs,
    forceHint,
    explicitHint,
    quietMs = 0,
  } = input;
  const stepIndex = clampStep(map, input.stepIndex);
  const step = map.steps[stepIndex];
  if (!step) {
    return tutorAction({
      action: "done",
      speak: `That's the whole process, ${learnerFirst}.`,
      stepIndex,
      guardrailId: null,
      stepId: null,
      replayMomentId: null,
      explain: "",
    });
  }

  if (forceHint) {
    return tutorAction({
      action: "guide",
      speak: stuckHintSpeakForStep(expertFirst, step, stepIndex),
      stepIndex,
      guardrailId: null,
      stepId: step.id,
      replayMomentId: step.momentId,
      explain: step.reason || "",
      // Idle stuck timers also set forceHint — highlight only for Need a hint.
      requestHighlight: Boolean(explicitHint),
    });
  }

  const said = (learnerSaid || "").trim();
  if (said) {
    // "Where do I click?" → concrete Work Map guidance + expert moment, do NOT advance.
    if (learnerAsksForHelp(said)) {
      return tutorAction({
        action: "guide",
        speak: guideSpeakForStep(expertFirst, step, stepIndex),
        stepIndex,
        guardrailId: null,
        stepId: step.id,
        replayMomentId: step.momentId,
        explain: step.reason || "",
        requestHighlight: true,
      });
    }

    const guards = stepGuardrails(map, stepIndex);
    const claimedDone = learnerClaimsStepDone(said, step.title, step.decision, step.screen);
    const target = `${step.reason} ${step.decision} ${step.title} ${guards.map((g) => `${g.rule} ${g.quote}`).join(" ")}`.trim();
    const { hits, ratio } = overlapScore(said, target || step.title);
    const enough = said.split(/\s+/).length >= 3 && (hits >= 2 || ratio >= 0.22);

    // Judgment calls: if they claim done but never said why, ask before advancing.
    if (claimedDone && step.isJudgmentCall && step.reason && ratio < 0.15 && hits < 2) {
      return tutorAction({
        action: "predict",
        speak: `Okay — before we move on: why did ${expertFirst} do it that way?`,
        stepIndex,
        guardrailId: step.guardrailIds[0] ?? null,
        stepId: step.id,
        replayMomentId: step.momentId,
        explain: step.reason,
      });
    }

    if (claimedDone || enough) {
      const moved = advanceSpeak(expertFirst, learnerFirst, map, step, stepIndex + 1, claimedDone);
      return tutorAction({
        action: moved.action,
        speak: moved.speak,
        stepIndex: moved.stepIndex,
        guardrailId: null,
        stepId: step.id,
        replayMomentId: null,
        explain: moved.explain,
      });
    }

    // Judgment call with a weak/wrong answer → intervene.
    if (step.isJudgmentCall && (guards.length || step.reason)) {
      const g = guards[0] ?? null;
      return tutorAction({
        action: "intervene",
        speak: `${expertFirst} would stop here. Why do you think?`,
        stepIndex,
        guardrailId: g?.id ?? null,
        stepId: step.id,
        replayMomentId: step.momentId ?? g?.momentId ?? null,
        explain: g?.quote || g?.rule || step.reason || "",
      });
    }

    // Unclear chatter — re-guide briefly instead of silence.
    return tutorAction({
      action: "guide",
      speak: `Still on "${step.title}". ${step.decision ? `${expertFirst} did: ${step.decision}. ` : ""}Say when you've done it, or ask where to click.`,
      stepIndex,
      guardrailId: null,
      stepId: step.id,
      replayMomentId: step.momentId,
      explain: step.reason || "",
    });
  }

  // Screen change alone never completes the lesson. If we already asked, stay quiet
  // until they speak — otherwise one short check-in is enough.
  if (screenChanged && guidedThisStep) {
    if (awaitingPredict) {
      return tutorAction({
        action: "skip",
        speak: "",
        stepIndex,
        guardrailId: null,
        stepId: step.id,
        replayMomentId: null,
        explain: "",
      });
    }
    return tutorAction({
      action: "predict",
      speak: `Looks like the screen moved. Say when you've finished "${step.title}", or ask where to click.`,
      stepIndex,
      guardrailId: null,
      stepId: step.id,
      replayMomentId: step.momentId,
      explain: "",
    });
  }

  if (elapsedMs < LIVE_TUTOR.firstGuideAfterMs && !guidedThisStep) {
    return tutorAction({
      action: "skip",
      speak: "",
      stepIndex,
      guardrailId: null,
      stepId: step.id,
      replayMomentId: null,
      explain: "",
    });
  }

  if (!guidedThisStep) {
    return tutorAction({
      action: "guide",
      speak: guideSpeakForStep(expertFirst, step, stepIndex),
      stepIndex,
      guardrailId: null,
      stepId: step.id,
      replayMomentId: step.momentId,
      explain: step.reason || "",
    });
  }

  if (
    guidedThisStep &&
    quietMs >= LIVE_TUTOR.stuckMs &&
    !screenChanged &&
    elapsedMs > LIVE_TUTOR.firstGuideAfterMs + LIVE_TUTOR.stuckMs
  ) {
    return tutorAction({
      action: "guide",
      speak: stuckHintSpeakForStep(expertFirst, step, stepIndex),
      stepIndex,
      guardrailId: null,
      stepId: step.id,
      replayMomentId: step.momentId,
      explain: step.reason || "",
    });
  }

  if (!awaitingPredict && elapsedMs > LIVE_TUTOR.firstGuideAfterMs + LIVE_TUTOR.minGapMs) {
    return tutorAction({
      action: "predict",
      speak: `You're on "${step.title}". What are you doing, and why?`,
      stepIndex,
      guardrailId: step.guardrailIds[0] ?? null,
      stepId: step.id,
      replayMomentId: null,
      explain: "",
    });
  }

  return tutorAction({
    action: "skip",
    speak: "",
    stepIndex,
    guardrailId: null,
    stepId: step.id,
    replayMomentId: null,
    explain: "",
  });
}

/**
 * Soften unsafe model turns: never jump to done mid-lesson without learner speech;
 * never advance more than one step; keep help moments on the same step.
 */
export function sanitizeLiveTutorAction(
  action: LiveTutorAction,
  map: WorkMap,
  currentStepIndex: number,
  hasLearnerSpeech: boolean,
): LiveTutorAction {
  const step = map.steps[currentStepIndex];
  if (!step) return action;

  if (action.action === "done") {
    const onLast = currentStepIndex >= map.steps.length - 1;
    if (!onLast || !hasLearnerSpeech) {
      // Don't congratulate or advance from vision alone — stay quiet rather than nag.
      return tutorAction({
        action: "skip",
        speak: "",
        stepIndex: currentStepIndex,
        guardrailId: null,
        stepId: step.id,
        replayMomentId: null,
        explain: "",
      });
    }
  }

  if (action.action === "advance") {
    if (!hasLearnerSpeech) {
      // Vision-only "advance" is too noisy; wait for the learner to confirm.
      return tutorAction({
        action: "skip",
        speak: "",
        stepIndex: currentStepIndex,
        guardrailId: null,
        stepId: step.id,
        replayMomentId: null,
        explain: "",
      });
    }
    // Only ever move one step forward.
    const next = Math.min(map.steps.length - 1, currentStepIndex + 1);
    if (action.stepIndex !== next && currentStepIndex + 1 < map.steps.length) {
      return { ...action, stepIndex: next, requestHighlight: false };
    }
    if (currentStepIndex + 1 >= map.steps.length) {
      return { ...action, action: "done", stepIndex: currentStepIndex, requestHighlight: false };
    }
  }

  return {
    ...action,
    requestHighlight: Boolean(action.requestHighlight),
  };
}

export function normalizeLiveTutorAction(raw: unknown, map: WorkMap, fallbackStepIndex: number): LiveTutorAction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const action =
    r.action === "skip" ||
    r.action === "guide" ||
    r.action === "predict" ||
    r.action === "intervene" ||
    r.action === "advance" ||
    r.action === "done"
      ? r.action
      : null;
  if (!action) return null;
  if (action !== "skip" && (typeof r.speak !== "string" || !r.speak.trim())) return null;

  let stepIndex = typeof r.stepIndex === "number" && Number.isFinite(r.stepIndex) ? Math.floor(r.stepIndex) : fallbackStepIndex;
  stepIndex = clampStep(map, stepIndex);
  if (action === "advance" && stepIndex <= fallbackStepIndex && fallbackStepIndex + 1 < map.steps.length) {
    stepIndex = fallbackStepIndex + 1;
  }
  // Model must not jump ahead multiple steps.
  if (action === "advance" && stepIndex > fallbackStepIndex + 1) {
    stepIndex = clampStep(map, fallbackStepIndex + 1);
  }
  if (action === "guide" || action === "predict" || action === "intervene" || action === "skip") {
    stepIndex = fallbackStepIndex;
  }

  const stepId = map.steps.some((s) => s.id === r.stepId) ? String(r.stepId) : map.steps[stepIndex]?.id ?? null;
  const guardrailId = map.guardrails.some((g) => g.id === r.guardrailId) ? String(r.guardrailId) : null;
  const step = map.steps.find((s) => s.id === stepId) ?? map.steps[stepIndex];
  const guard = guardrailId ? map.guardrails.find((g) => g.id === guardrailId) : undefined;
  const replayFromStep = step?.momentId ?? null;
  const replayFromGuard = guard?.momentId ?? stepForGuardrail(map, guardrailId)?.momentId ?? null;

  return {
    action,
    speak: action === "skip" ? "" : String(r.speak).trim(),
    stepIndex,
    guardrailId,
    stepId,
    replayMomentId:
      typeof r.replayMomentId === "string" && r.replayMomentId
        ? r.replayMomentId
        : action === "intervene" || action === "guide"
          ? replayFromStep ?? replayFromGuard
          : null,
    explain: typeof r.explain === "string" ? r.explain.trim() : "",
    requestHighlight: r.requestHighlight === true,
  };
}
