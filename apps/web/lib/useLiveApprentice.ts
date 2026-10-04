"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  APPRENTICE,
  apprenticeState,
  createId,
  redact,
  type LiveQuestion,
  type QuestionKind,
  type ScreenMoment,
  type TranscriptLine,
} from "@mira/core";
import { ExtensionCaptureController } from "@/lib/extensionCapture";
import type { CaptureController, LiveCaptureSnapshot } from "@/lib/liveCapture";
import { cancelSpeech, enqueueSpeech, onAgentSpeaking } from "@/lib/speak";

const MAX_MOMENTS = 24;
const MAX_MOMENTS_EXTENSION = 10;
const MOMENT_MIN_GAP_MS = 6000;
const MOMENT_MIN_GAP_EXTENSION_MS = 8000;

export type ApprenticeUi = {
  label: string;
  quietFrac: number;
  ready: boolean;
  speaking: boolean;
  busy: boolean;
  awaiting: boolean;
};

export type LiveApprenticeResult = {
  transcript: TranscriptLine[];
  questions: LiveQuestion[];
  moments: ScreenMoment[];
};

/**
 * Watches a running capture and asks one "why" or guardrail question at natural pauses.
 * Speech from the expert after a question becomes its answer once they go quiet again.
 */
export function useLiveApprentice(controller: CaptureController | null, expertName: string) {
  const [snap, setSnap] = useState<LiveCaptureSnapshot | null>(() => controller?.getSnapshot() ?? null);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [moments, setMoments] = useState<ScreenMoment[]>([]);
  const [typed, setTyped] = useState<TranscriptLine[]>([]);
  const [ui, setUi] = useState<ApprenticeUi>({
    label: "Starting…",
    quietFrac: 0,
    ready: false,
    speaking: false,
    busy: false,
    awaiting: false,
  });

  const questionsRef = useRef<LiveQuestion[]>([]);
  const momentsRef = useRef<ScreenMoment[]>([]);
  const typedRef = useRef<TranscriptLine[]>([]);
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const awaitingRef = useRef<string | null>(null);
  const lastQuestionAtRef = useRef(APPRENTICE.firstQuestionAfterMs - APPRENTICE.minGapMs);
  const seenLinesRef = useRef(0);
  const seenScreensRef = useRef(0);
  const lastTypedAtRef = useRef(0);
  const greetedRef = useRef(false);
  const firstName = expertName.split(/\s+/)[0] || "there";

  const setQuestionsBoth = useCallback((next: LiveQuestion[]) => {
    questionsRef.current = next;
    setQuestions(next);
  }, []);

  const grabbingRef = useRef(false);
  const extensionMode = controller instanceof ExtensionCaptureController;
  const maxMoments = extensionMode ? MAX_MOMENTS_EXTENSION : MAX_MOMENTS;
  const momentGapMs = extensionMode ? MOMENT_MIN_GAP_EXTENSION_MS : MOMENT_MIN_GAP_MS;
  const addMoment = useCallback(async (): Promise<ScreenMoment | null> => {
    if (!controller || grabbingRef.current || momentsRef.current.length >= maxMoments) return null;
    grabbingRef.current = true;
    try {
      // Extension stills are already compressed; web capture keeps sharper frames.
      const image = await controller.grabFrame(extensionMode ? 720 : 1280, extensionMode ? 0.55 : 0.82);
      if (!image) return null;
      const url = controller.getLatestFrameUrl?.() ?? undefined;
      const moment = {
        id: createId("mo"),
        t: controller.elapsed(),
        image,
        ...(url ? { url } : {}),
      };
      momentsRef.current = [...momentsRef.current, moment];
      setMoments(momentsRef.current);
      return moment;
    } finally {
      grabbingRef.current = false;
    }
  }, [controller, extensionMode, maxMoments]);

  useEffect(() => {
    if (!controller) return;
    return controller.subscribe(setSnap);
  }, [controller]);

  useEffect(
    () =>
      onAgentSpeaking((speaking) => {
        speakingRef.current = speaking;
        controller?.setMuted(speaking);
      }),
    [controller],
  );

  useEffect(() => () => cancelSpeech(), []);

  const expertLines = useCallback((): TranscriptLine[] => {
    const spoken = (controller?.getSnapshot().finalLines ?? []).map((l) => ({ t: l.t, who: "expert" as const, text: l.text }));
    return [...spoken, ...typedRef.current].sort((a, b) => a.t - b.t);
  }, [controller]);

  const closeAnswer = useCallback(
    (id: string, lines: TranscriptLine[]) => {
      const q = questionsRef.current.find((x) => x.id === id);
      awaitingRef.current = null;
      if (!q) return;
      const answer = lines
        .filter((l) => l.t > q.t)
        .map((l) => l.text)
        .join(" ")
        .trim();
      setQuestionsBoth(questionsRef.current.map((x) => (x.id === id ? { ...x, answer } : x)));
      seenLinesRef.current = lines.length;
    },
    [setQuestionsBoth],
  );

  const ask = useCallback(async () => {
    if (!controller) return;
    busyRef.current = true;
    try {
      const moment = await addMoment();
      const lines = expertLines();
      const snapNow = controller.getSnapshot();
      const recent: TranscriptLine[] = [
        ...lines,
        ...questionsRef.current.map((q) => ({ t: q.t, who: "apprentice" as const, text: q.question })),
      ]
        .sort((a, b) => a.t - b.t)
        .slice(-10)
        .map((l) => ({ ...l, text: redact(l.text) }));

      const res = await fetch("/api/capture/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expertName,
          recent,
          asked: questionsRef.current.map(({ question, kind }) => ({ question, kind })),
          screenChanges: snapNow.screenChanges - seenScreensRef.current,
          image: moment?.image,
        }),
      });
      const out = (await res.json()) as { skip?: boolean; question?: string; kind?: QuestionKind };
      const now = controller.elapsed();
      if (out.skip || !out.question) {
        // Don't burn pending activity on a skip — especially while under the ask bar.
        lastQuestionAtRef.current = now - APPRENTICE.catchUpGapMs / 2;
        return;
      }
      seenLinesRef.current = lines.length;
      seenScreensRef.current = snapNow.screenChanges;
      const q: LiveQuestion = {
        id: createId("lq"),
        t: now,
        question: out.question,
        kind: out.kind ?? "why",
        answer: "",
        momentId: moment?.id ?? momentsRef.current.at(-1)?.id ?? null,
      };
      setQuestionsBoth([...questionsRef.current, q]);
      lastQuestionAtRef.current = now;
      awaitingRef.current = q.id;
      void enqueueSpeech(q.question);
    } catch {
      lastQuestionAtRef.current = controller.elapsed() - APPRENTICE.minGapMs / 2;
    } finally {
      busyRef.current = false;
    }
  }, [controller, addMoment, expertLines, expertName, setQuestionsBoth]);

  useEffect(() => {
    if (!controller) return;
    const timer = window.setInterval(() => {
      const s = controller.getSnapshot();
      if (s.status !== "recording") return;
      const now = controller.elapsed();

      if (!greetedRef.current) {
        greetedRef.current = true;
        void enqueueSpeech(
          `Hi ${firstName}, I'm your apprentice. Just work as usual and talk me through it. I'll stay quiet and ask a few questions at natural pauses — including at least one about a limit or when you'd stop and ask.`,
        );
        window.setTimeout(() => void addMoment(), 1500);
      }

      if (!s.offRecord && s.lastScreenChangeAt > (momentsRef.current.at(-1)?.t ?? -Infinity) + momentGapMs) {
        void addMoment();
      }

      const lines = expertLines();
      const awaitingId = awaitingRef.current;
      if (awaitingId) {
        const q = questionsRef.current.find((x) => x.id === awaitingId);
        const heard = lines.some((l) => q && l.t > q.t);
        const lastHeard = Math.max(s.lastSpeechAt, lastTypedAtRef.current);
        if (q && ((heard && now - lastHeard >= APPRENTICE.quietMs && !speakingRef.current) || now - q.t >= APPRENTICE.answerTimeoutMs)) {
          closeAnswer(awaitingId, lines);
        }
      }

      const state = apprenticeState({
        now,
        lastActivity: Math.max(s.lastSpeechAt, s.lastScreenChangeAt, lastTypedAtRef.current),
        lastQuestionAt: lastQuestionAtRef.current,
        pending: lines.length - seenLinesRef.current + (s.screenChanges - seenScreensRef.current),
        asked: questionsRef.current.length,
        speaking: speakingRef.current,
        awaitingAnswer: Boolean(awaitingRef.current),
        offRecord: s.offRecord,
        busy: busyRef.current,
      });
      setUi({
        label: state.label,
        quietFrac: state.quietFrac,
        ready: state.quietFrac >= 1 && state.mayAsk,
        speaking: speakingRef.current,
        busy: busyRef.current,
        awaiting: Boolean(awaitingRef.current),
      });
      if (state.mayAsk) void ask();
    }, 500);
    return () => window.clearInterval(timer);
  }, [controller, ask, addMoment, closeAnswer, expertLines, firstName, momentGapMs]);

  /** Typed answer or note when there's no mic. */
  const addTyped = useCallback(
    (text: string) => {
      if (!controller || !text.trim() || controller.getSnapshot().offRecord) return;
      const line: TranscriptLine = { t: controller.elapsed(), who: "expert", text: text.trim() };
      typedRef.current = [...typedRef.current, line];
      lastTypedAtRef.current = line.t;
      setTyped(typedRef.current);
    },
    [controller],
  );

  const toggleOffRecord = useCallback(() => {
    if (!controller) return;
    const off = !controller.getSnapshot().offRecord;
    if (off) cancelSpeech();
    controller.setOffRecord(off);
  }, [controller]);

  /** Final transcript, questions (open answers closed) and moments. Call after stopping. */
  const collect = useCallback(
    (finalLines?: { t: number; text: string }[]): LiveApprenticeResult => {
      const spoken = (finalLines ?? controller?.getSnapshot().finalLines ?? []).map((l) => ({
        t: l.t,
        who: "expert" as const,
        text: redact(l.text),
      }));
      const expert = [...spoken, ...typedRef.current.map((l) => ({ ...l, text: redact(l.text) }))].sort((a, b) => a.t - b.t);
      const qs = questionsRef.current.map((q, i, all) => {
        if (q.answer) return { ...q, answer: redact(q.answer) };
        const nextT = all[i + 1]?.t ?? Infinity;
        const answer = expert
          .filter((l) => l.t > q.t && l.t < nextT)
          .slice(0, 3)
          .map((l) => l.text)
          .join(" ");
        return { ...q, answer };
      });
      const transcript = [
        ...expert,
        ...qs.map((q) => ({ t: q.t, who: "apprentice" as const, text: q.question })),
      ].sort((a, b) => a.t - b.t);
      return { transcript, questions: qs, moments: momentsRef.current };
    },
    [controller],
  );

  const conversation: TranscriptLine[] = [
    ...(snap?.finalLines ?? []).map((l) => ({ t: l.t, who: "expert" as const, text: l.text })),
    ...typed,
    ...questions.map((q) => ({ t: q.t, who: "apprentice" as const, text: q.question })),
  ].sort((a, b) => a.t - b.t);

  return { snap, ui, questions, moments, conversation, addTyped, toggleOffRecord, collect };
}
