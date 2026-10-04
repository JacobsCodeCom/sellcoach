"use client";

import { useEffect, useState } from "react";

export default function EnableMicPage() {
  const [status, setStatus] = useState<"idle" | "asking" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function enable() {
    setStatus("asking");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.getTracks().forEach((t) => t.stop());
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Permission denied. Use the lock icon in the address bar and allow Microphone for this site."
          : err instanceof Error
            ? err.message
            : "Could not access the microphone",
      );
    }
  }

  useEffect(() => {
    void enable();
  }, []);

  return (
    <main className="auth-wrap shell">
      <div className="panel auth-card stack">
        <p className="tag">Mira · one-time setup</p>
        <h1>Allow microphone</h1>
        <p className="muted">
          Chrome can&apos;t show the mic prompt inside the extension side panel. Allow it here once;
          then go back to Mira and press <strong>Start session</strong>.
        </p>
        {status === "asking" || status === "idle" ? (
          <p className="muted">Waiting for the browser permission dialog…</p>
        ) : null}
        {status === "ok" ? (
          <p>
            Microphone enabled. You can close this tab and start recording in the side panel.
          </p>
        ) : null}
        {status === "error" ? <p className="error">{error}</p> : null}
        <div className="admin-invite-actions">
          {status !== "ok" ? (
            <button className="btn btn-primary" type="button" onClick={() => void enable()}>
              Allow microphone
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={() => window.close()}>
              Close tab
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
