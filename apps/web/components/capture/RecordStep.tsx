"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { APPRENTICE, formatClock, meetsLiveCaptureBar } from "@mira/core";
import { ApprenticeOrb } from "@/components/ApprenticeOrb";
import { formatElapsed, type CaptureController } from "@/lib/liveCapture";
import { useLiveApprentice, type LiveApprenticeResult } from "@/lib/useLiveApprentice";

type Props = {
  /** Already starting/started from the Start click. */
  controller: CaptureController;
  expertName: string;
  onDone: (result: LiveApprenticeResult) => void;
  /** Compact single-column layout for the Chrome side panel. */
  embedded?: boolean;
};

export function RecordStep({ controller, expertName, onDone, embedded = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const [typed, setTyped] = useState("");
  const [finishing, setFinishing] = useState(false);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const { snap, ui, questions, moments, conversation, addTyped, toggleOffRecord, collect } = useLiveApprentice(
    controller,
    expertName,
  );

  const status = snap?.status ?? "requesting";
  const recording = status === "recording";
  const offRecord = Boolean(snap?.offRecord);
  const bar = meetsLiveCaptureBar(questions);
  const guardrailAsked = bar.guardrails;
  const canFinish = bar.ok;
  const firstName = expertName.split(/\s+/)[0] || "You";

  useEffect(() => {
    if (embedded) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = snap?.displayStream ?? null;
    if (snap?.displayStream) void video.play().catch(() => undefined);
  }, [snap?.displayStream, embedded]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.length, snap?.interimTranscript]);

  // Screen share can also be ended from the browser's own "Stop sharing" bar.
  useEffect(() => {
    if (status !== "stopped" || doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current(collect(controller.getResult()?.lines));
  }, [status, controller, collect]);

  async function finish() {
    if (doneRef.current) return;
    setFinishing(true);
    const result = await controller.stop();
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(collect(result.lines));
  }

  function onType(e: FormEvent) {
    e.preventDefault();
    addTyped(typed);
    setTyped("");
  }

  const orbState = ui.speaking ? "speaking" : ui.busy ? "thinking" : ui.awaiting ? "listening" : "waiting";

  const statusLabel = recording
    ? offRecord
      ? `Off record · ${formatElapsed(snap?.elapsedMs ?? 0)}`
      : formatElapsed(snap?.elapsedMs ?? 0)
    : status === "error"
      ? "Could not start"
      : "Starting…";

  const thread = (
    <div className="apprentice-thread" ref={threadRef} aria-live="polite">
      {conversation.length ? (
        conversation.map((line, i) => (
          <p key={`${line.t}-${i}`} className={`apprentice-line apprentice-line--${line.who}`}>
            <span>
              {formatClock(line.t)} · {line.who === "expert" ? firstName : "Apprentice"}
            </span>
            {line.text}
          </p>
        ))
      ) : (
        <p className="muted">
          {embedded
            ? "Talk through your work. Questions appear here."
            : "What you say and what the apprentice asks shows up here."}
        </p>
      )}
      {snap?.interimTranscript ? (
        <p className="apprentice-line apprentice-line--expert apprentice-line--live">{snap.interimTranscript}</p>
      ) : null}
    </div>
  );

  const typeForm = (
    <form className="learn-type" onSubmit={onType}>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={embedded ? "Type a note…" : "No mic? Type your answer or a note…"}
        aria-label="Typed answer"
        disabled={!recording || offRecord}
      />
      <button className="btn" type="submit" disabled={!typed.trim() || !recording || offRecord}>
        Send
      </button>
    </form>
  );

  const finishHint = !canFinish
    ? `Keep going — answer ${Math.max(0, bar.needAsked - bar.asked)} more question${
        bar.needAsked - bar.asked === 1 ? "" : "s"
      }${bar.guardrails < bar.needGuardrails ? " (including 1 about a guardrail)" : ""} while you work.`
    : null;

  const actions = (
    <div className={`hero-actions${embedded ? " ext-record-actions" : ""}`}>
      <button className="btn" type="button" onClick={toggleOffRecord} disabled={!recording}>
        {offRecord ? "On record" : "Off record"}
      </button>
      <button
        className="btn btn-primary"
        type="button"
        onClick={() => void finish()}
        disabled={!recording || finishing || !canFinish}
        title={finishHint ?? undefined}
      >
        {finishing ? "Wrapping up…" : embedded ? "Done" : "Task done → debrief"}
      </button>
      {finishHint ? <p className="muted">{finishHint}</p> : null}
    </div>
  );

  if (embedded) {
    return (
      <div className="ext-record">
        <div className={`ext-rec-bar${recording && !offRecord ? " live" : ""}${offRecord ? " off" : ""}`}>
          <span className="rec-dot" aria-hidden />
          <strong>{statusLabel}</strong>
          <span className="ext-rec-chips" aria-label="Capture status">
            <span className={snap?.hasMic ? "on" : ""}>Mic</span>
            <span className={snap?.hasScreen ? "on" : ""}>Tab</span>
          </span>
        </div>

        {snap?.error ? <p className="error">{snap.error}</p> : null}

        <div className="ext-record-status">
          <ApprenticeOrb state={orbState} ring={ui.quietFrac} ready={ui.ready} off={offRecord} />
          <div>
            <strong>{recording ? ui.label : "Starting capture"}</strong>
            <p className="muted">
              {questions.length}/{APPRENTICE.minLiveQuestions} Q · {guardrailAsked}/
              {APPRENTICE.minGuardrailQuestions} guard · {moments.length} snaps
            </p>
          </div>
        </div>

        {thread}
        {typeForm}
        {actions}
      </div>
    );
  }

  return (
    <div className="flow-layout">
      <main className="panel stack">
        <div className={`rec-banner ${recording && !offRecord ? "live" : ""}`}>
          <span className="rec-dot" aria-hidden />
          <div>
            <strong>
              {recording
                ? offRecord
                  ? `Off the record · ${formatElapsed(snap?.elapsedMs ?? 0)}`
                  : `Recording ${formatElapsed(snap?.elapsedMs ?? 0)}`
                : status === "error"
                  ? "Could not start"
                  : "Waiting for screen + mic permission…"}
            </strong>
            <p className="muted">
              {recording
                ? "Switch to any app and work as usual. Say what you're doing; the apprentice asks why at natural pauses."
                : "Your entire screen is preselected. Just click Share."}
            </p>
          </div>
          <div className="rec-meta">
            <span className="tag">{snap?.hasScreen ? "Screen on" : "No screen"}</span>
            <span className="tag">{snap?.hasMic ? "Mic on" : "No mic"}</span>
          </div>
        </div>

        <div className="capture-preview">
          <video ref={videoRef} muted playsInline className={recording ? "on" : ""} />
          {!recording ? <div className="capture-preview-empty">Live screen preview</div> : null}
        </div>

        {moments.length ? (
          <div className="moment-strip" aria-label="Screen moments">
            {moments.slice(-8).map((m) => (
              <figure key={m.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail */}
                <img src={m.image} alt={`Screen at ${formatClock(m.t)}`} />
                <figcaption>{formatClock(m.t)}</figcaption>
              </figure>
            ))}
          </div>
        ) : null}

        {snap?.error ? <p className="error">{snap.error}</p> : null}

        {actions}
      </main>

      <aside className="panel apprentice-panel">
        <h3>Apprentice</h3>
        <div className="apprentice-status">
          <ApprenticeOrb state={orbState} ring={ui.quietFrac} ready={ui.ready} off={offRecord} />
          <div>
            <strong>{recording ? ui.label : "Not started"}</strong>
            <span className="muted">
              {APPRENTICE.minLiveQuestions} live questions (≥{APPRENTICE.minGuardrailQuestions}{" "}
              guardrail), then stays mostly quiet — rest is debrief
            </span>
          </div>
        </div>

        <dl className="apprentice-counters">
          <div data-ok={questions.length >= APPRENTICE.minLiveQuestions || undefined}>
            <dt>Questions asked</dt>
            <dd>
              {questions.length} <span>/ {APPRENTICE.minLiveQuestions}</span>
            </dd>
          </div>
          <div data-ok={guardrailAsked >= APPRENTICE.minGuardrailQuestions || undefined}>
            <dt>Guardrail questions</dt>
            <dd>
              {guardrailAsked} <span>/ {APPRENTICE.minGuardrailQuestions}</span>
            </dd>
          </div>
          <div>
            <dt>Screen moments</dt>
            <dd>{moments.length}</dd>
          </div>
        </dl>

        {thread}

        {typeForm}
        <p className="apprentice-privacy">
          E-mails, phone and card numbers are redacted before anything leaves this browser. Off the record pauses the
          recording, transcript and screen moments.
        </p>
      </aside>
    </div>
  );
}
