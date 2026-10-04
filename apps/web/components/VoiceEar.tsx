"use client";

import { CommitStrategy, useScribe } from "@elevenlabs/react";
import { useEffect, useRef } from "react";
import { isPlausibleUserUtterance } from "@/lib/voiceGate";
import { VoiceListenController } from "@/lib/voiceListen";

type Props = {
  active: boolean;
  /** Agent talking / thinking — never accept speech. */
  paused: boolean;
  /** Push-to-talk gate: hold to capture; release flushes the utterance. */
  armed: boolean;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
  onError?: (message: string) => void;
  onMode?: (mode: "scribe" | "browser" | "off") => void;
};

/** How long after release we still accept trailing commits/partials. */
const FLUSH_MS = 1400;
/** Debounce after the last transcript update before sending on release. */
const SETTLE_MS = 220;
/** Hard deadline after release — send whatever we have. */
const MAX_WAIT_MS = 1100;

/** Bias Scribe toward product / workplace vocabulary (max 50, ≤20 chars each). */
const KEYTERMS = [
  "Mira",
  "SellCoach",
  "apprentice",
  "work map",
  "Notion",
  "Salesforce",
  "HubSpot",
  "CRM",
  "onboarding",
  "debrief",
  "lesson",
  "screen share",
  "playbook",
];

/**
 * ElevenLabs Scribe v2 realtime (en) with push-to-talk.
 * There is no Scribe "v4" — v4 is TTS only (`eleven_v4_turbo`).
 * While holding, speech is buffered; release commits and waits for a stable final.
 */
