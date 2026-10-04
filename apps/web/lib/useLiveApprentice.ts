"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  APPRENTICE,
  apprenticeState,
  createId,
  missingFundamentals,
  redact,
  type Ledger,
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
  /** Scripted fundamentals are being asked (Phase A). */
  intake: boolean;
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
  const [ledger, setLedger] = useState<Ledger>({});
  const [replies, setReplies] = useState<TranscriptLine[]>([]);
  const repliesRef = useRef<TranscriptLine[]>([]);
  const ledgerRef = useRef<Ledger>({});
  const intakeRef = useRef(false);
  const intakeQueueRef = useRef<{ id: string; q: string }[]>([]);
  const intakeDoneRef = useRef(false);
  const repliedLinesRef = useRef(0);
  const confusionRef = useRef<{ text: string; t: number } | null>(null);
  const [activity, setActivity] = useState<string>("");
  const observingRef = useRef(false);
  const replyingRef = useRef(false);
  /** Timestamps of expert lines spoken TO Mira (questions to her). Excluded from answers to her questions. */
  const toMiraRef = useRef<Set<number>>(new Set());
  const [ui, setUi] = useState<ApprenticeUi>({
    label: "Starting…",
    intake: false,
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
        .filter((l) => l.t > q.t && !toMiraRef.current.has(l.t))
        .map((l) => l.text)
        .join(" ")
        .trim();
      setQuestionsBoth(questionsRef.current.map((x) => (x.id === id ? { ...x, answer } : x)));
      seenLinesRef.current = lines.length;
      if (q.slot && answer) {
        ledgerRef.current = { ...ledgerRef.current, [q.slot]: answer };
        setLedger(ledgerRef.current);
      }
    },
    [setQuestionsBoth],
  );

  /** Did the expert just talk TO Mira (rather than narrate the work)? */
  const addressedToMira = (text: string): "named" | "question" | null => {
    const t = text.trim().toLowerCase().replace(/[.,!?]+$/g, "");
    if (!t) return null;
    // Her name, as speech-to-text tends to hear it.
    if (/\b(mira|meera|mirra|myra|mia|mirror)\b/.test(t)) return "named";
    const n = t.split(/\s+/).length;
    // Commands to her.
    if (/\b(hear me|you hear|you there|wait|stop|hold on|pause|listen|be quiet|shut up|one (sec|second|moment)|say that again|repeat that|got it)\b/.test(t) && n <= 16) return "question";
    // Transcripts carry no question marks: an auxiliary or question word followed by "you", anywhere in a short utterance.
    if (/\b(can|could|do|did|does|are|were|will|would|should|have|has|is)\s+(you|u)\b/.test(t) && n <= 16) return "question";
    if (/\b(what|why|how|when|which|who)\b[^.]{0,30}\byou\b/.test(t) && n <= 16) return "question";
    if (/^(hey|ok|okay|so|and|but|um|uh|wait)?\s*(what|how|do|did|can|could|should|would|are|is|have)\b/.test(t) && n <= 10) return "question";
    if (/\b(what (have|did) you (learn|understand|get)|tell me what you|any questions)\b/.test(t)) return "question";
    return null;
  };

  /** Mira answers when spoken to, in one sentence, then goes back to watching. */
  const replyTo = useCallback(
    async (line: TranscriptLine, how: "named" | "question" = "question") => {
      if (!controller || replyingRef.current) return;
      replyingRef.current = true;
      try {
        const res = await fetch("/api/capture/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expertName, utterance: line.text, recent: expertLines().slice(-8), ledger: ledgerRef.current, direct: how === "named" }),
        });
        const out = (await res.json()) as { skip?: boolean; reply?: string };
        if (!out.skip && out.reply) {
          repliesRef.current = [...repliesRef.current, { t: controller.elapsed(), who: "apprentice", text: out.reply }];
          setReplies(repliesRef.current);
          void enqueueSpeech(out.reply);
          // Priority rule: the expert's question comes first; Mira's own question goes back in the queue behind it.
          const openId = awaitingRef.current;
          const open = openId ? questionsRef.current.find((x) => x.id === openId) : null;
          if (open) {
            const reasked = { ...open, t: controller.elapsed() + 1 };
            setQuestionsBoth(questionsRef.current.map((x) => (x.id === open.id ? reasked : x)));
            void enqueueSpeech(`Back to my question: ${open.question}`);
          }
        }
      } catch {
        /* stay quiet */
      } finally {
        replyingRef.current = false;
      }
    },
    [controller, expertLines, expertName, setQuestionsBoth],
  );

  /** Watch: every screen moment goes through the brain. Seen slots fill silently; puzzles become the next question. */
  const observe = useCallback(
    async (moment: ScreenMoment) => {
      if (!controller || observingRef.current) return;
      observingRef.current = true;
      try {
        const res = await fetch("/api/capture/observe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expertName, image: moment.image, recent: expertLines().slice(-6), ledger: ledgerRef.current }),
        });
        const out = (await res.json()) as { activity?: string; fills?: Record<string, string>; understood?: boolean; confusion?: string };
        if (out.activity) setActivity(out.activity);
        const fills = out.fills ?? {};
        if (Object.keys(fills).length) {
          const next = { ...ledgerRef.current };
          for (const [k, v] of Object.entries(fills)) if (!next[k]) next[k] = `[seen] ${v}`;
          ledgerRef.current = next;
          setLedger(next);
        }
        if (out.understood === false && out.confusion) confusionRef.current = { text: out.confusion, t: moment.t };
      } catch {
        /* keep watching */
      } finally {
        observingRef.current = false;
      }
    },
    [controller, expertLines, expertName],
  );

  /** Phase A: one scripted fundamental at a time. Same every time, no LLM. */
  const askScripted = useCallback(() => {
    if (!controller) return;
    const next = intakeQueueRef.current.shift();
    if (!next) {
      intakeRef.current = false;
      intakeDoneRef.current = true;
      lastQuestionAtRef.current = controller.elapsed();
      void enqueueSpeech("Thanks. Now just work as usual and talk me through it. I'll stay quiet and ask a question now and then.");
      return;
    }
    const q: LiveQuestion = {
      id: createId("lq"),
      t: controller.elapsed(),
      question: next.q,
      kind: "context",
      answer: "",
      momentId: null,
      slot: next.id,
      origin: "script",
    };
    setQuestionsBoth([...questionsRef.current, q]);
    awaitingRef.current = q.id;
    void enqueueSpeech(q.question);
  }, [controller, setQuestionsBoth]);

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
          ledger: ledgerRef.current,
          confusion: confusionRef.current?.text,
        }),
      });
      confusionRef.current = null;
      const out = (await res.json()) as { skip?: boolean; question?: string; kind?: QuestionKind; slot?: string };
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
        slot: out.slot ?? null,
        origin: "probe",
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
        const seenApp = typeof localStorage !== "undefined" && localStorage.getItem("mira.seenApp") === "1";
        intakeQueueRef.current = missingFundamentals({}, { appIsNew: !seenApp }).map((s) => ({ id: s.id, q: s.q }));
        intakeRef.current = intakeQueueRef.current.length > 0;
        void enqueueSpeech(
          intakeRef.current
            ? `Hi ${firstName}, I'm Mira, your apprentice. Before you start, ${intakeQueueRef.current.length} quick questions so I know what I'm looking at.`
            : `Hi ${firstName}, I'm Mira, your apprentice. Just work as usual and talk me through it. I'll stay quiet and ask a few questions at natural pauses.`,
        );
        if (intakeRef.current) window.setTimeout(() => askScripted(), 2500);
        try { localStorage.setItem("mira.seenApp", "1"); } catch {}
        window.setTimeout(() => void addMoment().then((m) => { if (m) void observe(m); }), 1500);
      }

      if (!s.offRecord && s.lastScreenChangeAt > (momentsRef.current.at(-1)?.t ?? -Infinity) + momentGapMs) {
        void addMoment().then((m) => { if (m && !intakeRef.current) void observe(m); });
      }

      const lines = expertLines();
      // Conversational: if the expert addressed Mira (and we're not waiting on an answer to our question), reply.
      if (lines.length > repliedLinesRef.current) {
        const fresh = lines.slice(repliedLinesRef.current);
        repliedLinesRef.current = lines.length;
        if (!s.offRecord) {
          const last = fresh.at(-1)!;
          const recentBurst = lines.filter((l) => l.t >= last.t - 4000 && l.t <= last.t);
          const joined = recentBurst.map((l) => l.text).join(" ");
          const how = addressedToMira(joined) ?? addressedToMira(last.text);
          if (how) {
            for (const l of recentBurst) toMiraRef.current.add(l.t);
            void replyTo({ ...last, text: joined }, how);
          }
        }
      }
      const awaitingId = awaitingRef.current;
      if (awaitingId) {
        const q = questionsRef.current.find((x) => x.id === awaitingId);
        const heard = lines.some((l) => q && l.t > q.t && !toMiraRef.current.has(l.t));
        const lastHeard = Math.max(s.lastSpeechAt, lastTypedAtRef.current);
        if (q && ((heard && now - lastHeard >= APPRENTICE.quietMs && !speakingRef.current) || now - q.t >= APPRENTICE.answerTimeoutMs)) {
          closeAnswer(awaitingId, lines);
          // Intake answered → next scripted fundamental.
          if (intakeRef.current && q.origin === "script") window.setTimeout(() => askScripted(), 800);
        }
      }

      const puzzled = Boolean(confusionRef.current);
      const state = apprenticeState({
        now,
        lastActivity: Math.max(s.lastSpeechAt, s.lastScreenChangeAt, lastTypedAtRef.current),
        // Something Mira couldn't explain jumps the queue: only the quiet-time rule applies, not the gap.
        lastQuestionAt: puzzled ? -Infinity : lastQuestionAtRef.current,
        pending: lines.length - seenLinesRef.current + (s.screenChanges - seenScreensRef.current) + (puzzled ? 1 : 0),
        // Scripted intake questions don't count toward the live probe bar.
        asked: questionsRef.current.filter((q) => q.origin !== "script").length,
        speaking: speakingRef.current,
        awaitingAnswer: Boolean(awaitingRef.current),
        offRecord: s.offRecord,
        busy: busyRef.current || intakeRef.current || replyingRef.current,
      });
      setUi({
        label: intakeRef.current
          ? "Quick intake — the scripted fundamentals"
          : puzzled && !state.mayAsk && !awaitingRef.current
            ? "Didn't follow that — asking at your next pause"
            : state.label,
        intake: intakeRef.current,
        quietFrac: state.quietFrac,
        ready: state.quietFrac >= 1 && state.mayAsk,
        speaking: speakingRef.current,
        busy: busyRef.current,
        awaiting: Boolean(awaitingRef.current),
      });
      if (state.mayAsk && !intakeRef.current) void ask();
    }, 500);
    return () => window.clearInterval(timer);
  }, [controller, ask, askScripted, replyTo, addMoment, observe, closeAnswer, expertLines, firstName, momentGapMs]);

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

  /** Skip the remaining scripted fundamentals (demo shortcut). */
  const skipIntake = useCallback(() => {
    if (!intakeRef.current) return;
    intakeQueueRef.current = [];
    awaitingRef.current = null;
    askScripted();
  }, [askScripted]);

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
    ...replies,
    ...questions.map((q) => ({ t: q.t, who: "apprentice" as const, text: q.question })),
  ].sort((a, b) => a.t - b.t);

  return { snap, ui, questions, moments, conversation, ledger, activity, skipIntake, addTyped, toggleOffRecord, collect };
}
