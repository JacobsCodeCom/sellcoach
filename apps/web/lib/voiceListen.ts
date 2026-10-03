"use client";

export type BrowserRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserRec;
    webkitSpeechRecognition?: new () => BrowserRec;
  }
}

export type VoiceListenHandlers = {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  /** User started talking over the agent (barge-in). */
  onBargeIn?: () => void;
  onListeningChange: (listening: boolean) => void;
  onError?: (message: string) => void;
};

export function micEnvironmentHint(): string | null {
  if (typeof window === "undefined") return null;
  const ua = navigator.userAgent || "";
  // Cursor / VS Code Simple Browser and many Electron embeds block mic prompts.
  if (/Electron|Cursor|VSCode|Code[/ ]/i.test(ua) || (window as Window & { cursorBrowser?: unknown }).cursorBrowser) {
    return "This editor browser usually cannot grant microphone access. Open localhost in Chrome or Edge instead.";
  }
  if (!window.isSecureContext) {
    return "Microphone needs a secure context (https or http://localhost).";
  }
  if (!navigator.mediaDevices?.getUserMedia && !(window.SpeechRecognition || window.webkitSpeechRecognition)) {
    return "This browser has no microphone / speech APIs.";
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Browser speech recognition with live interim transcripts.
 * Prefers SpeechRecognition's own mic prompt — getUserMedia is optional and timed out,
 * because Cursor's embedded browser often hangs on getUserMedia with no UI.
 */
export class VoiceListenController {
  private recognition: BrowserRec | null = null;
  private micStream: MediaStream | null = null;
  private wantListen = false;
  private paused = false;
  private bargeInArmed = false;
  private handlers: VoiceListenHandlers;
  private restartTimer: number | null = null;

  constructor(handlers: VoiceListenHandlers) {
    this.handlers = handlers;
  }

  get supported(): boolean {
    if (typeof window === "undefined") return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  get hasMic(): boolean {
    return Boolean(this.micStream?.getAudioTracks().some((t) => t.readyState === "live"));
  }

  setBargeInArmed(armed: boolean) {
    this.bargeInArmed = armed;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused && !this.bargeInArmed) {
      this.stopRecognition();
      this.handlers.onPartial("");
    } else if (!paused && this.wantListen) {
      this.startRecognition();
    } else if (paused && this.bargeInArmed && this.wantListen) {
      this.startRecognition();
    }
  }

  async start(): Promise<boolean> {
    const envHint = micEnvironmentHint();
    if (!this.supported) {
      this.handlers.onError?.(
        envHint ||
          "Live voice needs Chrome or Edge (with speech recognition). Open http://localhost:3000 there.",
      );
      return false;
    }

    this.wantListen = true;

    // Optional: warm the mic. Never block the voice UX if this hangs (common in Cursor).
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        this.micStream = await withTimeout(
          navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          }),
          4000,
          "mic-timeout",
        );
      } catch (err) {
        this.micStream = null;
        const name = err instanceof DOMException ? err.name : "";
        const timedOut = err instanceof Error && err.message === "mic-timeout";
        if (timedOut || name === "NotAllowedError" || name === "PermissionDeniedError") {
          // Still try SpeechRecognition — Chrome may prompt there. If we're in Cursor, warn clearly.
          if (envHint) {
            this.handlers.onError?.(envHint);
            this.wantListen = false;
            this.handlers.onListeningChange(false);
            return false;
          }
        }
      }
    } else if (envHint) {
      this.handlers.onError?.(envHint);
      this.wantListen = false;
      this.handlers.onListeningChange(false);
      return false;
    }

    this.handlers.onListeningChange(true);
    if (!this.paused || this.bargeInArmed) this.startRecognition();
    return true;
  }

  stop() {
    this.wantListen = false;
    this.bargeInArmed = false;
    if (this.restartTimer != null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.stopRecognition();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.handlers.onPartial("");
    this.handlers.onListeningChange(false);
  }

  private startRecognition() {
    if (this.recognition || !this.wantListen) return;
    if (this.paused && !this.bargeInArmed) return;
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
      const interimText = interim.trim();
      if (this.bargeInArmed && this.paused && interimText.length >= 10) {
        this.handlers.onBargeIn?.();
      }
      if (finals.length) {
        for (const line of finals) {
          const text = line.trim();
          if (text.length > 2) this.handlers.onFinal(text);
        }
      }
      this.handlers.onPartial(interimText);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed") {
        this.handlers.onError?.(
          micEnvironmentHint() ||
            "Microphone blocked. Allow mic for this site in Chrome/Edge, then retry.",
        );
        this.stop();
        return;
      }
    };
    rec.onend = () => {
      this.recognition = null;
      if (this.wantListen && (!this.paused || this.bargeInArmed)) {
        this.restartTimer = window.setTimeout(() => {
          this.restartTimer = null;
          this.startRecognition();
        }, 160);
      }
    };
    try {
      rec.start();
    } catch {
      this.recognition = null;
    }
  }

  private stopRecognition() {
    if (this.restartTimer != null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (!this.recognition) return;
    const rec = this.recognition;
    this.recognition = null;
    rec.onend = null;
    try {
      rec.abort?.() ?? rec.stop();
    } catch {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
  }
}
