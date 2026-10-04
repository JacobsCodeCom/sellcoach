"use client";

import type { BrowserRec } from "@/lib/voiceListen";

export type LiveCaptureStatus = "idle" | "requesting" | "recording" | "stopped" | "error";

/** `t` is ms since recording started. */
export type TimedLine = { t: number; text: string };

export type LiveCaptureSnapshot = {
  status: LiveCaptureStatus;
  error: string | null;
  startedAt: number | null;
  elapsedMs: number;
  interimTranscript: string;
  finalLines: TimedLine[];
  /** Last time (ms since start) the expert was heard, interim results included. */
  lastSpeechAt: number;
  /** Count of noticeable screen changes, and when the last one happened. */
  screenChanges: number;
  lastScreenChangeAt: number;
  offRecord: boolean;
  hasScreen: boolean;
  hasMic: boolean;
  displayStream: MediaStream | null;
};

type Listener = (snap: LiveCaptureSnapshot) => void;

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

export type LiveCaptureResult = { blob: Blob | null; lines: TimedLine[] };

type ImageCaptureLike = { grabFrame: () => Promise<ImageBitmap> };
declare global {
  interface Window {
    ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike;
  }
}

const SCREEN_CHECK_MS = 2000;
/** Mean per-pixel grey difference (0–255) on a 32×18 thumbnail that counts as a screen change. */
const SCREEN_CHANGE_THRESHOLD = 5;
/** Ignore speech results this long after the apprentice stops talking (speaker echo). */
const ECHO_TAIL_MS = 1800;

export type LiveCaptureStartOptions = {
  /**
   * Prefer sharing the active browser tab (one Share click) instead of the full
   * monitor picker. Best default inside the Chrome extension side panel.
   */
  preferCurrentTab?: boolean;
};

/** Shared surface for browser capture and extension-bridged capture. */
export type CaptureController = {
  subscribe(listener: (snap: LiveCaptureSnapshot) => void): () => void;
  getSnapshot(): LiveCaptureSnapshot;
  getResult(): LiveCaptureResult | null;
  elapsed(): number;
  start(options?: LiveCaptureStartOptions): Promise<void>;
  stop(reason?: string): Promise<LiveCaptureResult>;
  setMuted(muted: boolean): void;
  setOffRecord(off: boolean): void;
  grabFrame(maxWidth?: number, quality?: number): Promise<string | null>;
  /** Extension capture may attach the active tab URL to the latest frame. */
  getLatestFrameUrl?(): string | null;
};

/**
 * Screen + mic capture that keeps running after you switch tabs or windows
 * (as long as the shared display track stays live).
 *
 * `start()` must be called synchronously from a click handler: getDisplayMedia
 * needs transient user activation.
 */
export class LiveCaptureController {
  private snap = emptySnap();
  private listeners = new Set<Listener>();
  private displayStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private mixedStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recognition: BrowserRec | null = null;
  private tickTimer: number | null = null;
  private screenTimer: number | null = null;
  private frameVideo: HTMLVideoElement | null = null;
  private lastThumb: Uint8ClampedArray | null = null;
  private restartSpeech = true;
  private muted = false;
  private ignoreSpeechUntil = 0;
  private session = 0;
  private result: LiveCaptureResult | null = null;
  private onVisibility = () => {
    if (document.visibilityState === "visible") this.kickSpeech();
  };

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

  async start(options: LiveCaptureStartOptions = {}): Promise<void> {
    if (this.snap.status === "recording" || this.snap.status === "requesting") return;
    const session = ++this.session;
    this.result = null;
    this.update({ status: "requesting", error: null });

    let displayStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;
    const preferCurrentTab = options.preferCurrentTab ?? false;
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("This browser cannot share a screen.");
      }

