"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { coachIntroForLesson, tipChipsForLesson, type Lesson } from "@mira/core";
import { captureFrame, requestCoach, type CoachResult } from "@/lib/lessonCoach";
import { enqueueSpeech } from "@/lib/speak";

type Props = {
  lesson: Lesson;
  onPass: () => void;
};

export function LessonPlayer({ lesson, onPass }: Props) {
  const [explain, setExplain] = useState("");
  const [coach, setCoach] = useState<CoachResult | null>(null);
  const [coachBusy, setCoachBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tips = tipChipsForLesson(lesson);

  useEffect(() => {
    return () => {
      stopShare();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => undefined);
    } else {
      video.srcObject = null;
    }
  }, [sharing]);

  function stopShare() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setSharing(false);
  }

  async function startShare() {
    setShareError(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("This browser cannot share a screen.");
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" } as MediaTrackConstraints,
        audio: false,
      });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => stopShare());
      streamRef.current = stream;
      setSharing(true);
      void askCoach(stream);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Could not share screen");
    }
  }

  async function askCoach(stream?: MediaStream | null) {
    const active = stream ?? streamRef.current;
    setCoachBusy(true);
    setShareError(null);
    try {
      const image = active ? await captureFrame(active) : null;
      const result = await requestCoach({
        title: lesson.title,
        passCriteria: lesson.passCriteria,
        summary: lesson.summary,
        image,
      });
      setCoach(result);
      void enqueueSpeech(result.hint);
    } finally {
      setCoachBusy(false);
    }
  }

  function onHearHints() {
    void enqueueSpeech(coachIntroForLesson(lesson));
  }

  function onSubmitExplain(e: FormEvent) {
    e.preventDefault();
    if (explain.trim().length < 12) return;
    onPass();
  }

  return (
    <div className="stack lesson-player">
      <p>
        <strong>{lesson.prompt}</strong>
      </p>
      <p className="muted">
        <strong>Pass when you can explain:</strong> {lesson.passCriteria}
      </p>

      <div className="tip-row">
        {tips.map((tip) => (
          <span className="tag tip-chip" key={tip}>
            {tip}
          </span>
        ))}
      </div>

      <div className="hero-actions">
        <button className="btn" type="button" onClick={onHearHints}>
          Hear coach
        </button>
        {!sharing ? (
          <button className="btn" type="button" onClick={startShare}>
            Share my screen
          </button>
        ) : (
          <>
            <button className="btn" type="button" onClick={() => void askCoach()} disabled={coachBusy}>
              {coachBusy ? "Checking…" : "Get hint from screen"}
            </button>
            <button className="btn" type="button" onClick={stopShare}>
              Stop share
            </button>
          </>
        )}
      </div>

      {sharing ? (
        <div className="capture-preview coach-preview">
          <video ref={videoRef} muted playsInline className="on" />
        </div>
      ) : null}

      {shareError ? <p className="error">{shareError}</p> : null}

      {coach ? (
        <div className={`coach-hint status-${coach.status}`}>
          <span className="tag">{coach.status.replace("_", " ")}</span>
          <p>{coach.hint}</p>
        </div>
      ) : null}

      <form className="stack" onSubmit={onSubmitExplain}>
        <div className="field">
          <label htmlFor={`explain-${lesson.id}`}>Explain the rule in your own words</label>
          <textarea
            id={`explain-${lesson.id}`}
            rows={3}
            value={explain}
            onChange={(e) => setExplain(e.target.value)}
            required
            minLength={12}
            placeholder="When it applies, and what you do…"
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={explain.trim().length < 12}>
          Pass lesson
        </button>
      </form>
    </div>
  );
}
