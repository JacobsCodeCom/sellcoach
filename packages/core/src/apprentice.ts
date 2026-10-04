/**
 * "When to ask" policy for the live apprentice. All times in ms.
 * Challenge brief: ≥3 live questions (≥1 guardrail); tip — ask less, later
 * (about 3–5 per ten minutes); the rest waits for the debrief.
 */
export const APPRENTICE = {
  /** No speech or screen change for this long counts as a pause. */
  quietMs: 2000,
  /** After the live bar is met — stay mostly quiet (≈3–5 Q / 10 min). */
  minGapMs: 30_000,
  /** Shorter gap only while still under the required 3 questions. */
  catchUpGapMs: 10_000,
  /** Challenge: at least three live questions before wrapping up. */
  minLiveQuestions: 3,
  /** Challenge: at least one question about a limit / exception / stop-and-ask. */
  minGuardrailQuestions: 1,
  /** Soft cap — brief says three to five live; debrief covers the rest. */
  maxLiveQuestions: 5,
  /** Wait before the first ask so they can settle into the task. */
  firstQuestionAfterMs: 6_000,
  /** Stop waiting for an answer after this long; move on. */
  answerTimeoutMs: 30_000,
};

/** Whether a live capture meets the Challenge 01 ask bar. */
export function meetsLiveCaptureBar(
  questions: { kind: string }[],
  cfg = APPRENTICE,
): {
  ok: boolean;
  asked: number;
  needAsked: number;
  guardrails: number;
  needGuardrails: number;
} {
  const asked = questions.length;
  const guardrails = questions.filter((q) => q.kind === "guardrail").length;
  return {
    ok: asked >= cfg.minLiveQuestions && guardrails >= cfg.minGuardrailQuestions,
    asked,
    needAsked: cfg.minLiveQuestions,
    guardrails,
    needGuardrails: cfg.minGuardrailQuestions,
  };
}

export function effectiveMinGapMs(asked: number, cfg = APPRENTICE): number {
  return asked < cfg.minLiveQuestions ? cfg.catchUpGapMs : cfg.minGapMs;
}

export type ApprenticeInput = {
  now: number;
  lastActivity: number;
  lastQuestionAt: number;
  /** Speech lines or screen changes since the last question. */
  pending: number;
  asked: number;
  speaking: boolean;
  awaitingAnswer: boolean;
  offRecord: boolean;
  busy: boolean;
};

export type ApprenticeState = {
  mayAsk: boolean;
  label: string;
  /** 0..1: how full the pause ring is. */
  quietFrac: number;
};

export function apprenticeState(input: ApprenticeInput, cfg = APPRENTICE): ApprenticeState {
  const quietFor = input.now - input.lastActivity;
  const sinceQ = input.now - input.lastQuestionAt;
  const gapMs = effectiveMinGapMs(input.asked, cfg);
  const quietFrac = input.offRecord || input.awaitingAnswer ? 0 : Math.min(1, Math.max(0, quietFor / cfg.quietMs));
  /** Under the bar, keep asking on pauses even if they haven't moved on yet. */
  const catchingUp = input.asked < cfg.minLiveQuestions;
  const hasSomethingToAskAbout = input.pending > 0 || catchingUp;

  let label: string;
  if (input.offRecord) label = "Off the record";
  else if (input.speaking) label = "Asking…";
  else if (input.busy) label = "Thinking of a question…";
  else if (input.awaitingAnswer) label = "Waiting for your answer";
  else if (input.asked >= cfg.maxLiveQuestions) label = "Enough questions — wrap when ready";
  else if (quietFor < cfg.quietMs) label = "You're busy, staying quiet";
  else if (!hasSomethingToAskAbout) label = "Quiet — saving the rest for the debrief";
  else if (sinceQ < gapMs) label = `Holding a question ${Math.ceil((gapMs - sinceQ) / 1000)}s`;
  else if (catchingUp && input.pending === 0) label = "Catching up — one more about what you covered";
  else label = "Pause detected";

  const mayAsk =
    !input.offRecord &&
    !input.busy &&
    !input.speaking &&
    !input.awaitingAnswer &&
    quietFor >= cfg.quietMs &&
    hasSomethingToAskAbout &&
    sinceQ >= gapMs &&
    input.asked < cfg.maxLiveQuestions;

  return { mayAsk, label, quietFrac };
}

export function formatClock(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
