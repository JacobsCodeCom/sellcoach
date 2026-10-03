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

const FLUSH_MS = 1600;
const PARTIAL_FALLBACK_MS = 400;

/**
 * ElevenLabs Scribe (en) with push-to-talk.
 * On release we commit + keep a short grace window so the last words aren't dropped.
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
  const latestPartialRef = useRef("");
  const flushUntilRef = useRef(0);
  const sentRef = useRef(false);
  const wasArmedRef = useRef(false);
  const flushTimerRef = useRef<number | null>(null);

  function isAccepting() {
    if (pausedRef.current) return false;
    return armedRef.current || Date.now() < flushUntilRef.current;
  }

  function emitFinal(text: string): boolean {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned || sentRef.current) return false;
    if (!isPlausibleUserUtterance(cleaned)) return false;
    sentRef.current = true;
    flushUntilRef.current = 0;
    latestPartialRef.current = "";
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    handlersRef.current.onPartial("");
    handlersRef.current.onFinal(cleaned);
    return true;
  }

  function acceptText(text: string, kind: "partial" | "final") {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!isAccepting()) {
      return;
    }
    if (kind === "partial") {
      latestPartialRef.current = cleaned;
      handlersRef.current.onPartial(cleaned);
      return;
    }
    emitFinal(cleaned || latestPartialRef.current);
  }

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    languageCode: "en",
    commitStrategy: CommitStrategy.VAD,
    filterBackgroundAudio: true,
    vadThreshold: 0.7,
    vadSilenceThresholdSecs: 0.8,
    minSpeechDurationMs: 200,
    minSilenceDurationMs: 300,
    onPartialTranscript: (data) => {
      acceptText(data.text, "partial");
    },
    onCommittedTranscript: (data) => {
      acceptText(data.text, "final");
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
      onFinal: (text) => acceptText(text, "final"),
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
      latestPartialRef.current = "";
      flushUntilRef.current = 0;
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
          vadThreshold: 0.7,
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
      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
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

  // Press / release handling: release flushes instead of dropping the line.
  useEffect(() => {
    const wasArmed = wasArmedRef.current;
    wasArmedRef.current = armed;

    if (armed && !wasArmed) {
      sentRef.current = false;
      latestPartialRef.current = "";
      flushUntilRef.current = 0;
      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
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

      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        if (sentRef.current || pausedRef.current) return;
        const pending = latestPartialRef.current.trim();
        if (pending) emitFinal(pending);
        flushUntilRef.current = 0;
      }, PARTIAL_FALLBACK_MS);
    }
  }, [armed]);

  useEffect(() => {
    if (paused) {
      flushUntilRef.current = 0;
      latestPartialRef.current = "";
      handlersRef.current.onPartial("");
    }
  }, [paused]);

  return null;
}
