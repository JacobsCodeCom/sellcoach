"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LIVE_TUTOR,
  type LiveTutorAction,
  type PracticeResult,
  type ScreenMoment,
  type WorkMap,
} from "@mira/core";
import type { CaptureController, LiveCaptureSnapshot } from "@/lib/liveCapture";
import { isEmbeddedInExtension } from "@/lib/extensionCapture";
import { isPromoDemo } from "@/lib/promoDemo";
import { requestPageHighlight, type PageHighlightRect } from "@/lib/pageHighlight";
import { cancelSpeech, enqueueSpeech, onAgentSpeaking } from "@/lib/speak";

export type LiveTutorUi = {
  label: string;
  speaking: boolean;
  busy: boolean;
  awaiting: boolean;
  stepIndex: number;
  guidedThisStep: boolean;
};

export type LiveTutorIntervention = {
  speak: string;
  explain: string;
  guardrailId: string | null;
  stepId: string | null;
  replayMomentId: string | null;
  whyAsked: boolean;
};

/**
 * Watches the learner's shared screen against a Work Map: guides, asks for
 * predictions, intervenes on guardrails, advances steps, replays expert moments.
 * Continuous mic speech (not only the hold-to-talk form) drives advances.
 */
export function useLiveTutor(
  controller: CaptureController | null,
  map: WorkMap,
  moments: ScreenMoment[],
  expertName: string,
  learnerName: string,
) {
  const [snap, setSnap] = useState<LiveCaptureSnapshot | null>(() => controller?.getSnapshot() ?? null);
  const [stepIndex, setStepIndex] = useState(0);
  const [ui, setUi] = useState<LiveTutorUi>({
    label: "Share your screen to begin",
    speaking: false,
    busy: false,
    awaiting: false,
    stepIndex: 0,
    guidedThisStep: false,
  });
  const [intervention, setIntervention] = useState<LiveTutorIntervention | null>(null);
  const [results, setResults] = useState<PracticeResult[]>([]);
  const [finished, setFinished] = useState(false);
  const [lastSpeak, setLastSpeak] = useState("");
  const [heard, setHeard] = useState("");

  const stepIndexRef = useRef(0);
  const guidedRef = useRef(false);
  const awaitingRef = useRef(false);
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const greetedRef = useRef(false);
  const lastTurnAtRef = useRef(-LIVE_TUTOR.minGapMs);
  const seenScreensRef = useRef(0);
  const seenLinesRef = useRef(0);
  const recentSpokenRef = useRef<string[]>([]);
  const resultsRef = useRef<PracticeResult[]>([]);
  const finishedRef = useRef(false);
  const askWhyRef = useRef(false);
  const interventionRef = useRef<LiveTutorIntervention | null>(null);

  const expertFirst = expertName.split(/\s+/)[0] || "Your colleague";
  const learnerFirst = learnerName.split(/\s+/)[0] || "there";
  const learnerCall =
    /^(new|a|the|my)$/i.test(learnerFirst) ? learnerName.split(/\s+/).slice(1).find(Boolean) || "there" : learnerFirst;

  useEffect(() => {
    if (!controller) return;
    return controller.subscribe(setSnap);
  }, [controller]);

  useEffect(
    () =>
      onAgentSpeaking((speaking) => {
        speakingRef.current = speaking;
        controller?.setMuted(speaking);
        setUi((u) => ({ ...u, speaking }));
      }),
    [controller],
  );

  useEffect(() => () => cancelSpeech(), []);

  const recordResult = useCallback((patch: { guardrailId: string | null; stepId: string | null; stopped?: boolean; passed?: boolean }) => {
    const caseId = `live-${patch.guardrailId ?? patch.stepId ?? stepIndexRef.current}`;
    resultsRef.current = (() => {
      const existing = resultsRef.current.find((r) => r.caseId === caseId);
      const base: PracticeResult = existing ?? { caseId, guardrailId: patch.guardrailId, stops: 0, passed: false };
      const next = {
        ...base,
        guardrailId: patch.guardrailId ?? base.guardrailId,
        stops: base.stops + (patch.stopped ? 1 : 0),
        passed: base.passed || Boolean(patch.passed),
      };
      return [...resultsRef.current.filter((r) => r.caseId !== caseId), next];
    })();
    setResults(resultsRef.current);
  }, []);

  const applyAction = useCallback(
    (action: LiveTutorAction) => {
      if (action.action === "skip") return;

      if (action.speak) {
        recentSpokenRef.current = [...recentSpokenRef.current, action.speak].slice(-8);
        setLastSpeak(action.speak);
        void enqueueSpeech(action.speak);
      }

      if (action.action === "guide") {
        guidedRef.current = true;
        awaitingRef.current = true; // listen for "done / already signed in" immediately
        askWhyRef.current = false;
        lastTurnAtRef.current = controller?.elapsed() ?? 0;
        interventionRef.current = null;
        setIntervention(null);
      }

      if (action.action === "predict") {
        guidedRef.current = true;
        awaitingRef.current = true;
        askWhyRef.current = false;
        lastTurnAtRef.current = controller?.elapsed() ?? 0;
        interventionRef.current = null;
        setIntervention(null);
      }

      if (action.action === "intervene") {
        awaitingRef.current = true;
        askWhyRef.current = true;
        lastTurnAtRef.current = controller?.elapsed() ?? 0;
        recordResult({ guardrailId: action.guardrailId, stepId: action.stepId, stopped: true });
        const next = {
          speak: action.speak,
          explain: action.explain,
          guardrailId: action.guardrailId,
          stepId: action.stepId,
          replayMomentId: action.replayMomentId,
          whyAsked: false,
        };
        interventionRef.current = next;
        setIntervention(next);
      }

      if (action.action === "advance") {
        const next = Math.min(map.steps.length - 1, action.stepIndex);
        stepIndexRef.current = next;
        setStepIndex(next);
        guidedRef.current = true; // advance line already introduced the next step
        awaitingRef.current = true; // keep listening — no button
        askWhyRef.current = false;
        interventionRef.current = null;
        setIntervention(null);
        lastTurnAtRef.current = controller?.elapsed() ?? 0;
        recordResult({ guardrailId: action.guardrailId, stepId: action.stepId, passed: true });
      }

      if (action.action === "done") {
        finishedRef.current = true;
        setFinished(true);
        awaitingRef.current = false;
        lastTurnAtRef.current = controller?.elapsed() ?? 0;
        if (action.stepId || action.guardrailId) {
          recordResult({ guardrailId: action.guardrailId, stepId: action.stepId, passed: true });
        }
      }

      setUi((u) => ({
        ...u,
        stepIndex: stepIndexRef.current,
        guidedThisStep: guidedRef.current,
        awaiting: awaitingRef.current,
        busy: false,
        label:
          action.action === "done"
            ? "Lesson complete"
            : action.action === "intervene"
              ? `${expertFirst} would stop here`
              : awaitingRef.current
                ? "Listening — ask where to click, or say what you did"
                : action.action === "guide"
                  ? `Step ${stepIndexRef.current + 1}`
                  : u.label,
      }));
    },
    [controller, map.steps.length, recordResult, expertFirst],
  );

  const maybeHighlight = useCallback(
    async (action: LiveTutorAction) => {
      if (!action.requestHighlight || action.action === "skip" || !controller || !isEmbeddedInExtension()) return;
      const step = map.steps[stepIndexRef.current];
      const momentId = action.replayMomentId || step?.momentId;
      const expertImage = momentId ? moments.find((m) => m.id === momentId)?.image : undefined;
      const learnerImage = await controller.grabFrame(720, 0.6);
      if (!expertImage?.startsWith("data:image/") || !learnerImage?.startsWith("data:image/")) return;
      try {
        const res = await fetch("/api/teach/highlight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expertImage,
            learnerImage,
            screen: step?.screen,
            decision: step?.decision,
            stepTitle: step?.title,
          }),
        });
        const out = (await res.json()) as { rect?: PageHighlightRect | null };
        if (out.rect) requestPageHighlight(out.rect);
      } catch {
        /* voice + replay already delivered — highlight is best-effort */
      }
    },
    [controller, map.steps, moments],
  );

  const turn = useCallback(
    async (opts?: { learnerSaid?: string; force?: boolean; forceHint?: boolean; explicitHint?: boolean }) => {
      if (!controller || finishedRef.current || busyRef.current) return;
      const s = controller.getSnapshot();
      if (s.status !== "recording" || s.offRecord) return;

      const now = controller.elapsed();
      const quietFor = Math.max(0, now - Math.max(s.lastSpeechAt, s.lastScreenChangeAt));
      const quiet = quietFor >= LIVE_TUTOR.quietMs;
      const screenChanged = s.screenChanges > seenScreensRef.current;
      const sinceTurn = now - lastTurnAtRef.current;
      const stuck =
        guidedRef.current &&
        quietFor >= LIVE_TUTOR.stuckMs &&
        sinceTurn >= LIVE_TUTOR.stuckMs &&
        !screenChanged;

      if (!opts?.learnerSaid && !opts?.force && !opts?.forceHint) {
        if (speakingRef.current) return;
        // Already asked — wait for speech, unless they've been stuck long enough.
        if (awaitingRef.current && !stuck) return;
        if (!quiet && !screenChanged && !stuck) return;
        // Always enforce the gap, including after vision-only screen changes.
        if (sinceTurn < LIVE_TUTOR.minGapMs && guidedRef.current && !stuck) return;
        if (now < LIVE_TUTOR.firstGuideAfterMs && greetedRef.current) return;
      }

      const explicitHint = Boolean(opts?.explicitHint);
      const forceHint = Boolean(opts?.forceHint) || (stuck && !opts?.learnerSaid);
      busyRef.current = true;
      setUi((u) => ({
        ...u,
        busy: true,
        label: opts?.learnerSaid ? "Got it…" : forceHint ? "Here's a hint…" : "Watching your screen…",
      }));

      try {
        // Speech turns are text-only — skip the slow screen JPEG + vision path.
        const hasSpeech = Boolean(opts?.learnerSaid?.trim());
        const image = hasSpeech || forceHint ? undefined : await controller.grabFrame(480, 0.55);
        const res = await fetch("/api/teach/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expertName,
            learnerName,
            workMap: map,
            stepIndex: stepIndexRef.current,
            guidedThisStep: guidedRef.current,
            awaitingPredict: awaitingRef.current,
            learnerSaid: opts?.learnerSaid,
            screenChanged: hasSpeech || forceHint ? false : screenChanged,
            elapsedMs: now,
            quietMs: quietFor,
            forceHint,
            explicitHint,
            image,
            recentSpoken: recentSpokenRef.current,
          }),
        });
        const out = (await res.json()) as LiveTutorAction & { error?: string };
        if (out.error) return;
        if (!hasSpeech && !forceHint) seenScreensRef.current = s.screenChanges;
        applyAction(out);
        void maybeHighlight(out);
      } catch {
        lastTurnAtRef.current = now - LIVE_TUTOR.minGapMs / 2;
      } finally {
        busyRef.current = false;
        setUi((u) => ({
          ...u,
          busy: false,
          awaiting: awaitingRef.current,
          label: finishedRef.current
            ? "Lesson complete"
            : awaitingRef.current
              ? "Listening — ask where to click, or say what you did"
              : u.label,
        }));
      }
    },
    [controller, expertName, learnerName, map, applyAction, maybeHighlight],
  );

  const handleLearnerSpeech = useCallback(
    (text: string) => {
      const cleaned = text.trim();
      if (!cleaned || !controller || finishedRef.current) return;
      setHeard(cleaned);

      const iv = interventionRef.current;
      if (askWhyRef.current && iv && !iv.whyAsked) {
        cancelSpeech();
        const line = iv.explain
          ? `Here's how ${expertFirst} put it: ${iv.explain}`
          : `That's the guardrail ${expertFirst} taught.`;
        void enqueueSpeech(line);
        const next = { ...iv, whyAsked: true };
        interventionRef.current = next;
        setIntervention(next);
        awaitingRef.current = true;
        askWhyRef.current = false;
        lastTurnAtRef.current = controller.elapsed();
        setUi((u) => ({ ...u, awaiting: true, label: "Listening — continue when ready" }));
        // After explaining, treat a follow-up "ok / done" as advance on the next utterance.
        return;
      }

      cancelSpeech();
      void turn({ learnerSaid: cleaned, force: true });
    },
    [controller, expertFirst, turn],
  );

  useEffect(() => {
    if (!controller) return;
    const timer = window.setInterval(() => {
      const s = controller.getSnapshot();
      if (s.status !== "recording") return;
      const now = controller.elapsed();

      if (!greetedRef.current) {
        greetedRef.current = true;
        const first = map.steps[0];
        const intro = `Hi ${learnerCall}. I'll coach you the way ${expertFirst} does this. Ask me where to click anytime — I won't skip ahead until you finish each step.`;
        const stepLine = first
          ? ` First: ${first.title}.${first.screen ? ` Look for: ${first.screen}.` : ""}${first.decision ? ` ${expertFirst} did: ${first.decision}.` : ""}`
          : "";
        void enqueueSpeech(`${intro}${stepLine}`);
        recentSpokenRef.current = [`${intro}${stepLine}`];
        setLastSpeak(`${intro}${stepLine}`);
        lastTurnAtRef.current = now;
        guidedRef.current = Boolean(first);
        awaitingRef.current = Boolean(first);
        seenLinesRef.current = s.finalLines.length;
        setUi((u) => ({
          ...u,
          label: first ? "Listening — ask where to click, or say what you did" : "Ready",
          guidedThisStep: Boolean(first),
          awaiting: Boolean(first),
        }));
        return;
      }

      if (finishedRef.current) return;

      // Pick up natural speech from the shared mic (not only hold-to-talk).
      if (!speakingRef.current && !busyRef.current && s.finalLines.length > seenLinesRef.current) {
        const quietFor = now - s.lastSpeechAt;
        if (quietFor >= LIVE_TUTOR.quietMs) {
          const fresh = s.finalLines.slice(seenLinesRef.current);
          seenLinesRef.current = s.finalLines.length;
          const text = fresh.map((l) => l.text).join(" ").trim();
          if (text) {
            handleLearnerSpeech(text);
            return;
          }
        }
      }

      const lastActivity = Math.max(s.lastSpeechAt, s.lastScreenChangeAt);
      const quietFrac = Math.min(1, Math.max(0, (now - lastActivity) / LIVE_TUTOR.quietMs));
      setUi((u) => ({
        ...u,
        speaking: speakingRef.current,
        busy: busyRef.current,
        awaiting: awaitingRef.current,
        stepIndex: stepIndexRef.current,
        guidedThisStep: guidedRef.current,
        label: s.offRecord
          ? "Off the record"
          : speakingRef.current
            ? "Mira is talking"
            : busyRef.current
              ? "Got it…"
              : awaitingRef.current
                ? "Listening — ask where to click, or say what you did"
                : quietFrac >= 1
                  ? "Pause detected"
                  : "You're working — staying quiet",
      }));

      // Playwright / theater drives tutor turns via postMessage — skip live API.
      if (!isPromoDemo()) void turn();
    }, 400);
    return () => window.clearInterval(timer);
  }, [controller, turn, handleLearnerSpeech, expertFirst, learnerCall, map.steps]);

  const submitAnswer = useCallback(
    (text: string) => {
      seenLinesRef.current = controller?.getSnapshot().finalLines.length ?? seenLinesRef.current;
      handleLearnerSpeech(text);
    },
    [controller, handleLearnerSpeech],
  );

  const markStepDone = useCallback(() => {
    handleLearnerSpeech("I'm done with this step");
  }, [handleLearnerSpeech]);

  const askForHint = useCallback(() => {
    if (finishedRef.current || busyRef.current) return;
    cancelSpeech();
    if (isPromoDemo()) {
      const step = map.steps[stepIndexRef.current];
      applyAction({
        action: "guide",
        speak: `${expertFirst} starts with the hottest churn signal — open Alpine and count the cancellation mentions before you draft a reply.`,
        stepIndex: stepIndexRef.current,
        guardrailId: null,
        stepId: step?.id ?? null,
        replayMomentId: step?.momentId ?? null,
        explain: step?.reason ?? "",
        requestHighlight: true,
      });
      window.parent.postMessage({ type: "mira:promo-spotlight", target: "ticket-alpine" }, "*");
      return;
    }
    void turn({ forceHint: true, explicitHint: true, force: true });
  }, [turn, applyAction, map.steps, expertFirst]);

  useEffect(() => {
    if (!controller || !isPromoDemo()) return;

    type PromoTutorMsg = {
      type?: string;
      action?: LiveTutorAction;
      hear?: string;
      spotlight?: string;
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as PromoTutorMsg | null;
      if (!data || typeof data !== "object") return;
      if (data.type !== "mira:promo-tutor") return;
      if (data.action) applyAction(data.action);
      if (data.hear) handleLearnerSpeech(data.hear);
      if (data.spotlight) {
        window.parent.postMessage({ type: "mira:promo-spotlight", target: data.spotlight }, "*");
      }
    };

    window.addEventListener("message", onMessage);
    (window as Window & { __miraPromoTutor?: { apply: typeof applyAction; hear: typeof handleLearnerSpeech } }).__miraPromoTutor =
      {
        apply: applyAction,
        hear: handleLearnerSpeech,
      };
    return () => {
      window.removeEventListener("message", onMessage);
      delete (window as Window & { __miraPromoTutor?: unknown }).__miraPromoTutor;
    };
  }, [controller, applyAction, handleLearnerSpeech]);

  const replayMoment = intervention?.replayMomentId
    ? moments.find((m) => m.id === intervention.replayMomentId)
    : moments.find((m) => m.id === map.steps[stepIndex]?.momentId);

  return {
    snap,
    ui,
    stepIndex,
    intervention,
    results,
    finished,
    lastSpeak,
    heard,
    replayMoment,
    submitAnswer,
    markStepDone,
    askForHint,
    moments,
  };
}
