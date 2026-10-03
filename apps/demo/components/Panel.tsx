"use client";

import { gateCopy, type Gate } from "@/lib/frames";
import { proofChainLabel } from "@/lib/hints";
import { lessonBeat, lessonTitle } from "@/lib/lessons";
import type { SessionState } from "@/lib/session";
import { clock } from "@/lib/types";

export function Panel({
  state,
  gate,
  ear,
  voice,
  frameTick,
  onAnswer,
  onDrop,
  onReplay,
  onAgent,
  onRoadmap,
  onMoonshot,
  onResetExam,
  onBlindAgent,
  onCaptureReplay,
}: {
  state: SessionState;
  gate: Gate;
  ear: string;
  voice: string;
  frameTick: number;
  onAnswer: (text: string) => void;
  onDrop: () => void;
  onReplay: () => void;
  onAgent: () => void;
  onRoadmap: () => void;
  onMoonshot: () => void;
  onResetExam: () => void;
  onBlindAgent?: () => void;
  onCaptureReplay?: () => void;
}) {
  const lines = state.lines.filter((line) => !line.dropped).slice(-8);
  const open = state.lines.find(
    (line) => line.questionId === state.openQuestionId && line.role === "apprentice" && !line.dropped,
  );
  const teaching = state.phase === "teach" && state.lessonId && state.lessonMode;
  const beat = teaching && state.lessonMode ? lessonBeat(state.lessonMode) : null;
  const mode =
    state.phase === "capture"
      ? "Interviewer"
      : state.phase === "teach" || state.phase === "agent"
        ? "Tutor"
        : "Memory";

  return (
    <aside className="panel relay-panel">
      <header className="panel-head">
        {teaching && state.lessonId && beat ? (
          <>
            <p className="kicker">{beat.kicker}</p>
            <h2>{lessonTitle(state.lessonId)}</h2>
            <p className="quiet">
              {beat.mark} · {mode} · Frame {frameTick}
            </p>
          </>
        ) : (
          <>
            <h2>{gateCopy(gate)}</h2>
            <p className="quiet">
              {mode} · Frame {frameTick} · {state.frameLabel}
            </p>
          </>
        )}
      </header>

      <p className="proof-chain">{proofChainLabel(state.phase)}</p>

      {teaching && beat ? (
        <div className={`lesson-beat is-${state.lessonMode}`}>
          <div className="lesson-beat-rail" aria-label="Lesson beats">
            <span
              className={state.lessonMode === "show" || state.lessonMode === "try" || state.lessonMode === "done" ? "is-on" : ""}
              data-active={state.lessonMode === "show" ? "true" : undefined}
            >
              Start
            </span>
            <span
              className={state.lessonMode === "try" || state.lessonMode === "done" ? "is-on" : ""}
              data-active={state.lessonMode === "try" ? "true" : undefined}
            >
              Try
            </span>
            <span
              className={state.lessonMode === "done" ? "is-on" : ""}
              data-active={state.lessonMode === "done" ? "true" : undefined}
            >
              End
            </span>
          </div>
          <p className="lesson-beat-lead">{beat.lead}</p>
          {state.lessonNote ? <p className="panel-note">{state.lessonNote}</p> : null}
        </div>
      ) : state.lessonNote ? (
        <p className="panel-note">{state.lessonNote}</p>
      ) : null}

      {state.questionQueue.length > 0 ? (
        <div className="q-queue">
          <p className="kicker">Question queue</p>
          <ul>
            {state.questionQueue.slice(-5).map((item, index) => (
              <li key={`${item.id}-${item.status}-${index}`} className={`q-item is-${item.status}`}>
                <span>{item.status}</span>
                <strong>{item.departure}</strong>
                <em>{item.text}</em>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.violation ? (
        <div className="panel-stop">
          <p>{state.violation.title}</p>
          <blockquote>{state.violation.expertWords}</blockquote>
          <p className="quiet">{state.violation.because}</p>
          {state.workMap ? (
            <button type="button" className="text-btn" onClick={onReplay}>
              Replay the screen moment
            </button>
          ) : null}
        </div>
      ) : null}

      {state.actionLog.length > 0 ? (
        <div className="action-log">
          <p className="kicker">Action log</p>
          <ul>
            {state.actionLog.slice(-6).map((item) => (
              <li key={item.id}>
                {clock(item.t)} · {item.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.seat === "owner" && state.flags.length > 0 ? (
        <div className="flag-queue">
          <p className="kicker">Flags for {state.expertName}</p>
          <ul>
            {state.flags.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.phase === "capture" && open ? (
        <form
          className="reply"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const text = String(data.get("reason") || "");
            if (text.trim()) onAnswer(text);
            event.currentTarget.reset();
          }}
        >
          <p>{open.text}</p>
          {open.because ? <small>{open.because}</small> : null}
          <textarea name="reason" placeholder="Say it, or type the reason" />
          <button type="submit">That&apos;s the reason</button>
        </form>
      ) : null}

      <ol className="transcript">
        {lines.map((line) => (
          <li key={line.id} className={`line line-${line.role}`}>
            <span>
              {clock(line.t)} · {line.role}
              {line.guardrail ? " · guardrail" : ""}
            </span>
            <p>{line.text}</p>
            {line.because ? <small>{line.because}</small> : null}
          </li>
        ))}
      </ol>

      {state.seat === "owner" && onCaptureReplay ? (
        <button type="button" className="text-btn" onClick={onCaptureReplay} disabled={state.replayPlaying}>
          {state.replayPlaying ? "Playing capture…" : "Play capture at 2×"}
        </button>
      ) : null}
      {state.seat === "owner" && onBlindAgent && state.progress.friday.passed ? (
        <button type="button" className="text-btn" onClick={onBlindAgent}>
          Contrast · agent without the map
        </button>
      ) : null}
      {state.seat === "owner" && state.progress.friday.passed ? (
        <button type="button" className="text-btn" onClick={onAgent}>
          Agent with the map (demo)
        </button>
      ) : null}
      {state.lessonMode === "done" && state.lessonId === "combined" && !state.progress.combined.competent ? (
        <button type="button" className="solid" onClick={onResetExam}>
          Reset for a clean run
        </button>
      ) : null}
      {state.lessonMode === "done" ? (
        <button type="button" className="text-btn" onClick={onRoadmap}>
          Back to the roadmap
        </button>
      ) : null}
      {state.phase === "agent" && state.violation ? (
        <button type="button" className="solid" onClick={onMoonshot}>
          The living desk
        </button>
      ) : null}

      <div className="panel-foot">
        <button type="button" className="text-btn" onClick={onDrop}>
          {state.droppedFlash ? "Dropped from the record" : "Off the record"}
        </button>
        <p className="privacy-note">
          Mic only while this seat is live · Off the record drops ~30s · No continuous screen record
        </p>
        <p className="quiet">
          {voice} · {earCopy(ear)}
          {state.handsSource ? ` · hands ${state.handsSource}` : ""}
        </p>
        <p className="quiet">Stored frames keep [phone]. Site numbers stay on Northlane glass.</p>
      </div>
    </aside>
  );
}

function earCopy(ear: string) {
  if (ear === "scribe") return "Scribe listening";
  if (ear === "agent") return "Agent listening";
  if (ear === "browser") return "Browser ear";
  if (ear === "agent-error") return "Agent unavailable";
  if (ear === "no-mic") return "No microphone found";
  return "Ear starts on the first click";
}
