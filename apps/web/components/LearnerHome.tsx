"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildLearnerPlan,
  formatRemainingMinutes,
  type Lesson,
  type Membership,
  type User,
  type WorkRole,
} from "@mira/core";
import { HoldToTalk } from "@/components/HoldToTalk";
import { PixelAgent } from "@/components/OnboardingChat";
import { VoiceEar } from "@/components/VoiceEar";
import { WorkMapLesson } from "@/components/learn/WorkMapLesson";
import {
  canManageCapture,
  captureForLesson,
  deletePublishedCapture,
  endLearningSession,
  expertNameForCapture,
  getLessonCheckpoint,
  getRoadmapForMembership,
  markLessonProgress,
  saveLessonCheckpoint,
  startLearningSession,
  type Store,
} from "@/lib/repo";
import { cancelSpeech, enqueueSpeech, onAgentSpeaking } from "@/lib/speak";
import { useStore } from "@/lib/store";
import type { TutorMessage, TutorReply, TutorRequest } from "@/lib/tutor";
import { localTutorReply } from "@/lib/tutor";

type Props = {
  store: Store;
  user: User;
  membership: Membership;
  workRole: WorkRole | null;
  /** Narrow side-panel layout inside the Chrome extension. */
  embedded?: boolean;
};

function teacherFor(store: Store, lesson: Lesson): string | undefined {
  const member = store.memberships.find((m) => m.id === lesson.sourceMemberId);
  const person = store.users.find((u) => u.id === member?.userId);
  const role = store.workRoles.find((r) => r.id === lesson.sourceWorkRoleId);
  if (!person) return undefined;
  return role ? `${person.name} (${role.competence} ${role.title})` : person.name;
}

