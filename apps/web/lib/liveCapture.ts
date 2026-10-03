"use client";

import type { BrowserRec } from "@/lib/voiceListen";

export type LiveCaptureStatus = "idle" | "requesting" | "recording" | "stopped" | "error";

export type LiveCaptureSnapshot = {
  status: LiveCaptureStatus;
  error: string | null;
  startedAt: number | null;
  elapsedMs: number;
  interimTranscript: string;
  finalLines: string[];
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
    hasScreen: false,
    hasMic: false,
    displayStream: null,
  };
}

export type LiveCaptureResult = { blob: Blob | null; lines: string[] };

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
  private restartSpeech = true;
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

  async start(): Promise<void> {
    if (this.snap.status === "recording" || this.snap.status === "requesting") return;
    const session = ++this.session;
    this.result = null;
    this.update({ status: "requesting", error: null });

    let displayStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("This browser cannot share a screen.");
      }

      // Must be the first await so it still has the click's user activation.
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "monitor", frameRate: 15 },
          audio: false,
          selfBrowserSurface: "exclude",
          surfaceSwitching: "include",
          monitorTypeSurfaces: "include",
        } as DisplayMediaStreamOptions);
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

      const startedAt = Date.now();
      this.update({
        status: "recording",
        startedAt,
        elapsedMs: 0,
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
    if (this.tickTimer != null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    const lines = [...this.snap.finalLines];
    if (this.snap.interimTranscript.trim()) {
      lines.push(this.snap.interimTranscript.trim());
    }

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

  private startSpeechRecognition() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    this.recognition = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      let interim = "";
      const finals: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript?.trim() ?? "";
        if (!piece) continue;
        if (event.results[i].isFinal) finals.push(piece);
        else interim += `${piece} `;
      }
      if (finals.length) {
        this.update({
          finalLines: [...this.snap.finalLines, ...finals],
          interimTranscript: interim.trim(),
        });
      } else {
        this.update({ interimTranscript: interim.trim() });
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
        ? "Screen sharing was cancelled. Press Record session and click Share to start."
        : "Microphone access is blocked. Allow the mic for this site (lock icon in the address bar) and try again.",
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
