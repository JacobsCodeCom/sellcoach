"use client";

import { useEffect, useRef, useState } from "react";
import {
  ensureMinOpenQuestions,
  localTeachBack,
  MIN_DEBRIEF_QUESTIONS,
  type CaptureSession,
  type TranscriptLine,
  type WorkMap,
} from "@mira/core";
import { ApprenticeOrb } from "@/components/ApprenticeOrb";
import { VoiceReply } from "@/components/VoiceReply";
import { WorkMapStats, WorkMapView } from "@/components/workmap/WorkMapView";
import { cancelSpeech, enqueueSpeech, onAgentSpeaking } from "@/lib/speak";

type Props = {
  capture: CaptureSession;
  expertName: string;
  onDraft: (map: WorkMap) => void;
  onConfirmed: (map: WorkMap, debrief: TranscriptLine[]) => void;
  /** Drop the recording without publishing. */
  onDiscard: () => void;
  /** Compact layout for the Chrome side panel. */
  embedded?: boolean;
};

type Phase = "drafting" | "ready" | "questions" | "teachback" | "finalising";

/** Pick up to 6 moments for the model: the ones questions point at first, then evenly spaced. */
function momentsForDraft(capture: CaptureSession) {
  const moments = capture.moments ?? [];
  const asked = new Set((capture.questions ?? []).map((q) => q.momentId).filter(Boolean));
  const picked = moments.filter((m) => asked.has(m.id)).slice(0, 6);
  const rest = moments.filter((m) => !asked.has(m.id));
  const step = Math.max(1, Math.floor(rest.length / Math.max(1, 6 - picked.length)));
  for (let i = 0; i < rest.length && picked.length < 6; i += step) picked.push(rest[i]);
  const withImage = new Set(picked.map((m) => m.id));
  return moments.map((m) =>
    withImage.has(m.id) ? m : { id: m.id, t: m.t, ...(m.url ? { url: m.url } : {}) },
  );
}

