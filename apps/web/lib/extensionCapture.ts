"use client";

import type { LiveCaptureResult, LiveCaptureSnapshot, TimedLine } from "@/lib/liveCapture";

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

/**
 * Capture controller driven by the Chrome extension parent page:
 * mic + speech + tab screenshots — no screen-share picker.
 */
export class ExtensionCaptureController {
  private snap = emptySnap();
  private listeners = new Set<Listener>();
  private tickTimer: number | null = null;
  private latestFrame: string | null = null;
  private latestFrameUrl: string | null = null;
  private muted = false;
  private result: LiveCaptureResult | null = null;
  private onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.source !== "mira-extension") return;
    if (data.type === "mira:capture-started") {
      const startedAt = typeof data.startedAt === "number" ? data.startedAt : Date.now();
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
      if (this.snap.offRecord || this.muted || this.snap.status !== "recording") return;
      const finals = Array.isArray(data.finals) ? (data.finals as TimedLine[]) : [];
      const interim = typeof data.interim === "string" ? data.interim : "";
      const nextLines = finals.length ? [...this.snap.finalLines, ...finals] : this.snap.finalLines;
      this.update({
        finalLines: nextLines,
        interimTranscript: interim,
        lastSpeechAt: this.elapsed(),
      });
      return;
    }
    if (data.type === "mira:capture-frame" && typeof data.image === "string") {
      if (this.snap.offRecord || this.snap.status !== "recording") return;
      this.latestFrame = data.image;
      this.latestFrameUrl =
        typeof data.url === "string" && (data.url.startsWith("http://") || data.url.startsWith("https://"))
          ? data.url
          : null;
      this.update({
        screenChanges: this.snap.screenChanges + 1,
        lastScreenChangeAt: this.elapsed(),
        hasScreen: true,
      });
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

  setMuted(muted: boolean) {
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
  }

  private async finishStop(reason?: string): Promise<LiveCaptureResult> {
    if (this.tickTimer != null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
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

export function isEmbeddedInExtension(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
