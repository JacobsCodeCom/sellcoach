"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatElapsed,
  type LiveCaptureController,
  type LiveCaptureResult,
  type LiveCaptureSnapshot,
} from "@/lib/liveCapture";

type Props = {
  /** Already started from the Record click (getDisplayMedia needs the user gesture). */
  controller: LiveCaptureController;
  onLiveLines: (lines: string[]) => void;
  onStopped: (payload: LiveCaptureResult) => void;
};

export function CaptureRecorder({ controller, onLiveLines, onStopped }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [snap, setSnap] = useState<LiveCaptureSnapshot>(() => controller.getSnapshot());
  const onStoppedRef = useRef(onStopped);
  onStoppedRef.current = onStopped;
  const stoppedHandledRef = useRef(false);

  useEffect(() => {
    stoppedHandledRef.current = false;
    return controller.subscribe((next) => {
      setSnap(next);
      if (next.finalLines.length) onLiveLines(next.finalLines);
    });
  }, [controller, onLiveLines]);

  useEffect(() => {
    if (snap.status !== "stopped" || stoppedHandledRef.current) return;
    const result = controller.getResult();
    if (!result) return;
    stoppedHandledRef.current = true;
    onStoppedRef.current(result);
  }, [snap.status, controller]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (snap.displayStream) {
      video.srcObject = snap.displayStream;
      void video.play().catch(() => undefined);
    } else {
      video.srcObject = null;
    }
  }, [snap.displayStream]);

  const recording = snap.status === "recording";
  const requesting = snap.status === "requesting";

  return (
    <div className="stack capture-recorder">
      <div className={`rec-banner ${recording ? "live" : ""}`}>
        <span className="rec-dot" aria-hidden />
        <div>
          <strong>
            {recording
              ? `Recording ${formatElapsed(snap.elapsedMs)}`
              : requesting
                ? "Waiting for screen + mic permission…"
                : snap.status === "error"
                  ? "Could not start"
                  : "Starting…"}
          </strong>
          <p className="muted">
            {recording
              ? "Your whole screen is being recorded. Switch to any app or window and talk through what you do."
              : "Your entire screen is preselected. Just click Share."}
          </p>
        </div>
        <div className="rec-meta">
          <span className="tag">{snap.hasScreen ? "Screen on" : "No screen"}</span>
          <span className="tag">{snap.hasMic ? "Mic on" : "No mic"}</span>
        </div>
      </div>

      <div className="capture-preview">
        <video ref={videoRef} muted playsInline className={recording ? "on" : ""} />
        {!recording ? <div className="capture-preview-empty">Live screen preview</div> : null}
      </div>

      {(snap.finalLines.length > 0 || snap.interimTranscript) && (
        <div className="transcript panel">
          <h3>Live voice</h3>
          <ul className="list">
            {snap.finalLines.map((line, index) => (
              <li key={`${index}-${line.slice(0, 12)}`}>
                <span>{line}</span>
              </li>
            ))}
            {snap.interimTranscript ? (
              <li className="muted">
                <em>{snap.interimTranscript}</em>
              </li>
            ) : null}
          </ul>
        </div>
      )}

      <div className="hero-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => void controller.stop()}
          disabled={!recording}
        >
          End session
        </button>
      </div>
    </div>
  );
}
