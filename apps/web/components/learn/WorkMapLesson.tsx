"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatClock,
  practiceReport,
  stepForGuardrail,
  type PracticeCase,
  type PracticeResult,
  type PracticeVerdict,
  type ScreenMoment,
  type WorkMap,
} from "@mira/core";
import { ApprenticeOrb } from "@/components/ApprenticeOrb";
import { FlowSteps } from "@/components/FlowSteps";
import { VoiceReply } from "@/components/VoiceReply";
import { GUARDRAIL_LABEL } from "@/components/workmap/WorkMapView";
import { ExtensionCaptureController, isEmbeddedInExtension } from "@/lib/extensionCapture";
import { formatElapsed, LiveCaptureController, type CaptureController } from "@/lib/liveCapture";
import { isPromoDemo, markPromoDemo } from "@/lib/promoDemo";
import { PromoLiveCaptureController } from "@/lib/promoLiveCapture";
import { openMiraTab, pageHostLabel } from "@/lib/openMiraTab";
import { useLiveTutor } from "@/lib/useLiveTutor";
import { cancelSpeech, enqueueSpeech, onAgentSpeaking } from "@/lib/speak";

type Props = {
  map: WorkMap;
  moments: ScreenMoment[];
  expertName: string;
  learnerName: string;
  onFinished: () => void;
  onExit: () => void;
  /** Expert trying their own lesson: nothing is saved. */
  preview?: boolean;
  /** Chrome extension side panel — mic + tab shots, no Share picker. */
  embedded?: boolean;
  /** Restored mid-lesson step when the learner continues after a break. */
  resumeStepIndex?: number;
  resumeGuided?: boolean;
  /** Persist live step progress for Continue / break resume. */
  onCheckpoint?: (snap: { stepIndex: number; guidedThisStep: boolean }) => void;
};

type Phase = "live" | "walkthrough" | "practice" | "report";
/** answer → (stop → why → revealed) | ok | unsure */
type CaseStage = "answer" | "checking" | "why" | "revealed" | "ok" | "unsure";

/** Fresh €7,200 equipment invoice on the AP sandbox (Module 3 demo path). */
const DEMO_AP_URL = process.env.NEXT_PUBLIC_DEMO_AP_URL || "http://localhost:3002";

function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local");
  } catch {
    return false;
  }
}

/** Prefer a real recorded tab URL over local demo hosts. */
function preferRecordedUrl(...candidates: Array<string | null | undefined>): string | null {
  const cleaned = candidates.map((u) => u?.trim()).filter((u): u is string => Boolean(u));
  if (!cleaned.length) return null;
  return cleaned.find((u) => !isLoopbackUrl(u)) ?? cleaned[0] ?? null;
}

function nearestMomentWithUrl(
  moments: ScreenMoment[],
  t: number | null | undefined,
): ScreenMoment | undefined {
  const withUrl = moments.filter((m) => m.url?.trim());
  if (!withUrl.length) return undefined;
  if (t == null) return withUrl[0];
  let best: ScreenMoment | undefined;
  for (const m of withUrl) {
    if (m.t > t + 2000) continue;
    if (!best || m.t > best.t) best = m;
  }
  return best ?? withUrl[0];
}

/** Resolve Open link from the Work Map / recorded screen moments — never invent a demo URL. */
function urlForStep(
  step: { pageUrl?: string; momentId: string | null; t?: number | null },
  moments: ScreenMoment[],
): string | null {
  const linked = step.momentId ? moments.find((m) => m.id === step.momentId) : undefined;
  const nearby = nearestMomentWithUrl(moments, step.t ?? linked?.t ?? null);
  return preferRecordedUrl(step.pageUrl, linked?.url, nearby?.url);
}