export function LearnerHome({ store, user, membership, workRole, embedded = false }: Props) {
  const { setStore } = useStore();
  const [sessionLessonId, setSessionLessonId] = useState<string | null>(null);
  const [justPassed, setJustPassed] = useState<string | null>(null);

  const roadmap = getRoadmapForMembership(store, membership.id);
  const plan = useMemo(
    () =>
      buildLearnerPlan({
        roadmap,
        lessons: store.lessons,
        learnerRole: workRole,
        memberships: store.memberships,
        users: store.users,
        workRoles: store.workRoles,
      }),
    [roadmap, store.lessons, store.memberships, store.users, store.workRoles, workRole],
  );

  const lessonsById = useMemo(() => new Map(store.lessons.map((l) => [l.id, l])), [store.lessons]);
  const sessionLesson = sessionLessonId ? lessonsById.get(sessionLessonId) : undefined;
  const firstName = user.name.split(/\s+/)[0] || user.name;
  const next = plan.next;

  function start(lessonId: string) {
    const item = plan.rows.find((r) => r.lessonId === lessonId);
    if (item?.status === "available" || item?.status === "locked") {
      markLessonProgress(membership.id, lessonId, "in_progress");
    }
    setStore(startLearningSession(membership.id, lessonId));
    setJustPassed(null);
    setSessionLessonId(lessonId);
  }

  function onPassed(lessonId: string) {
    markLessonProgress(membership.id, lessonId, "done");
    setStore(endLearningSession(membership.id, lessonId, "completed"));
    setJustPassed(lessonId);
    setSessionLessonId(null);
  }

  function onExitSession(lessonId: string) {
    setStore(endLearningSession(membership.id, lessonId, "exited"));
    setSessionLessonId(null);
  }

  function onRemoveLesson(lessonId: string, title: string) {
    const lesson = lessonsById.get(lessonId);
    const capture = lesson ? captureForLesson(store, lesson) : null;
    if (!lesson?.sourceCaptureId || !canManageCapture(membership, capture)) return;
    if (
      !window.confirm(
        `Remove “${title}”? It leaves everyone’s roadmap and any agent abilities that used it.`,
      )
    ) {
      return;
    }
    try {
      setStore(deletePublishedCapture(lesson.sourceCaptureId));
      if (sessionLessonId === lessonId) setSessionLessonId(null);
    } catch {
      // Manage check already gates remove; ignore rare store races.
    }
  }

  if (sessionLesson) {
    return (
      <LessonSession
        key={sessionLesson.id}
        store={store}
        lesson={sessionLesson}
        learnerName={user.name}
        membershipId={membership.id}
        embedded={embedded}
        onPassed={() => onPassed(sessionLesson.id)}
        onExit={() => onExitSession(sessionLesson.id)}
      />
    );
  }

  return (
    <div className={`learn${embedded ? " learn--embedded" : ""}`}>
      <header className="learn-head">
        <h1>Hi {firstName}</h1>
        <p className="learn-sub">
          {workRole ? `Your ${workRole.title} plan` : "Your plan"}
        </p>
        {plan.totalCount ? (
          <p className="learn-score" aria-label="Overall progress">
            <span className="learn-score-value">{plan.doneCount}</span> done
            <span className="learn-score-sep" aria-hidden>
              ·
            </span>
            <span className="learn-score-value">{plan.totalCount - plan.doneCount}</span> left
            {plan.remainingMinutes > 0 ? (
              <>
                <span className="learn-score-sep" aria-hidden>
                  ·
                </span>
                <span className="learn-score-eta">{formatRemainingMinutes(plan.remainingMinutes)}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      {justPassed ? (
        <p className="learn-cheer">
          Nice work. “{lessonsById.get(justPassed)?.title}” is done.
        </p>
      ) : null}

      {!plan.totalCount ? (
        <section className="learn-next learn-next--done">
          <span className="learn-kicker">Waiting on experts</span>
          <h2>No lessons on your plan yet.</h2>
          <p>
            {workRole
              ? `When someone more senior in ${workRole.title} publishes how they work, those lessons land here.`
              : "Your manager still needs to assign your work role. Once they do, matched lessons will appear here."}
          </p>
        </section>
      ) : (
        <section className="learn-path-block" aria-label="Your roadmap">
          <div className="learn-path-head">
            <h3 className="learn-path-title">Your roadmap</h3>
            <div className="learn-path-meter" aria-hidden>
              <span style={{ width: `${(plan.doneCount / plan.totalCount) * 100}%` }} />
            </div>
          </div>

          <ol className="learn-trail">
            {plan.rows.map((row, index) => {
              const capture = captureForLesson(store, row.lesson);
              const canManage = canManageCapture(membership, capture);
              const isHere = row.lessonId === next?.lessonId;
              const actionLabel =
                row.status === "done"
                  ? "Review"
                  : row.status === "in_progress"
                    ? "Continue"
                    : "Start";
              const nodeState =
                row.status === "done"
                  ? "done"
                  : isHere
                    ? "here"
                    : row.status === "in_progress" || row.status === "available"
                      ? "ready"
                      : "upcoming";

              return (
                <li
                  key={row.lessonId}
                  className="learn-trail-item"
                  data-state={nodeState}
                  aria-current={isHere ? "step" : undefined}
                >
                  {index < plan.rows.length - 1 ? (
                    <span
                      className="learn-trail-link"
                      data-filled={row.status === "done" ? "true" : "false"}
                      aria-hidden
                    />
                  ) : null}
                  <button
                    type="button"
                    className="learn-trail-node"
                    onClick={() => start(row.lessonId)}
                    aria-label={`${actionLabel}: ${row.title}`}
                  >
                    {row.status === "done" ? (
                      <svg viewBox="0 0 20 20" width="18" height="18" focusable="false">
                        <path
                          d="M4.5 10.2 8.2 13.5 15.5 5.8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span>{row.order + 1}</span>
                    )}
                  </button>
                  <div className="learn-trail-card">
                    {isHere ? <span className="learn-here">You are here</span> : null}
                    <button
                      type="button"
                      className="learn-path-name"
                      onClick={() => start(row.lessonId)}
                    >
                      {row.title}
                    </button>
                    {(() => {
                      const checkpoint = getLessonCheckpoint(store, membership.id, row.lessonId);
                      const stepTotal = capture?.workMap?.steps.length ?? 0;
                      if (row.status !== "in_progress" || !checkpoint || stepTotal < 1) return null;
                      return (
                        <p className="learn-path-progress">
                          Step {Math.min(checkpoint.stepIndex + 1, stepTotal)} of {stepTotal}
                          {capture?.workMap?.steps[checkpoint.stepIndex]?.title
                            ? ` · ${capture.workMap.steps[checkpoint.stepIndex].title}`
                            : ""}
                        </p>
                      );
                    })()}
                    <div className="learn-path-actions">
                      <button
                        type="button"
                        className={`learn-redo${isHere ? " learn-redo--primary" : ""}`}
                        onClick={() => start(row.lessonId)}
                      >
                        {actionLabel}
                      </button>
                      {canManage ? (
                        <button
                          type="button"
                          className="learn-remove"
                          onClick={() => onRemoveLesson(row.lessonId, row.title)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

/** Work Map lessons get the walkthrough + practice flow; legacy per-rule lessons get the voice tutor. */
export function LessonSession({
  store,
  lesson,
  learnerName,
  membershipId,
  embedded = false,
  onPassed,
  onExit,
}: {
  store: Store;
  lesson: Lesson;
  learnerName: string;
  membershipId: string;
  embedded?: boolean;
  onPassed: () => void;
  onExit: () => void;
}) {
  const { setStore } = useStore();
  const capture = lesson.kind === "workmap" ? captureForLesson(store, lesson) : null;
  const checkpoint = getLessonCheckpoint(store, membershipId, lesson.id);
  if (capture?.workMap) {
    return (
      <WorkMapLesson
        map={capture.workMap}
        moments={capture.moments ?? []}
        expertName={expertNameForCapture(store, capture)}
        learnerName={learnerName}
        embedded={embedded}
        resumeStepIndex={checkpoint?.stepIndex ?? 0}
        resumeGuided={checkpoint?.guidedThisStep ?? false}
        onCheckpoint={(snap) => {
          setStore(
            saveLessonCheckpoint(membershipId, lesson.id, {
              stepIndex: snap.stepIndex,
              guidedThisStep: snap.guidedThisStep,
            }),
          );
        }}
        onFinished={onPassed}
        onExit={onExit}
      />
    );
  }
  return (
    <TutorSession
      lesson={lesson}
      learnerName={learnerName}
      expertName={teacherFor(store, lesson)}
      onPassed={onPassed}
      onExit={onExit}
    />
  );
}

async function askTutor(input: TutorRequest): Promise<TutorReply> {
  try {
    const res = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return localTutorReply(input);
    return (await res.json()) as TutorReply;
  } catch {
    return localTutorReply(input);
  }
}

function TutorSession({
  lesson,
  learnerName,
  expertName,
  onPassed,
  onExit,
}: {
  lesson: Lesson;
  learnerName: string;
  expertName?: string;
  onPassed: () => void;
  onExit: () => void;
}) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [armed, setArmed] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [interim, setInterim] = useState("");
  const [input, setInput] = useState("");
  const [passed, setPassed] = useState(false);
  const messagesRef = useRef<TutorMessage[]>([]);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const openedRef = useRef(false);

  useEffect(() => onAgentSpeaking(setSpeaking), []);
  useEffect(() => () => cancelSpeech(), []);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void turn([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open the lesson once
  }, []);
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, interim]);

  async function turn(history: TutorMessage[]) {
    setBusy(true);
    const reply = await askTutor({
      learnerName,
      expertName,
      lesson: {
        title: lesson.title,
        summary: lesson.summary,
        prompt: lesson.prompt,
        passCriteria: lesson.passCriteria,
      },
      messages: history,
    });
    const next: TutorMessage[] = [...history, { role: "assistant", content: reply.message }];
    messagesRef.current = next;
    setMessages(next);
    setBusy(false);
    if (reply.passed) setPassed(true);
    // Don't block the next turn on full TTS playback.
    void enqueueSpeech(reply.message);
  }

  function say(text: string) {
    const cleaned = text.trim();
    if (!cleaned || busy || passed) return;
    cancelSpeech();
    const history: TutorMessage[] = [...messagesRef.current, { role: "user", content: cleaned }];
    messagesRef.current = history;
    setMessages(history);
    void turn(history);
  }

  function onType(e: FormEvent) {
    e.preventDefault();
    say(input);
    setInput("");
  }

  const state = speaking ? "speaking" : busy ? "thinking" : armed ? "listening" : "waiting";
  const status = passed
    ? "Lesson complete"
    : speaking
      ? "Mira is talking"
      : busy
        ? "Thinking"
        : armed
          ? "Listening"
          : "Your turn";

  return (
    <div className="learn learn-session">
      <VoiceEar
        active
        paused={busy}
        armed={armed && !busy}
        onPartial={setInterim}
        onFinal={(text) => {
          setArmed(false);
          setInterim("");
          say(text);
        }}
        onListeningChange={(v) => v && setMicReady(true)}
        onError={() => setMicReady(false)}
      />

      <div className="learn-session-top">
        <button type="button" className="learn-back" onClick={onExit}>
          ← Back
        </button>
        <span className="learn-kicker">{lesson.title}</span>
      </div>

      <div className="learn-agent">
        <PixelAgent state={passed ? "speaking" : state} />
        <p className="learn-status">{status}</p>
      </div>

      <div className="learn-thread" ref={threadRef} aria-live="polite">
        {messages.map((m, i) => (
          <p key={i} className={`learn-line learn-line--${m.role}`}>
            {m.content}
          </p>
        ))}
        {interim ? <p className="learn-line learn-line--user learn-line--live">{interim}</p> : null}
      </div>

      {passed ? (
        <button className="btn btn-primary btn-lg learn-start" type="button" onClick={onPassed}>
          Finish lesson
        </button>
      ) : (
        <>
          {micReady ? (
            <HoldToTalk
              armed={armed}
              disabled={busy}
              onArmedChange={(next) => {
                if (next) cancelSpeech();
                setArmed(next);
              }}
            />
          ) : (
            <p className="learn-hint">Allow the microphone to talk with Mira, or type below.</p>
          )}
          <form className="learn-type" onSubmit={onType}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Or type your answer or a question…"
              aria-label="Answer"
            />
            <button className="btn" type="submit" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