      // Must be the first await so it still has the click's user activation.
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia(
          (preferCurrentTab
            ? {
                video: { frameRate: 15 },
                audio: false,
                preferCurrentTab: true,
                selfBrowserSurface: "include",
                surfaceSwitching: "include",
                systemAudio: "exclude",
              }
            : {
                video: { displaySurface: "monitor", frameRate: 15 },
                audio: false,
                selfBrowserSurface: "exclude",
                surfaceSwitching: "include",
                monitorTypeSurfaces: "include",
              }) as unknown as DisplayMediaStreamOptions,
        );
      } catch (err) {
        throw friendlyError(err, "screen");
      }

      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch (err) {
        throw friendlyError(err, "mic");
      }

      if (session !== this.session) {
        for (const s of [displayStream, micStream]) s.getTracks().forEach((t) => t.stop());
        return;
      }

      const mixed = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...micStream.getAudioTracks(),
      ]);

      this.displayStream = displayStream;
      this.micStream = micStream;
      this.mixedStream = mixed;
      this.chunks = [];

      const mime = pickMimeType();
      const recorder = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.start(1000);
      this.recorder = recorder;

      displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        void this.stop("Screen share ended.");
      });

      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = displayStream;
      void video.play().catch(() => undefined);
      this.frameVideo = video;
      this.lastThumb = null;

      const startedAt = Date.now();
      this.update({
        status: "recording",
        startedAt,
        elapsedMs: 0,
        lastSpeechAt: 0,
        screenChanges: 0,
        lastScreenChangeAt: 0,
        offRecord: false,
        finalLines: [],
        hasScreen: displayStream.getVideoTracks().length > 0,
        hasMic: micStream.getAudioTracks().length > 0,
        displayStream,
        interimTranscript: "",
        error: null,
      });

      this.restartSpeech = true;
      this.startSpeechRecognition();
      document.addEventListener("visibilitychange", this.onVisibility);
      window.addEventListener("focus", this.onVisibility);

      this.tickTimer = window.setInterval(() => {
        if (!this.snap.startedAt) return;
        this.update({ elapsedMs: Date.now() - this.snap.startedAt });
      }, 250);
      this.screenTimer = window.setInterval(() => void this.checkScreen(), SCREEN_CHECK_MS);
    } catch (err) {
      for (const s of [displayStream, micStream]) s?.getTracks().forEach((t) => t.stop());
      this.cleanupStreams();
      if (session !== this.session) return;
      this.update({
        status: "error",
        error: err instanceof Error ? err.message : "Could not start capture",
        displayStream: null,
        hasMic: false,
        hasScreen: false,
      });
      throw err;
    }
  }

  async stop(reason?: string): Promise<LiveCaptureResult> {
    if (this.snap.status === "requesting") {
      this.session += 1;
      this.update({ status: "idle" });
      return { blob: null, lines: [] };
    }
    if (this.snap.status !== "recording") {
      return this.result ?? { blob: null, lines: [] };
    }
    this.session += 1;
    this.restartSpeech = false;
    this.stopSpeechRecognition();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("focus", this.onVisibility);
    for (const timer of [this.tickTimer, this.screenTimer]) {
      if (timer != null) window.clearInterval(timer);
    }
    this.tickTimer = null;
    this.screenTimer = null;

    const lines = [...this.snap.finalLines];
    const interim = this.snap.interimTranscript.trim();
    if (interim && !this.snap.offRecord) lines.push({ t: this.elapsed(), text: interim });

    let blob: Blob | null = null;
    if (this.recorder && this.recorder.state !== "inactive") {
      blob = await new Promise<Blob | null>((resolve) => {
        const rec = this.recorder!;
        rec.onstop = () => {
          resolve(this.chunks.length ? new Blob(this.chunks, { type: rec.mimeType || "video/webm" }) : null);
        };
        try {
          rec.stop();
        } catch {
          resolve(null);
        }
      });
    }

    this.cleanupStreams();
    this.result = { blob, lines };
    this.update({
      status: "stopped",
      error: reason ?? null,
      displayStream: null,
      interimTranscript: "",
      finalLines: lines,
      hasMic: false,
      hasScreen: false,
    });
    return this.result;
  }

  /** Drop speech while the apprentice is talking so its own voice isn't transcribed. */
  setMuted(muted: boolean) {
    if (this.muted && !muted) this.ignoreSpeechUntil = Date.now() + ECHO_TAIL_MS;
    this.muted = muted;
    if (muted) this.update({ interimTranscript: "" });
  }

  /** Pause recording, transcript and screen tracking until turned back on. */
  setOffRecord(off: boolean) {
    if (this.snap.status !== "recording" || this.snap.offRecord === off) return;
    try {
      if (off && this.recorder?.state === "recording") this.recorder.pause();
      if (!off && this.recorder?.state === "paused") this.recorder.resume();
    } catch {
      // Some browsers can't pause MediaRecorder; the transcript is still dropped.
    }
    this.lastThumb = null;
    this.update({ offRecord: off, interimTranscript: "" });
  }

  /** JPEG data URL of the current shared screen, or null if no frame is ready. */
  async grabFrame(maxWidth = 480, quality = 0.6): Promise<string | null> {
    const source = await this.frameSource();
    if (!source) return null;
    const scale = Math.min(1, maxWidth / source.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source.image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }

  private async frameSource(): Promise<{ image: CanvasImageSource; width: number; height: number } | null> {
    const video = this.frameVideo;
    if (video && video.readyState >= 2 && video.videoWidth) {
      return { image: video, width: video.videoWidth, height: video.videoHeight };
    }
    const track = this.displayStream?.getVideoTracks()[0];
    if (!track || !window.ImageCapture) return null;
    try {
      const bitmap = await Promise.race([
        new window.ImageCapture(track).grabFrame(),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
      ]);
      return bitmap ? { image: bitmap, width: bitmap.width, height: bitmap.height } : null;
    } catch {
      return null;
    }
  }

  private async checkScreen() {
    if (this.snap.status !== "recording" || this.snap.offRecord) return;
    const source = await this.frameSource();
    if (!source) return;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(source.image, 0, 0, 32, 18);
    const data = ctx.getImageData(0, 0, 32, 18).data;
    const grey = new Uint8ClampedArray(32 * 18);
    for (let i = 0; i < grey.length; i += 1) {
      grey[i] = (data[i * 4] * 3 + data[i * 4 + 1] * 6 + data[i * 4 + 2]) / 10;
    }
    const prev = this.lastThumb;
    this.lastThumb = grey;
    if (!prev) return;
    let diff = 0;
    for (let i = 0; i < grey.length; i += 1) diff += Math.abs(grey[i] - prev[i]);
    if (diff / grey.length >= SCREEN_CHANGE_THRESHOLD) {
      this.update({ screenChanges: this.snap.screenChanges + 1, lastScreenChangeAt: this.elapsed() });
    }
  }

  private startSpeechRecognition() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    this.recognition = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      if (this.muted || this.snap.offRecord || Date.now() < this.ignoreSpeechUntil) return;
      let interim = "";
      const finals: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript?.trim() ?? "";
        if (!piece) continue;
        if (event.results[i].isFinal) finals.push(piece);
        else interim += `${piece} `;
      }
      const t = this.elapsed();
      if (finals.length) {
        this.update({
          finalLines: [...this.snap.finalLines, ...finals.map((text) => ({ t, text }))],
          interimTranscript: interim.trim(),
          lastSpeechAt: t,
        });
      } else {
        this.update({ interimTranscript: interim.trim(), lastSpeechAt: t });
      }
    };
    rec.onerror = () => {
      // Keep recording media even if speech API flakes in a background tab.
    };
    rec.onend = () => {
      // Chrome ends recognition on silence, network blips and tab switches.
      window.setTimeout(() => this.kickSpeech(), 300);
    };
    this.kickSpeech();
  }

  private kickSpeech() {
    if (!this.recognition || !this.restartSpeech || this.snap.status !== "recording") return;
    try {
      this.recognition.start();
    } catch {
      // Already running.
    }
  }

  private stopSpeechRecognition() {
    if (!this.recognition) return;
    const rec = this.recognition;
    this.recognition = null;
    rec.onend = null;
    try {
      rec.stop();
    } catch {
      // ignore
    }
  }

  private cleanupStreams() {
    this.recorder = null;
    if (this.frameVideo) {
      this.frameVideo.srcObject = null;
      this.frameVideo = null;
    }
    this.lastThumb = null;
    for (const stream of [this.displayStream, this.micStream, this.mixedStream]) {
      stream?.getTracks().forEach((track) => track.stop());
    }
    this.displayStream = null;
    this.micStream = null;
    this.mixedStream = null;
  }

  private update(patch: Partial<LiveCaptureSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener(this.snap);
  }
}

function friendlyError(err: unknown, source: "screen" | "mic"): Error {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "AbortError") {
    return new Error(
      source === "screen"
        ? "Screen sharing was cancelled. Press Start session and click Share to start."
        : "Microphone access is blocked. Chrome can’t ask for the mic inside the side panel — open Enable microphone once, allow it, then Start again.",
    );
  }
  if (name === "NotFoundError") {
    return new Error(source === "mic" ? "No microphone found." : "No screen available to share.");
  }
  return err instanceof Error ? err : new Error("Could not start capture");
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