export function DebriefStep({
  capture,
  expertName,
  onDraft,
  onConfirmed,
  onDiscard,
  embedded = false,
}: Props) {
  const draft = capture.workMap ? ensureMinOpenQuestions(capture.workMap) : null;
  const [phase, setPhase] = useState<Phase>(draft ? "ready" : "drafting");
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [debrief, setDebrief] = useState<TranscriptLine[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const [teachBackDraft, setTeachBackDraft] = useState(draft?.teachBack || "");
  const debriefRef = useRef<TranscriptLine[]>([]);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);
  const firstName = expertName.split(/\s+/)[0] || "there";
  const live = phase === "questions" || phase === "teachback" || phase === "finalising";
  const openQuestions = draft?.openQuestions ?? [];

  useEffect(() => onAgentSpeaking(setSpeaking), []);
  useEffect(() => () => cancelSpeech(), []);
  useEffect(() => {
    if (!live) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [live]);
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [debrief.length]);

  // Persist padded follow-ups when an older draft had fewer than the challenge bar.
  useEffect(() => {
    const raw = capture.workMap;
    if (!raw || phase !== "ready") return;
    const padded = ensureMinOpenQuestions(raw);
    if (
      padded.openQuestions.length !== raw.openQuestions.length ||
      padded.openQuestions.some((q, i) => q !== raw.openQuestions[i])
    ) {
      onDraft(padded);
    }
    setTeachBackDraft((prev) => prev.trim() || padded.teachBack || localTeachBack(padded));
  }, [capture.workMap, phase, onDraft]);

  useEffect(() => {
    if (draft || startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/capture/workmap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "draft",
            expertName,
            transcript: capture.transcript ?? [],
            questions: capture.questions ?? [],
            moments: momentsForDraft(capture),
          }),
        });
        const out = (await res.json()) as { map?: WorkMap; error?: string };
        if (!out.map) throw new Error(out.error || "Could not draft the Work Map");
        const map = ensureMinOpenQuestions(out.map);
        onDraft(map);
        setTeachBackDraft(map.teachBack || localTeachBack(map));
        setPhase("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not draft the Work Map");
      }
    })();
  }, [draft, capture, expertName, onDraft, attempt]);

  function log(who: TranscriptLine["who"], text: string) {
    const line = { t: Date.now(), who, text };
    debriefRef.current = [...debriefRef.current, line];
    setDebrief(debriefRef.current);
  }

  function say(text: string) {
    log("apprentice", text);
    void enqueueSpeech(text);
  }

  function ask(index: number) {
    if (!draft) return;
    const qs = openQuestions;
    if (index < qs.length) {
      setQIndex(index);
      say(qs[index]);
      return;
    }
    beginTeachBack();
  }

  function startDebrief() {
    if (!draft) return;
    debriefRef.current = [];
    setDebrief([]);
    const n = openQuestions.length;
    setPhase("questions");
    say(
      `Thanks ${firstName}. I have ${n} ${n === 1 ? "thing" : "things"} I'm still not sure about — then I'll explain the process back for you to confirm.`,
    );
    ask(0);
  }

  function onAnswer(text: string) {
    cancelSpeech();
    log("expert", text);
    if (phase === "questions") ask(qIndex + 1);
  }

  function beginTeachBack() {
    if (!draft) return;
    const tb = (teachBackDraft || draft.teachBack || localTeachBack(draft)).trim();
    setTeachBackDraft(tb);
    setPhase("teachback");
    say(`Let me explain the whole process back. ${tb} Is that right, or what should I change?`);
  }

  function confirmTeachBack(correctionOrYes: string) {
    cancelSpeech();
    const reply = correctionOrYes.trim();
    if (reply) log("expert", reply);
    void finish();
  }

  async function finish() {
    if (!draft) return;
    setPhase("finalising");
    setError(null);
    const tb = teachBackDraft.trim() || draft.teachBack || localTeachBack(draft);
    if (!debriefRef.current.some((l) => /explain the whole process|understood it/i.test(l.text))) {
      log("apprentice", `Let me explain the whole process back. ${tb}`);
    }
    say("Got it — I'll turn this into the Work Map now.");
    try {
      const res = await fetch("/api/capture/workmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "final",
          expertName,
          draft: { ...draft, teachBack: tb },
          debrief: debriefRef.current,
          moments: (capture.moments ?? []).map(({ id, t, url }) => ({
            id,
            t,
            ...(url ? { url } : {}),
          })),
        }),
      });
      const out = (await res.json()) as { map?: WorkMap; error?: string };
      if (!out.map) throw new Error(out.error || "Could not finalise the Work Map");
      onConfirmed({ ...out.map, teachBack: out.map.teachBack || tb, confirmed: true }, debriefRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finalise the Work Map");
    }
  }

  const busy = phase === "drafting" || phase === "finalising";
  const orbState =
    speaking
      ? "speaking"
      : busy
        ? "thinking"
        : phase === "questions" || phase === "teachback"
          ? "listening"
          : "waiting";
  const status =
    phase === "drafting"
      ? "Going through what I saw…"
      : phase === "finalising"
        ? "Writing the Work Map…"
        : speaking
          ? "Asking…"
          : phase === "questions"
            ? `Question ${qIndex + 1} of ${openQuestions.length}`
            : phase === "teachback"
              ? "Confirm the teach-back"
              : "Ready for the debrief";

  const mapPanel = (
    <main className={`panel stack${live ? " debrief-map" : ""}`}>
      <div className="flow-head">
        <div>
          <h2>{draft?.title ?? "Drafting the Work Map"}</h2>
          <p className="muted">Draft. Every step links to a screen moment and your own words.</p>
        </div>
        {draft ? <WorkMapStats map={draft} /> : null}
      </div>
      {draft ? (
        <WorkMapView map={draft} moments={capture.moments ?? []} expertName={expertName} />
      ) : error ? null : (
        <p className="muted">Reading the transcript, your answers and the screen moments…</p>
      )}
      {error ? (
        <div className="hero-actions">
          <p className="error">{error}</p>
          {!draft ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setError(null);
                startedRef.current = false;
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );

  const currentQuestion =
    phase === "questions" && draft ? openQuestions[qIndex] ?? null : null;

  const replyControls =
    phase === "questions" ? (
      <div className="debrief-reply">
        <VoiceReply disabled={speaking} placeholder="Or type your answer…" onSubmit={onAnswer} />
      </div>
    ) : phase === "teachback" ? (
      <div className="debrief-reply debrief-teachback">
        <label className="muted" htmlFor="teachback-edit">
          Teach-back — edit if anything is wrong
        </label>
        <textarea
          id="teachback-edit"
          className="debrief-teachback-text"
          value={teachBackDraft}
          onChange={(e) => setTeachBackDraft(e.target.value)}
          rows={embedded ? 5 : 6}
        />
        <VoiceReply
          disabled={speaking}
          placeholder="Say yes, or speak a correction…"
          onSubmit={confirmTeachBack}
        />
        <button
          className="btn btn-primary"
          type="button"
          disabled={!teachBackDraft.trim() || speaking}
          onClick={() => confirmTeachBack("Yes, that's how it works")}
        >
          Yes, that&apos;s how it works
        </button>
      </div>
    ) : null;

  if (live) {
    return (
      <div className={`debrief-focus${embedded ? " ext-debrief" : ""}`}>
        <div className="debrief-focus-bar">
          <p className="muted">
            {phase === "finalising"
              ? "Writing…"
              : phase === "teachback"
                ? "Teach-back"
                : `${qIndex + 1} / ${openQuestions.length}`}
          </p>
          {draft && !embedded ? (
            <button className="btn-text" type="button" onClick={() => setShowMap((v) => !v)}>
              {showMap ? "Hide map" : "Map"}
            </button>
          ) : null}
        </div>
        {showMap && !embedded ? mapPanel : null}
        <aside className="panel apprentice-panel apprentice-panel--stage" aria-live="polite">
          {phase === "finalising" ? (
            error ? (
              <div className="hero-actions">
                <p className="error">{error}</p>
                <button className="btn" type="button" onClick={() => void finish()}>
                  Try again
                </button>
              </div>
            ) : (
              <p className="debrief-prompt-text muted">Writing the Work Map…</p>
            )
          ) : phase === "teachback" ? (
            <p className="debrief-prompt-text">Does this match how you work?</p>
          ) : (
            <p className="debrief-prompt-text">{currentQuestion}</p>
          )}
          {replyControls}
        </aside>
      </div>
    );
  }

  if (embedded) {
    const openCount = openQuestions.length;
    return (
      <div className="ext-debrief-ready">
        <div className="ext-record-status">
          <ApprenticeOrb state={orbState} ring={0} />
          <div>
            <strong>{draft?.title ?? "Drafting…"}</strong>
            <p className="muted">
              {phase === "drafting"
                ? "Building your Work Map…"
                : `${Math.max(openCount, MIN_DEBRIEF_QUESTIONS)} follow-ups, then teach-back`}
            </p>
          </div>
        </div>
        {error ? (
          <div className="hero-actions ext-record-actions">
            <p className="error">{error}</p>
            {!draft ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setError(null);
                  startedRef.current = false;
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
        {phase === "ready" ? (
          <div className="ext-debrief-actions">
            <button className="btn btn-primary btn-lg" type="button" onClick={startDebrief}>
              Start debrief
            </button>
            <button className="debrief-skip" type="button" onClick={onDiscard}>
              Discard recording
            </button>
          </div>
        ) : (
          <button className="debrief-skip" type="button" onClick={onDiscard}>
            Discard recording
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flow-layout">
      {mapPanel}
      <aside className="panel apprentice-panel">
        <h3>Debrief</h3>
        <div className="apprentice-status">
          <ApprenticeOrb state={orbState} ring={0} />
          <div>
            <strong>{status}</strong>
            <span className="muted">
              At least {MIN_DEBRIEF_QUESTIONS} follow-ups on what wasn&apos;t covered live, then
              teach-back.
            </span>
          </div>
        </div>

        {phase === "ready" ? (
          <div className="hero-actions">
            <button className="btn btn-primary" type="button" onClick={startDebrief}>
              Start debrief
            </button>
            <button className="btn-ghost" type="button" onClick={onDiscard}>
              Discard recording
            </button>
          </div>
        ) : phase === "drafting" ? (
          <button className="btn-ghost" type="button" onClick={onDiscard}>
            Discard recording
          </button>
        ) : null}

        <div className="apprentice-thread" ref={threadRef} aria-live="polite">
          {debrief.map((line, i) => (
            <p key={i} className={`apprentice-line apprentice-line--${line.who}`}>
              <span>{line.who === "expert" ? firstName : "Apprentice"}</span>
              {line.text}
            </p>
          ))}
        </div>

        {openQuestions.length ? (
          <div className="wm-open">
            <h4>Still unclear ({openQuestions.length})</h4>
            <ul>
              {openQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
