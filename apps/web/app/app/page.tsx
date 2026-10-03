"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { CaptureRecorder } from "@/components/CaptureRecorder";
import { LearnerHome } from "@/components/LearnerHome";
import { LessonPlayer } from "@/components/LessonPlayer";
import { LiveCaptureController, type LiveCaptureResult } from "@/lib/liveCapture";
import {
  addTeachBackToCapture,
  appendCaptureEvents,
  canCaptureAs,
  discardCapture,
  finalizeCapture,
  getRoadmapForMembership,
  ingestTranscriptAsTeachBacks,
  isOnboardingComplete,
  markLessonProgress,
  removeTeachBackFromCapture,
  startCapture,
  updateTeachBackInCapture,
} from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

type CapturePhase = "idle" | "live" | "review";

export default function WorkspacePage() {
  const router = useRouter();
  const { setStore } = useStore();
  const { ready, user, company, membership, store } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [activeCaptureId, setActiveCaptureId] = useState<string | null>(null);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [teachAnswer, setTeachAnswer] = useState("");
  const [recordingNote, setRecordingNote] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [recorder, setRecorder] = useState<LiveCaptureController | null>(null);
  const recorderRef = useRef<LiveCaptureController | null>(null);
  recorderRef.current = recorder;

  useEffect(() => () => void recorderRef.current?.stop(), []);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (!company) router.replace("/onboarding");
    else if (!isOnboardingComplete(company) && membership?.platformRole === "owner") {
      router.replace("/onboarding");
    }
  }, [ready, user, company, membership, router]);

  const workRole = useMemo(
    () => store.workRoles.find((r) => r.id === membership?.workRoleId) ?? null,
    [store.workRoles, membership?.workRoleId],
  );

  const roadmap = useMemo(
    () => (membership ? getRoadmapForMembership(store, membership.id) : null),
    [store, membership],
  );

  const lessonsById = useMemo(() => {
    const map = new Map(store.lessons.map((l) => [l.id, l]));
    return map;
  }, [store.lessons]);

  const openCapture = useMemo(() => {
    if (activeCaptureId) {
      return store.captures.find((c) => c.id === activeCaptureId) ?? null;
    }
    return null;
  }, [store.captures, activeCaptureId]);

  const canCapture = canCaptureAs(membership, workRole);

  function beginCapture() {
    setError(null);
    setRecordingNote(null);
    let captureId: string;
    try {
      let next = startCapture();
      const latest = next.captures.filter((c) => c.memberId === membership?.id).at(-1);
      if (!latest) throw new Error("Capture session missing");
      captureId = latest.id;
      next = appendCaptureEvents(captureId, [
        {
          kind: "session",
          label: "Record session started",
          detail: "Requesting screen + microphone",
        },
      ]);
      setStore(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start capture");
      return;
    }

    // Started inside the click handler so the browser shows exactly one share picker.
    const controller = new LiveCaptureController();
    controller.start().catch((err) => {
      setError(err instanceof Error ? err.message : "Could not start screen/mic capture");
      try {
        setStore(discardCapture(captureId));
      } catch {
        /* ignore */
      }
      setRecorder(null);
      setActiveCaptureId(null);
      setPhase("idle");
    });
    setRecorder(controller);
    setActiveCaptureId(captureId);
    setPhase("live");
  }

  const onLiveLines = useCallback(
    (lines: string[]) => {
      if (!openCapture) return;
      const known = new Set(
        openCapture.events.filter((e) => e.kind === "speech").map((e) => e.label),
      );
      const fresh = lines.filter((line) => !known.has(line));
      if (!fresh.length) return;
      setStore(
        appendCaptureEvents(
          openCapture.id,
          fresh.map((line) => ({ kind: "speech", label: line })),
        ),
      );
    },
    [openCapture, setStore],
  );

  function onRecordingStopped(payload: LiveCaptureResult) {
    setRecorder(null);
    if (!openCapture) return;
    setError(null);
    try {
      let next = ingestTranscriptAsTeachBacks(openCapture.id, payload.lines);
      next = appendCaptureEvents(openCapture.id, [
        {
          kind: "recording",
          label: "Session ended",
          detail: payload.blob
            ? `Local preview ${Math.round(payload.blob.size / 1024)} KB (not uploaded)`
            : "No media blob retained",
        },
      ]);
      setStore(next);
      const count = next.captures.find((c) => c.id === openCapture.id)?.teachBacks.length ?? 0;
      setRecordingNote(
        count
          ? `${count} rule card(s) from your voice. Edit if needed, then publish.`
          : "No clear spoken rules. Add one manually below, then publish.",
      );
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save recording");
    }
  }

  function onTeachBack(e: FormEvent) {
    e.preventDefault();
    if (!openCapture) return;
    setError(null);
    try {
      setStore(
        addTeachBackToCapture(openCapture.id, {
          prompt: "What rule should a new hire learn from this?",
          answer: teachAnswer,
          confirmed: true,
        }),
      );
      setTeachAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save rule");
    }
  }

  function onPublish() {
    if (!openCapture) return;
    setError(null);
    try {
      setStore(finalizeCapture(openCapture.id));
      setActiveCaptureId(null);
      setRecordingNote(null);
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish lesson");
    }
  }

  function onDiscard() {
    if (!openCapture) return;
    setError(null);
    try {
      setStore(discardCapture(openCapture.id));
      setActiveCaptureId(null);
      setRecordingNote(null);
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not discard session");
    }
  }

  if (!ready || !user || !company || !membership) {
    return (
      <main className="shell">
        <AppNav />
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (membership.newHire) {
    return (
      <main>
        <AppNav />
        <section className="shell">
          <LearnerHome store={store} user={user} membership={membership} workRole={workRole} />
        </section>
      </main>
    );
  }

  return (
    <main>
      <AppNav />
      <section className="shell" style={{ paddingBottom: "4rem" }}>
        <div className="page-head">
          <div>
            <p className="tag">
              {company.name}
              {workRole ? ` · ${workRole.title}` : ""}
            </p>
            <h1>Workspace</h1>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}

        {!workRole ? (
          <div className="panel">
            <p className="muted">
              No work role assigned yet. Ask your company owner to set your title, seniority, and
              competence in Admin.
            </p>
          </div>
        ) : (
          <div className="grid-2">
            <div className="panel stack">
              <h3>Your roadmap</h3>
              <p className="muted panel-intro">
                Lessons from more senior / higher-competence people with the same title.
              </p>
              {!roadmap?.items.length ? (
                <p className="muted">No lessons attached yet. Capture from experts will fill this.</p>
              ) : (
                roadmap.items.map((item) => {
                  const lesson = lessonsById.get(item.lessonId);
                  const playing =
                    activeLessonId === item.lessonId &&
                    (item.status === "available" || item.status === "in_progress");
                  return (
                    <div className="lesson-card" data-status={item.status} key={item.lessonId}>
                      <strong>
                        {item.order + 1}. {lesson?.title ?? "Lesson"}
                      </strong>
                      <span className="muted">{lesson?.summary}</span>
                      <span className="tag">{item.status}</span>
                      {item.status === "available" || item.status === "in_progress" ? (
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          {!playing ? (
                            <button
                              className="btn btn-primary"
                              type="button"
                              onClick={() => {
                                if (item.status === "available") {
                                  setStore(
                                    markLessonProgress(membership.id, item.lessonId, "in_progress"),
                                  );
                                }
                                setActiveLessonId(item.lessonId);
                              }}
                            >
                              {item.status === "available" ? "Start lesson" : "Continue"}
                            </button>
                          ) : (
                            <button
                              className="btn"
                              type="button"
                              onClick={() => setActiveLessonId(null)}
                            >
                              Collapse
                            </button>
                          )}
                        </div>
                      ) : null}
                      {playing && lesson ? (
                        <LessonPlayer
                          lesson={lesson}
                          onPass={() => {
                            setStore(markLessonProgress(membership.id, item.lessonId, "done"));
                            setActiveLessonId(null);
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            <div className="panel stack">
              <h3>Expert capture</h3>
              <p className="muted panel-intro">
                Record screen + voice while you work. Review the rules, then publish a lesson.
              </p>
              {!canCapture ? (
                <p className="muted">
                  Capture unlocks at mid/expert competence or seniority 3+. Your role:{" "}
                  {workRole.competence}, L{workRole.seniority}.
                </p>
              ) : phase === "idle" || !openCapture ? (
                <button className="btn btn-primary" type="button" onClick={beginCapture}>
                  Record session
                </button>
              ) : phase === "live" && recorder ? (
                <CaptureRecorder
                  controller={recorder}
                  onLiveLines={onLiveLines}
                  onStopped={onRecordingStopped}
                />
              ) : (
                <div className="review">
                  <div className="review-head">
                    <h4>Review rules</h4>
                    <span>
                      {openCapture.teachBacks.length}{" "}
                      {openCapture.teachBacks.length === 1 ? "rule" : "rules"}
                    </span>
                  </div>
                  <p className="review-note">
                    {recordingNote ?? "Click a rule to edit it."}
                  </p>

                  {openCapture.teachBacks.length ? (
                    <ul className="review-rules">
                      {openCapture.teachBacks.map((tb) => (
                        <li className="rule-card" key={tb.id}>
                          <input
                            value={tb.ruleLabel || ""}
                            placeholder="Rule title"
                            onChange={(e) =>
                              setStore(
                                updateTeachBackInCapture(openCapture.id, tb.id, {
                                  ruleLabel: e.target.value,
                                }),
                              )
                            }
                            aria-label="Rule title"
                          />
                          <textarea
                            rows={2}
                            value={tb.answer}
                            onChange={(e) =>
                              setStore(
                                updateTeachBackInCapture(openCapture.id, tb.id, {
                                  answer: e.target.value,
                                }),
                              )
                            }
                            aria-label="Rule text"
                          />
                          <button
                            className="rule-remove"
                            type="button"
                            title="Remove rule"
                            aria-label="Remove rule"
                            onClick={() =>
                              setStore(removeTeachBackFromCapture(openCapture.id, tb.id))
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rule-empty">No rules picked up from your voice. Add one below.</p>
                  )}

                  <form className="rule-add" onSubmit={onTeachBack}>
                    <textarea
                      rows={1}
                      value={teachAnswer}
                      onChange={(e) => setTeachAnswer(e.target.value)}
                      aria-label="Add a rule manually"
                      placeholder="Add a rule, e.g. Escalate if they mention cancelling twice."
                    />
                    <button className="btn btn-sm" type="submit" disabled={!teachAnswer.trim()}>
                      Add
                    </button>
                  </form>

                  <div className="review-actions">
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={onPublish}
                      disabled={!openCapture.teachBacks.length}
                    >
                      Publish lesson
                    </button>
                    <button className="btn-ghost" type="button" onClick={onDiscard}>
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