export function VoiceEar({
  active,
  paused,
  armed,
  onPartial,
  onFinal,
  onListeningChange,
  onError,
  onMode,
}: Props) {
  const pausedRef = useRef(paused);
  const armedRef = useRef(armed);
  const handlersRef = useRef({ onPartial, onFinal, onListeningChange, onError, onMode });
  pausedRef.current = paused;
  armedRef.current = armed;
  handlersRef.current = { onPartial, onFinal, onListeningChange, onError, onMode };

  const browserRef = useRef<VoiceListenController | null>(null);
  const modeRef = useRef<"scribe" | "browser" | "off">("off");
  /** Committed segments accumulated while holding (VAD may fire mid-hold). */
  const heldSegmentsRef = useRef<string[]>([]);
  /** Live partial for the current unfinished segment. */
  const latestPartialRef = useRef("");
  const flushUntilRef = useRef(0);
  const sentRef = useRef(false);
  const wasArmedRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const hardTimerRef = useRef<number | null>(null);
  /** Ignore commits that flush idle audio when the button is first pressed. */
  const ignoreCommitUntilRef = useRef(0);

  function clearTimers() {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (hardTimerRef.current != null) {
      window.clearTimeout(hardTimerRef.current);
      hardTimerRef.current = null;
    }
  }

  function isCapturing() {
    if (pausedRef.current) return false;
    return armedRef.current || Date.now() < flushUntilRef.current;
  }

  function previewText() {
    const parts = [...heldSegmentsRef.current];
    const partial = latestPartialRef.current.trim();
    if (partial) parts.push(partial);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function emitFinal(text: string): boolean {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned || sentRef.current) return false;
    if (!isPlausibleUserUtterance(cleaned)) return false;
    sentRef.current = true;
    flushUntilRef.current = 0;
    heldSegmentsRef.current = [];
    latestPartialRef.current = "";
    clearTimers();
    handlersRef.current.onPartial("");
    handlersRef.current.onFinal(cleaned);
    return true;
  }

  /** Try to send after release once the transcript looks settled. */
  function scheduleFlushSend() {
    if (sentRef.current || pausedRef.current || armedRef.current) return;
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      if (sentRef.current || pausedRef.current || armedRef.current) return;
      const pending = previewText();
      if (!pending) return; // keep waiting until hard deadline
      emitFinal(pending);
    }, SETTLE_MS);
  }

  function acceptText(text: string, kind: "partial" | "segment") {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    if (!isCapturing()) return;
    if (kind === "segment" && Date.now() < ignoreCommitUntilRef.current) return;

    if (kind === "partial") {
      latestPartialRef.current = cleaned;
      handlersRef.current.onPartial(previewText());
      if (!armedRef.current && flushUntilRef.current > Date.now()) scheduleFlushSend();
      return;
    }

    // Segment commit from VAD / browser final — buffer only; do not send yet.
    heldSegmentsRef.current = [...heldSegmentsRef.current, cleaned];
    latestPartialRef.current = "";
    handlersRef.current.onPartial(previewText());
    if (!armedRef.current && flushUntilRef.current > Date.now()) scheduleFlushSend();
  }

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    languageCode: "en",
    // VAD still segments audio for the model, but we only send on button release.
    commitStrategy: CommitStrategy.VAD,
    filterBackgroundAudio: true,
    // Docs default ~0.4; 0.7 was dropping quiet / accented speech. With
    // filterBackgroundAudio, omit a high override so the server stays sensitive.
    vadThreshold: 0.4,
    vadSilenceThresholdSecs: 0.8,
    minSpeechDurationMs: 100,
    minSilenceDurationMs: 200,
    noVerbatim: true,
    keyterms: KEYTERMS,
    onPartialTranscript: (data) => {
      acceptText(data.text, "partial");
    },
    onCommittedTranscript: (data) => {
      acceptText(data.text, "segment");
    },
    onError: () => {
      if (modeRef.current === "scribe") {
        void startBrowserFallback();
      }
    },
  });
  const scribeRef = useRef(scribe);
  scribeRef.current = scribe;

  async function startBrowserFallback() {
    try {
      scribeRef.current.disconnect();
    } catch {
      /* ignore */
    }
    modeRef.current = "browser";
    handlersRef.current.onMode?.("browser");
    browserRef.current?.stop();
    const listen = new VoiceListenController({
      onPartial: (text) => acceptText(text, "partial"),
      // Browser "finals" are also buffered until release.
      onFinal: (text) => acceptText(text, "segment"),
      onListeningChange: (v) => handlersRef.current.onListeningChange(v),
      onError: (message) => handlersRef.current.onError?.(message),
    });
    browserRef.current = listen;
    listen.setBargeInArmed(true);
    listen.setPaused(false);
    const ok = await listen.start();
    if (!ok) {
      modeRef.current = "off";
      handlersRef.current.onMode?.("off");
    }
  }

  useEffect(() => {
    if (!active) {
      try {
        scribeRef.current.disconnect();
      } catch {
        /* ignore */
      }
      browserRef.current?.stop();
      browserRef.current = null;
      modeRef.current = "off";
      heldSegmentsRef.current = [];
      latestPartialRef.current = "";
      flushUntilRef.current = 0;
      clearTimers();
      handlersRef.current.onListeningChange(false);
      handlersRef.current.onPartial("");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/scribe-token", { method: "POST" });
        if (cancelled) return;
        if (!response.ok) {
          await startBrowserFallback();
          return;
        }
        const payload = (await response.json()) as { token?: string };
        if (!payload.token) {
          await startBrowserFallback();
          return;
        }
        await scribeRef.current.connect({
          token: payload.token,
          languageCode: "en",
          filterBackgroundAudio: true,
          vadThreshold: 0.4,
          noVerbatim: true,
          keyterms: KEYTERMS,
          microphone: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          scribeRef.current.disconnect();
          return;
        }
        modeRef.current = "scribe";
        handlersRef.current.onMode?.("scribe");
        handlersRef.current.onListeningChange(true);
      } catch {
        if (!cancelled) await startBrowserFallback();
      }
    })();

    return () => {
      cancelled = true;
      clearTimers();
      try {
        scribeRef.current.disconnect();
      } catch {
        /* ignore */
      }
      browserRef.current?.stop();
      browserRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once per active toggle
  }, [active]);

  // Press / release: only release sends the utterance.
  useEffect(() => {
    const wasArmed = wasArmedRef.current;
    wasArmedRef.current = armed;

    if (armed && !wasArmed) {
      sentRef.current = false;
      heldSegmentsRef.current = [];
      latestPartialRef.current = "";
      flushUntilRef.current = 0;
      clearTimers();
      handlersRef.current.onPartial("");
      // Drop idle audio that accumulated while the button wasn't held so it
      // doesn't leak into this utterance. Ignore the resulting commit briefly.
      ignoreCommitUntilRef.current = Date.now() + 350;
      try {
        scribeRef.current.commit();
        scribeRef.current.clearTranscripts();
      } catch {
        /* browser fallback */
      }
      return;
    }

    if (!armed && wasArmed) {
      flushUntilRef.current = Date.now() + FLUSH_MS;
      try {
        scribeRef.current.commit();
      } catch {
        /* browser fallback has no commit */
      }

      // Do not soft-send immediately — wait for post-release partials/commits so
      // trailing words aren't cut. Hard deadline always flushes what we have.
      if (hardTimerRef.current != null) window.clearTimeout(hardTimerRef.current);
      hardTimerRef.current = window.setTimeout(() => {
        hardTimerRef.current = null;
        if (sentRef.current || pausedRef.current || armedRef.current) return;
        const pending = previewText();
        if (!pending) {
          flushUntilRef.current = 0;
          return;
        }
        if (!emitFinal(pending)) flushUntilRef.current = 0;
      }, MAX_WAIT_MS);
    }
  }, [armed]);

  useEffect(() => {
    if (paused) {
      flushUntilRef.current = 0;
      heldSegmentsRef.current = [];
      latestPartialRef.current = "";
      clearTimers();
      handlersRef.current.onPartial("");
    }
  }, [paused]);

  return null;
}
