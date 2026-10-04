"use client";

import type { LiveCaptureResult, LiveCaptureSnapshot, TimedLine } from "@/lib/liveCapture";

type Listener = (snap: LiveCaptureSnapshot) => void;

/** Ignore speaker echo right after Mira finishes talking (mic + laptop speakers). */
const ECHO_TAIL_MS = 1800;

function emptySnap(): LiveCaptureSnapshot {
  return {
    status: "idle",
    error: null,
    startedAt: null,
    elapsedMs: 0,
    interimTranscript: "",
    finalLines: [],
    lastSpeechAt: 0,
    screenChanges: 0,
    lastScreenChangeAt: 0,
    offRecord: false,
    hasScreen: false,
    hasMic: false,
    displayStream: null,
  };
}

/**
 * Capture controller driven by the Chrome extension parent page:
 * mic + speech + tab screenshots — no screen-share picker.
 */
export class ExtensionCaptureController {
  private snap = emptySnap();
  private listeners = new Set<Listener>();
  private tickTimer: number | null = null;
  private flushTimer: number | null = null;
  private latestFrame: string | null = null;
  private latestFrameUrl: string | null = null;
  private lastThumb: Uint8ClampedArray | null = null;
  private muted = false;
  private ignoreSpeechUntil = 0;
  /**
   * Learn mode only: commit speech over Mira so the learner can interrupt.
   * Off for capture — TTS echo into the laptop mic must not become "expert" transcript.
   */
  private bargeIn = false;
  /** Finals heard while Mira was talking — flushed after echo tail (learn barge-in). */
  private mutedFinals: TimedLine[] = [];
  private result: LiveCaptureResult | null = null;
  private onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.source !== "mira-extension") return;
    if (data.type === "mira:capture-started") {
      const startedAt = typeof data.startedAt === "number" ? data.startedAt : Date.now();
      this.mutedFinals = [];
      this.lastThumb = null;
      this.ignoreSpeechUntil = 0;
      this.update({
        status: "recording",
        startedAt,
        elapsedMs: 0,
        error: null,
        hasMic: true,
        hasScreen: true,
        finalLines: [],
        interimTranscript: "",
        lastSpeechAt: 0,
        screenChanges: 0,
        lastScreenChangeAt: 0,
        offRecord: false,
      });
      if (this.tickTimer != null) window.clearInterval(this.tickTimer);
      this.tickTimer = window.setInterval(() => {
        if (!this.snap.startedAt) return;
        this.update({ elapsedMs: Date.now() - this.snap.startedAt });
      }, 250);
      return;
    }
    if (data.type === "mira:capture-speech") {
      if (this.snap.offRecord || this.snap.status !== "recording") return;
      const finals = Array.isArray(data.finals) ? (data.finals as TimedLine[]) : [];
      const interim = typeof data.interim === "string" ? data.interim : "";
      // Mic hears laptop speakers — drop everything while Mira talks (+ echo tail).
      if (this.muted || Date.now() < this.ignoreSpeechUntil) {
        if (this.bargeIn && finals.length) {
          this.mutedFinals.push(...finals);
          const buffered = this.mutedFinals
            .map((l) => l.text)
            .join(" ")
            .trim();
          // 3+ words → treat as barge-in, not speaker echo (learn only).
          if (buffered.split(/\s+/).filter(Boolean).length >= 3) {
            const ready = this.mutedFinals;
            this.mutedFinals = [];
            this.commitSpeech(ready, "");
          }
        }
        return;
      }
      this.commitSpeech(finals, interim);
      return;
    }
    if (data.type === "mira:capture-frame" && typeof data.image === "string") {
      if (this.snap.offRecord || this.snap.status !== "recording") return;
      const nextUrl =
        typeof data.url === "string" && (data.url.startsWith("http://") || data.url.startsWith("https://"))
          ? data.url
          : null;
      const urlChanged = Boolean(nextUrl && nextUrl !== this.latestFrameUrl);
      this.latestFrame = data.image;
      this.latestFrameUrl = nextUrl;
      void this.noteFrameChange(data.image, urlChanged);
      return;
    }
    if (data.type === "mira:capture-error") {
      this.update({
        status: "error",
        error: typeof data.error === "string" ? data.error : "Capture failed",
      });
      return;
    }
    if (data.type === "mira:capture-stopped") {
      void this.finishStop();
    }
  };

  constructor() {
    window.addEventListener("message", this.onMessage);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snap);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): LiveCaptureSnapshot {
    return this.snap;
  }

  getResult(): LiveCaptureResult | null {
    return this.result;
  }

  elapsed(): number {
    return this.snap.startedAt ? Date.now() - this.snap.startedAt : 0;
  }

  /** Ask the extension parent to start mic + tab screenshots. */
  async start(_options?: unknown): Promise<void> {
    this.result = null;
    this.latestFrame = null;
    this.latestFrameUrl = null;
    this.lastThumb = null;
    this.mutedFinals = [];
    this.update({ status: "requesting", error: null });
    window.parent.postMessage({ type: "mira:start-capture" }, "*");

    // Parent responds with mira:capture-started or mira:capture-error.
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Extension did not start capture. Reload the Mira extension and try again."));
      }, 8000);
      const onMsg = (event: MessageEvent) => {
        const data = event.data;
        if (!data || data.source !== "mira-extension") return;
        if (data.type === "mira:capture-started") {
          cleanup();
          resolve();
        }
        if (data.type === "mira:capture-error") {
          cleanup();
          reject(new Error(typeof data.error === "string" ? data.error : "Could not start capture"));
        }
        if (data.type === "mira:capture-need-mic") {
          cleanup();
          reject(
            new Error(
              typeof data.error === "string"
                ? data.error
                : "Allow the microphone once in the tab that opened, then press Start again.",
            ),
          );
        }
      };
      const cleanup = () => {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMsg);
      };
      window.addEventListener("message", onMsg);
    });
  }

  async stop(reason?: string): Promise<LiveCaptureResult> {
    window.parent.postMessage({ type: "mira:stop-capture" }, "*");
    return this.finishStop(reason);
  }

  /** Enable learner barge-in during Mira speech. Keep off for expert capture. */
  setBargeIn(enabled: boolean) {
    this.bargeIn = enabled;
    if (!enabled) this.mutedFinals = [];
  }

  setMuted(muted: boolean) {
    if (this.muted && !muted) {
      this.ignoreSpeechUntil = Date.now() + ECHO_TAIL_MS;
      if (this.bargeIn) {
        if (this.flushTimer != null) window.clearTimeout(this.flushTimer);
        this.flushTimer = window.setTimeout(() => {
          this.flushTimer = null;
          this.flushMutedFinals();
        }, ECHO_TAIL_MS);
      } else {
        this.mutedFinals = [];
      }
    }
    this.muted = muted;
    if (muted) this.update({ interimTranscript: "" });
  }

  setOffRecord(off: boolean) {
    if (this.snap.status !== "recording" || this.snap.offRecord === off) return;
    this.update({ offRecord: off, interimTranscript: "" });
  }

  async grabFrame(_maxWidth = 480, _quality = 0.6): Promise<string | null> {
    return this.latestFrame;
  }

  /** Active tab URL for the latest extension screenshot, if known. */
  getLatestFrameUrl(): string | null {
    return this.latestFrameUrl;
  }

  dispose() {
    window.removeEventListener("message", this.onMessage);
    if (this.tickTimer != null) window.clearInterval(this.tickTimer);
    if (this.flushTimer != null) window.clearTimeout(this.flushTimer);
  }

  private commitSpeech(finals: TimedLine[], interim: string) {
    const nextLines = finals.length ? [...this.snap.finalLines, ...finals] : this.snap.finalLines;
    this.update({
      finalLines: nextLines,
      interimTranscript: interim,
      lastSpeechAt: this.elapsed(),
    });
  }

  private flushMutedFinals() {
    if (!this.mutedFinals.length || this.muted || this.snap.status !== "recording") return;
    if (Date.now() < this.ignoreSpeechUntil) return;
    const finals = this.mutedFinals;
    this.mutedFinals = [];
    this.commitSpeech(finals, "");
  }

  /** Count a screen change only on URL change or a real visual diff — not every 4s still. */
  private async noteFrameChange(dataUrl: string, urlChanged: boolean) {
    if (urlChanged) {
      this.lastThumb = null;
      this.update({
        screenChanges: this.snap.screenChanges + 1,
        lastScreenChangeAt: this.elapsed(),
        hasScreen: true,
      });
      return;
    }

    try {
      const thumb = await frameThumb(dataUrl);
      if (!thumb) {
        this.update({ hasScreen: true });
        return;
      }
      const prev = this.lastThumb;
      this.lastThumb = thumb;
      if (!prev) {
        this.update({ hasScreen: true });
        return;
      }
      let diff = 0;
      for (let i = 0; i < thumb.length; i += 1) diff += Math.abs(thumb[i] - prev[i]);
      if (diff / thumb.length >= 12) {
        this.update({
          screenChanges: this.snap.screenChanges + 1,
          lastScreenChangeAt: this.elapsed(),
          hasScreen: true,
        });
      } else {
        this.update({ hasScreen: true });
      }
    } catch {
      this.update({ hasScreen: true });
    }
  }

  private async finishStop(reason?: string): Promise<LiveCaptureResult> {
    if (this.tickTimer != null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.flushTimer != null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushMutedFinals();
    const lines = [...this.snap.finalLines];
    const interim = this.snap.interimTranscript.trim();
    if (interim && !this.snap.offRecord) lines.push({ t: this.elapsed(), text: interim });
    this.result = { blob: null, lines };
    this.update({
      status: "stopped",
      error: reason ?? null,
      interimTranscript: "",
      finalLines: lines,
      hasMic: false,
      hasScreen: false,
    });
    return this.result;
  }

  private update(patch: Partial<LiveCaptureSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const listener of this.listeners) listener(this.snap);
  }
}

function frameThumb(dataUrl: string): Promise<Uint8ClampedArray | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 18;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, 32, 18);
      const data = ctx.getImageData(0, 0, 32, 18).data;
      const grey = new Uint8ClampedArray(32 * 18);
      for (let i = 0; i < grey.length; i += 1) {
        grey[i] = (data[i * 4] * 3 + data[i * 4 + 1] * 6 + data[i * 4 + 2]) / 10;
      }
      resolve(grey);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export function isEmbeddedInExtension(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
