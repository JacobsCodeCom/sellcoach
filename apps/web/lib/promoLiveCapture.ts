import type {
  CaptureController,
  LiveCaptureResult,
  LiveCaptureSnapshot,
  LiveCaptureStartOptions,
} from "@/lib/liveCapture";

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
 * Fake screen+mic capture for Playwright / theater promos.
 * Skips getDisplayMedia so headless recording can drive the live coach UI.
 */
export class PromoLiveCaptureController implements CaptureController {
  private snap = emptySnap();
  private listeners = new Set<Listener>();
  private tickTimer: number | null = null;
  private result: LiveCaptureResult | null = null;
  private frameDataUrl: string | null;

  constructor(frameDataUrl?: string | null) {
    this.frameDataUrl = frameDataUrl ?? null;
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

  async start(_options?: LiveCaptureStartOptions): Promise<void> {
    if (this.snap.status === "recording" || this.snap.status === "requesting") return;
    const startedAt = Date.now();
    this.result = null;
    this.update({
      status: "recording",
      startedAt,
      elapsedMs: 0,
      lastSpeechAt: 0,
      screenChanges: 1,
      lastScreenChangeAt: 0,
      offRecord: false,
      finalLines: [],
      hasScreen: true,
      hasMic: true,
      displayStream: null,
      interimTranscript: "",
      error: null,
    });
    this.tickTimer = window.setInterval(() => {
      if (!this.snap.startedAt) return;
      this.update({ elapsedMs: Date.now() - this.snap.startedAt });
    }, 250);
  }

  async stop(_reason?: string): Promise<LiveCaptureResult> {
    if (this.tickTimer != null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    const lines = this.snap.finalLines;
    this.result = { blob: null, lines };
    this.update({
      status: "stopped",
      hasScreen: false,
      hasMic: false,
      displayStream: null,
    });
    return this.result;
  }

  setMuted(_muted: boolean): void {
    /* no mic */
  }

  setOffRecord(off: boolean): void {
    this.update({ offRecord: off });
  }

  async grabFrame(_maxWidth?: number, _quality?: number): Promise<string | null> {
    return this.frameDataUrl;
  }

  getLatestFrameUrl(): string | null {
    return "http://localhost:3000/promo/desk.html";
  }

  /** Inject learner speech as if the mic heard it. */
  pushSpeech(text: string): void {
    const cleaned = text.trim();
    if (!cleaned || this.snap.status !== "recording") return;
    const t = this.elapsed();
    this.update({
      finalLines: [...this.snap.finalLines, { t, text: cleaned }],
      lastSpeechAt: t,
      interimTranscript: "",
    });
  }

  bumpScreen(): void {
    if (this.snap.status !== "recording") return;
    const t = this.elapsed();
    this.update({
      screenChanges: this.snap.screenChanges + 1,
      lastScreenChangeAt: t,
    });
  }

  private update(patch: Partial<LiveCaptureSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l(this.snap));
  }
}