/** First sentence / short line for the on-screen checklist. */
function shortLine(text: string, max = 110): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentence = clean.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() ?? clean;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).trim()}…`;
}

export function WorkMapLesson({
  map,
  moments,
  expertName,
  learnerName,
  onFinished,
  onExit,
  preview,
  embedded = false,
  resumeStepIndex = 0,
  resumeGuided = false,
  onCheckpoint,
}: Props) {
  const [phase, setPhase] = useState<Phase>("live");
  const [stepIndex, setStepIndex] = useState(() =>
    Math.max(0, Math.min(Math.max(0, map.steps.length - 1), Math.floor(resumeStepIndex))),
  );
  const [speaking, setSpeaking] = useState(false);
  const [cases, setCases] = useState<PracticeCase[] | null>(null);
  const [caseIndex, setCaseIndex] = useState(0);
  const [stage, setStage] = useState<CaseStage>("answer");
  const [verdict, setVerdict] = useState<PracticeVerdict | null>(null);
  const [lastAnswer, setLastAnswer] = useState("");
  const [results, setResults] = useState<PracticeResult[]>([]);
  const [liveResults, setLiveResults] = useState<PracticeResult[]>([]);
  const [controller, setController] = useState<CaptureController | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const spokenStepRef = useRef(-1);
  const casesRequestedRef = useRef(false);
  const controllerRef = useRef<CaptureController | null>(null);

  useEffect(() => {
    if (isPromoDemo()) markPromoDemo();
  }, []);
  const expertFirst = expertName.split(/\s+/)[0] || "Your colleague";
  const learnerFirst = learnerName.split(/\s+/)[0] || "there";
  const hasResume = resumeStepIndex > 0 || resumeGuided;

  const live = useLiveTutor(controller, map, moments, expertName, learnerName, {
    initialStepIndex: resumeStepIndex,
    initialGuidedThisStep: resumeGuided,
    onCheckpoint,
  });

  const practicePageUrl = useMemo(() => {
    for (const s of map.steps) {
      const url = urlForStep(s, moments);
      if (url) return url;
    }
    // Only use the AP demo desk when this lesson has no recorded page URLs at all.
    const looksLikeApDemo = /invoice|accounts payable|ap desk|INV-/i.test(
      `${map.title} ${map.steps.map((s) => `${s.title} ${s.screen} ${s.decision}`).join(" ")}`,
    );
    return looksLikeApDemo ? DEMO_AP_URL : null;
  }, [map.steps, map.title, moments]);
  const practicePageLabel = practicePageUrl
    ? practicePageUrl === DEMO_AP_URL
      ? "AP practice desk"
      : pageHostLabel(practicePageUrl)
    : null;

  useEffect(() => onAgentSpeaking(setSpeaking), []);
  useEffect(() => () => {
    cancelSpeech();
    const c = controllerRef.current;
    controllerRef.current = null;
    void c?.stop();
    if (c instanceof ExtensionCaptureController) c.dispose();
  }, []);

  useEffect(() => {
    if (live.finished && live.results.length) setLiveResults(live.results);
  }, [live.finished, live.results]);

  const step = map.steps[stepIndex];
  const liveStep = map.steps[live.stepIndex];
  const practice = cases?.[caseIndex];

  useEffect(() => {
    if (phase !== "walkthrough" || !step || spokenStepRef.current === stepIndex) return;
    spokenStepRef.current = stepIndex;
    cancelSpeech();
    const intro =
      stepIndex === 0
        ? `Hi ${learnerFirst}. I learned this from ${expertFirst}. ${map.steps.length} steps. Step one: `
        : "";
    const why = step.reason ? ` ${expertFirst} says: ${step.reason}` : "";
    void enqueueSpeech(`${intro}${step.title}.${why}`);
  }, [phase, step, stepIndex, learnerFirst, expertFirst, map.steps.length]);

  // Prefetch practice cases during live/walkthrough so practice doesn't open on a long wait.
  useEffect(() => {
    if (casesRequestedRef.current) return;
    if (phase !== "live" && phase !== "walkthrough" && phase !== "practice") return;
    if (isPromoDemo()) {
      casesRequestedRef.current = true;
      setCases([]);
      return;
    }
    casesRequestedRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/teach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "cases", expertName, workMap: map }),
        });
        const out = (await res.json()) as { cases?: PracticeCase[] };
        setCases(out.cases ?? []);
      } catch {
        setCases([]);
      }
    })();
  }, [phase, expertName, map]);

  useEffect(() => {
    if (phase !== "practice" || !practice || stage !== "answer") return;
    cancelSpeech();
    void enqueueSpeech(`${practice.situation} ${practice.question}`);
  }, [phase, practice, stage]);

  function record(patch: { stopped?: boolean; passed?: boolean }) {
    if (!practice) return;
    setResults((prev) => {
      const existing = prev.find((r) => r.caseId === practice.id);
      const base: PracticeResult = existing ?? { caseId: practice.id, guardrailId: practice.guardrailId, stops: 0, passed: false };
      const next = { ...base, stops: base.stops + (patch.stopped ? 1 : 0), passed: base.passed || Boolean(patch.passed) };
      return [...prev.filter((r) => r.caseId !== practice.id), next];
    });
  }

  async function check(answer: string) {
    if (!practice) return;
    cancelSpeech();
    setLastAnswer(answer);
    setStage("checking");
    try {
      const res = await fetch("/api/teach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "check", expertName, workMap: map, practice, answer }),
      });
      const out = (await res.json()) as PracticeVerdict;
      setVerdict(out);
      if (out.verdict === "stop") {
        record({ stopped: true });
        setStage("why");
      } else if (out.verdict === "ok") {
        record({ passed: true });
        setStage("ok");
      } else {
        record({});
        setStage("unsure");
      }
      void enqueueSpeech(out.ask);
    } catch {
      setStage("answer");
    }
  }

  function explainWhy(text: string) {
    if (!verdict) return;
    cancelSpeech();
    setLastAnswer(text);
    setStage("revealed");
    if (verdict.explain) void enqueueSpeech(`Here's how ${expertFirst} put it: ${verdict.explain}`);
  }

  function nextCase() {
    cancelSpeech();
    setVerdict(null);
    setLastAnswer("");
    if (cases && caseIndex + 1 < cases.length) {
      setCaseIndex(caseIndex + 1);
      setStage("answer");
    } else {
      setPhase("report");
    }
  }

  async function startLiveCoach() {
    if (starting || controller) return;
    setStarting(true);
    setStartError(null);
    const promo = isPromoDemo();
    const useExtensionCapture = !promo && (embedded || isEmbeddedInExtension());
    const frame = moments.find((m) => m.image?.startsWith("data:"))?.image ?? null;
    // Extension: same mic + tab screenshots as recording (no Share picker).
    // Web: classic screen share + mic.
    const next: CaptureController = promo
      ? new PromoLiveCaptureController(frame)
      : useExtensionCapture
        ? new ExtensionCaptureController()
        : new LiveCaptureController();
    controllerRef.current = next;
    setController(next);
    try {
      await next.start(useExtensionCapture || promo ? undefined : { preferCurrentTab: true });
      if (promo) {
        window.parent.postMessage({ type: "mira:promo-spotlight", target: "ticket-alpine" }, "*");
      }
    } catch (err) {
      controllerRef.current = null;
      setController(null);
      if (next instanceof ExtensionCaptureController) next.dispose();
      setStartError(
        err instanceof Error
          ? err.message
          : useExtensionCapture
            ? "Could not start coaching"
            : "Could not start screen share",
      );
    } finally {
      setStarting(false);
    }
  }

  async function stopLiveAndContinue(nextPhase: Phase) {
    cancelSpeech();
    if (!live.finished && !preview) live.persistCheckpoint();
    if (live.results.length) setLiveResults(live.results);
    const c = controllerRef.current;
    controllerRef.current = null;
    setController(null);
    if (c) await c.stop();
    if (c instanceof ExtensionCaptureController) c.dispose();
    setPhase(nextPhase);
  }

  const mergedResults = useMemo(() => [...liveResults, ...results], [liveResults, results]);
  const report = useMemo(() => practiceReport(map, mergedResults), [map, mergedResults]);

  useEffect(() => {
    if (phase !== "report") return;
    cancelSpeech();
    const total = map.guardrails.length;
    void enqueueSpeech(
      report.practise.length
        ? `Nice work, ${learnerFirst}. Next time, practise: ${report.practise.map((g) => g.rule).join(". ")}.`
        : `Nice work, ${learnerFirst}. You handled ${total ? "every rule" : "the task"} the way ${expertFirst} would.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speak once when the report opens
  }, [phase]);

  const verdictStep = verdict ? map.steps.find((s) => s.id === verdict.stepId) ?? stepForGuardrail(map, verdict.guardrailId) : undefined;
  const verdictGuard = verdict ? map.guardrails.find((g) => g.id === verdict.guardrailId) : undefined;
  const replay = moments.find((m) => m.id === (verdictStep?.momentId ?? verdictGuard?.momentId));
  const stepMoment = step ? moments.find((m) => m.id === step.momentId) : undefined;
  const liveGuard =
    live.intervention?.guardrailId != null
      ? map.guardrails.find((g) => g.id === live.intervention?.guardrailId)
      : undefined;
  const phaseIndex = phase === "live" || phase === "walkthrough" ? 0 : phase === "practice" ? 1 : 2;
  const recording = live.snap?.status === "recording";
  const busy =
    starting ||
    live.ui.busy ||
    stage === "checking" ||
    (phase === "practice" && !cases);
  const liveListening =
    recording && !speaking && !live.ui.speaking && !busy && !live.finished && !live.onBreak;
  const liveStepUrl = (() => {
    const url = liveStep ? urlForStep(liveStep, moments) : null;
    if (!url) return null;
    // Never surface the AP demo localhost link on a real recorded lesson.
    if (isLoopbackUrl(url) && practicePageUrl !== DEMO_AP_URL) return null;
    return url;
  })();
  const liveStepLook = liveStep ? shortLine(liveStep.screen, 90) : "";
  const liveStepDo = liveStep ? shortLine(liveStep.decision, 110) : "";

  function handleExit() {
    if (phase === "live" && !live.finished && !preview) {
      live.persistCheckpoint();
    }
    onExit();
  }

  return (
    <div className={`learn learn-session learn-session--wide${phase === "live" && recording ? " learn-session--live" : ""}`}>
      <div className="learn-session-top">
        <button type="button" className="learn-back" onClick={handleExit}>
          ← Back
        </button>
        <span className="learn-kicker">
          {preview ? "Preview · " : ""}
          {map.title}
        </span>
      </div>

      {phase === "live" && recording ? null : (
        <FlowSteps steps={["On your screen", "Practice", "Progress"]} active={phaseIndex} />
      )}

      {phase === "live" && recording ? null : (
        <div className="learn-agent learn-agent--row">
          <ApprenticeOrb
            state={
              speaking || live.ui.speaking
                ? "speaking"
                : busy
                  ? "thinking"
                  : live.ui.awaiting || (phase === "practice" && stage === "answer")
                    ? "listening"
                    : "waiting"
            }
          />
          <p className="learn-status">
            {speaking || live.ui.speaking
              ? "Mira is talking"
              : busy
                ? "Watching your screen…"
                : phase === "live"
                  ? live.ui.label
                  : phase === "walkthrough"
                    ? `From ${expertName}`
                    : "Your turn"}
          </p>
        </div>
      )}

      {phase === "live" ? (
        <section className={`lesson-card-step live-coach${recording ? " live-coach--slim" : ""}`}>
          {!recording ? (
            <>
              <h2>
                {hasResume
                  ? `Continue · step ${resumeStepIndex + 1} of ${map.steps.length}`
                  : embedded
                    ? "Ready when you are"
                    : "Do it on your screen"}
              </h2>
              <p className="muted">
                {hasResume
                  ? `You're on “${map.steps[resumeStepIndex]?.title ?? "this step"}”. Start coaching again whenever you're ready — or say you want a break anytime.`
                  : embedded
                    ? practicePageUrl
                      ? `Mira will walk you through ${expertFirst}'s steps. Open the page, start coaching, then just talk.`
                      : `Mira will walk you through ${expertFirst}'s steps. Start coaching, open the tool yourself, then just talk.`
                    : `Share the real tool. Mira watches, talks you through ${expertFirst}'s steps, and steps in before a guardrail breaks.`}
              </p>
              <ol className="live-coach-steps">
                {practicePageUrl && practicePageLabel ? (
                  <li>
                    Open{" "}
                    <button
                      type="button"
                      className="live-coach-link"
                      onClick={() => openMiraTab(practicePageUrl)}
                    >
                      {practicePageLabel}
                    </button>
                  </li>
                ) : (
                  <li>Open the same tool {expertFirst} used</li>
                )}
                <li>
                  {embedded
                    ? hasResume
                      ? "Start coaching to pick up where you left off"
                      : "Start coaching, then follow each step"
                    : "Come back here and share that window (or your whole screen)"}
                </li>
                <li>Talk out loud — ask for a hint, or say you want a break</li>
              </ol>
              {startError ? <p className="live-coach-error">{startError}</p> : null}
              <div className="hero-actions">
                <button className="btn btn-primary btn-lg" type="button" disabled={starting} onClick={() => void startLiveCoach()}>
                  {starting
                    ? embedded
                      ? "Starting…"
                      : "Waiting for share…"
                    : hasResume
                      ? embedded
                        ? "Continue coaching"
                        : "Share screen & continue"
                      : embedded
                        ? "Start coaching"
                        : "Share screen & start"}
                </button>
                {practicePageUrl && practicePageLabel ? (
                  <button className="btn" type="button" onClick={() => openMiraTab(practicePageUrl)}>
                    Open {practicePageLabel}
                  </button>
                ) : null}
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    cancelSpeech();
                    setPhase("walkthrough");
                  }}
                >
                  Review step cards instead
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={`live-coach-slim-bar${live.onBreak ? " live-coach-slim-bar--break" : ""}`}>
                <span className="rec-dot" aria-hidden />
                <ApprenticeOrb
                  state={
                    speaking || live.ui.speaking
                      ? "speaking"
                      : busy
                        ? "thinking"
                        : live.onBreak
                          ? "waiting"
                          : liveListening
                            ? "listening"
                            : "waiting"
                  }
                />
                <div className="live-coach-slim-meta">
                  <strong>
                    {live.onBreak ? "On a break · " : ""}
                    Step {live.stepIndex + 1}/{map.steps.length}
                    {live.finished ? " · done" : ""}
                  </strong>
                  <span className="muted">
                    {speaking || live.ui.speaking
                      ? "Mira is talking"
                      : live.finished
                        ? "All steps done"
                        : live.onBreak
                          ? "Say continue when you're ready"
                          : liveListening
                            ? "Listening"
                            : live.ui.label}
                  </span>
                </div>
                <span className="live-coach-slim-time">{formatElapsed(live.snap?.elapsedMs ?? 0)}</span>
              </div>

              {live.onBreak && liveStep ? (
                <div className="live-coach-break">
                  <h2 className="live-coach-next">Take your time</h2>
                  <p className="muted">
                    Progress saved at step {live.stepIndex + 1} of {map.steps.length}:{" "}
                    <strong>{liveStep.title}</strong>
                  </p>
                  <p className="muted">Say “continue” or tap Resume when you&apos;re back.</p>
                </div>
              ) : liveStep ? (
                <div className="live-coach-now">
                  <span className="wm-step-meta">
                    Your move · {live.stepIndex + 1} of {map.steps.length}
                  </span>
                  <h2 className="live-coach-next">{liveStep.title}</h2>
                  <ol className="live-coach-checklist">
                    {liveStepUrl ? (
                      <li>
                        <span className="live-coach-check-label">Open</span>{" "}
                        <button
                          type="button"
                          className="live-coach-link"
                          onClick={() => openMiraTab(liveStepUrl)}
                        >
                          {pageHostLabel(liveStepUrl)}
                        </button>
                      </li>
                    ) : null}
                    {liveStepLook ? (
                      <li>
                        <span className="live-coach-check-label">Find</span> {liveStepLook}
                      </li>
                    ) : null}
                    {liveStepDo ? (
                      <li>
                        <span className="live-coach-check-label">Do</span> {liveStepDo}
                      </li>
                    ) : null}
                    <li>
                      <span className="live-coach-check-label">Then</span> say when you&apos;ve done it
                    </li>
                  </ol>
                  {live.lastSpeak && !speaking && !live.ui.speaking ? (
                    <p className="live-coach-tip">{shortLine(live.lastSpeak, 140)}</p>
                  ) : null}
                  {live.snap?.interimTranscript ? (
                    <p className="live-coach-hearing">Hearing: {live.snap.interimTranscript}</p>
                  ) : live.heard ? (
                    <p className="live-coach-hearing">Heard: {live.heard}</p>
                  ) : null}
                </div>
              ) : null}

              {!live.onBreak && live.intervention ? (
                <div className="coach-box coach-box--stop">
                  <h4>Hold on</h4>
                  <p>{live.intervention.speak}</p>
                  {liveGuard ? (
                    <p className="muted">
                      <strong>{liveGuard.rule}</strong>
                    </p>
                  ) : null}
                  {live.intervention.whyAsked && live.intervention.explain ? (
                    <p className="wm-quote">
                      “{live.intervention.explain}” — {expertFirst}
                    </p>
                  ) : (
                    <p className="muted">Say why, out loud — no buttons needed.</p>
                  )}
                </div>
              ) : null}

              <div className="hero-actions live-coach-actions">
                {live.onBreak ? (
                  <button className="btn btn-primary" type="button" onClick={live.resumeBreak}>
                    Resume
                  </button>
                ) : (
                  <>
                    <button
                      className="btn"
                      type="button"
                      onClick={live.askForHint}
                      disabled={live.finished || live.ui.busy || live.ui.speaking}
                    >
                      Need a hint?
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={live.pauseBreak}
                      disabled={live.finished || live.ui.busy}
                    >
                      Take a break
                    </button>
                  </>
                )}
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => void stopLiveAndContinue(live.finished ? "report" : "practice")}
                >
                  {live.finished ? "See progress" : "Done"}
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {phase === "walkthrough" && step ? (
        <section className="lesson-card-step">
          <span className="wm-step-meta">
            Step {stepIndex + 1} of {map.steps.length}
            {step.isJudgmentCall ? " · judgment call" : ""}
          </span>
          <h2>{step.title}</h2>
          {stepMoment ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL screen moment
            <img className="wm-moment" src={stepMoment.image} alt={`${expertFirst}'s screen at ${formatClock(stepMoment.t)}`} />
          ) : null}
          {step.decision ? (
            <div className="wm-card">
              <span className="wm-card-label">What {expertFirst} did</span>
              <p>{step.decision}</p>
            </div>
          ) : null}
          {step.reason ? (
            <div className="wm-card">
              <span className="wm-card-label">Why</span>
              <p className="wm-quote">
                “{step.reason}” — {expertFirst}
              </p>
            </div>
          ) : null}
          {step.guardrailIds
            .map((id) => map.guardrails.find((g) => g.id === id))
            .filter((g): g is NonNullable<typeof g> => Boolean(g))
            .map((g) => (
              <div className="wm-card wm-card--guard" key={g.id}>
                <span className={`wm-badge wm-badge--${g.type}`}>{GUARDRAIL_LABEL[g.type]}</span>
                <p>
                  <strong>{g.rule}</strong>
                </p>
              </div>
            ))}
          <div className="hero-actions">
            {stepIndex > 0 ? (
              <button className="btn" type="button" onClick={() => setStepIndex(stepIndex - 1)}>
                Back
              </button>
            ) : (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  cancelSpeech();
                  setPhase("live");
                }}
              >
                Back to live coach
              </button>
            )}
            {stepIndex + 1 < map.steps.length ? (
              <button className="btn btn-primary" type="button" onClick={() => setStepIndex(stepIndex + 1)}>
                Next step
              </button>
            ) : (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  cancelSpeech();
                  setPhase("practice");
                }}
              >
                Start practice
              </button>
            )}
          </div>
        </section>
      ) : null}

      {phase === "practice" ? (
        !cases ? (
          <p className="learn-hint">Writing a few cases {expertFirst} never showed…</p>
        ) : !practice ? (
          <section className="lesson-card-step">
            <p className="muted">No practice cases for this one.</p>
            <button className="btn btn-primary" type="button" onClick={() => setPhase("report")}>
              See progress
            </button>
          </section>
        ) : (
          <section className="lesson-card-step">
            <span className="wm-step-meta">
              Case {caseIndex + 1} of {cases.length} · new to you
            </span>
            <p className="practice-situation">{practice.situation}</p>
            <p>
              <strong>{practice.question}</strong>
            </p>

            {lastAnswer && stage !== "answer" ? <p className="learn-line learn-line--user">{lastAnswer}</p> : null}

            {verdict && stage !== "answer" && stage !== "checking" ? (
              <div className={`coach-box coach-box--${verdict.verdict}`}>
                <h4>
                  {verdict.verdict === "ok"
                    ? "Good call"
                    : verdict.verdict === "stop"
                      ? `${expertFirst} would stop here`
                      : "Not covered yet"}
                </h4>
                <p>{verdict.ask}</p>
                {stage === "revealed" || (stage === "ok" && verdict.explain) ? (
                  <>
                    {verdictGuard ? (
                      <p>
                        <span className={`wm-badge wm-badge--${verdictGuard.type}`}>{GUARDRAIL_LABEL[verdictGuard.type]}</span>{" "}
                        <strong>{verdictGuard.rule}</strong>
                      </p>
                    ) : null}
                    {verdict.explain ? (
                      <p className="wm-quote">
                        “{verdict.explain}” — {expertFirst}
                        {verdictStep?.t != null ? `, at ${formatClock(verdictStep.t)}` : ""}
                      </p>
                    ) : null}
                    {stage === "revealed" && replay ? (
                      <figure className="coach-replay">
                        {/* eslint-disable-next-line @next/next/no-img-element -- data URL screen moment */}
                        <img src={replay.image} alt={`${expertFirst}'s screen at ${formatClock(replay.t)}`} />
                        <figcaption>
                          Replay: {verdictStep?.title ?? "the moment"} · {formatClock(replay.t)}
                        </figcaption>
                      </figure>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {stage === "answer" ? (
              <VoiceReply
                disabled={false}
                placeholder="What would you do, and why?"
                onSubmit={(t) => void check(t)}
              />
            ) : stage === "checking" ? (
              <p className="learn-hint">Checking against {expertFirst}&apos;s rules…</p>
            ) : stage === "why" ? (
              <VoiceReply
                disabled={false}
                placeholder={`Why do you think ${expertFirst} would stop?`}
                onSubmit={explainWhy}
              />
            ) : (
              <div className="hero-actions">
                {stage === "revealed" ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      cancelSpeech();
                      setVerdict(null);
                      setLastAnswer("");
                      setStage("answer");
                    }}
                  >
                    Try again
                  </button>
                ) : null}
                <button className="btn btn-primary" type="button" onClick={nextCase}>
                  {cases && caseIndex + 1 < cases.length ? "Next case" : "See progress"}
                </button>
              </div>
            )}
          </section>
        )
      ) : null}

      {phase === "report" ? (
        <section className="lesson-card-step">
          <h2>Training progress</h2>
          <p className="muted">
            {mergedResults.length} {mergedResults.length === 1 ? "moment" : "moments"} handled · {report.caught} wrong{" "}
            {report.caught === 1 ? "decision" : "decisions"} caught · {report.good} right first time
          </p>
          <div className="report-cols">
            <div>
              <h4>Mastered</h4>
              <ul>
                {report.mastered.length ? (
                  report.mastered.map((g) => <li key={g.id}>{g.rule}</li>)
                ) : (
                  <li className="muted">Nothing confirmed yet</li>
                )}
              </ul>
            </div>
            <div>
              <h4>Practise next</h4>
              <ul>
                {report.practise.length ? (
                  report.practise.map((g) => <li key={g.id}>{g.rule}</li>)
                ) : (
                  <li className="muted">No mistakes made</li>
                )}
              </ul>
            </div>
          </div>
          <div className="hero-actions">
            <button
              className="btn"
              type="button"
              onClick={() => {
                setResults([]);
                setLiveResults([]);
                setCaseIndex(0);
                setStage("answer");
                setVerdict(null);
                setLastAnswer("");
                casesRequestedRef.current = false;
                setCases(null);
                setPhase("live");
              }}
            >
              Coach me again
            </button>
            <button className="btn btn-primary btn-lg" type="button" onClick={onFinished}>
              {preview ? "Close preview" : "Finish lesson"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
