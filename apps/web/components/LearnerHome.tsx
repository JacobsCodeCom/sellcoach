"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Lesson, Membership, User, WorkRole } from "@mira/core";
import { HoldToTalk } from "@/components/HoldToTalk";
import { PixelAgent } from "@/components/OnboardingChat";
import { VoiceEar } from "@/components/VoiceEar";
import { getRoadmapForMembership, markLessonProgress, type Store } from "@/lib/repo";
import { cancelSpeech, enqueueSpeech, onAgentSpeaking } from "@/lib/speak";
import { useStore } from "@/lib/store";
import type { TutorMessage, TutorReply, TutorRequest } from "@/lib/tutor";
import { localTutorReply } from "@/lib/tutor";

type Props = {
  store: Store;
  user: User;
  membership: Membership;
  workRole: WorkRole | null;
};

function teacherFor(store: Store, lesson: Lesson): string | undefined {
  const member = store.memberships.find((m) => m.id === lesson.sourceMemberId);
  const person = store.users.find((u) => u.id === member?.userId);
  const role = store.workRoles.find((r) => r.id === lesson.sourceWorkRoleId);
  if (!person) return undefined;
  return role ? `${person.name} (${role.competence} ${role.title})` : person.name;
}

export function LearnerHome({ store, user, membership, workRole }: Props) {
  const { setStore } = useStore();
  const [sessionLessonId, setSessionLessonId] = useState<string | null>(null);
  const [justPassed, setJustPassed] = useState<string | null>(null);

  const roadmap = getRoadmapForMembership(store, membership.id);
  const items = roadmap?.items ?? [];
  const lessonsById = useMemo(() => new Map(store.lessons.map((l) => [l.id, l])), [store.lessons]);
  const done = items.filter((i) => i.status === "done").length;
  const next = items.find((i) => i.status === "in_progress" || i.status === "available");
  const nextLesson = next ? lessonsById.get(next.lessonId) : undefined;
  const sessionLesson = sessionLessonId ? lessonsById.get(sessionLessonId) : undefined;
  const firstName = user.name.split(/\s+/)[0] || user.name;

  function start(lessonId: string) {
    const item = items.find((i) => i.lessonId === lessonId);
    if (item?.status === "available") {
      setStore(markLessonProgress(membership.id, lessonId, "in_progress"));
    }
    setJustPassed(null);
    setSessionLessonId(lessonId);
  }

  function onPassed(lessonId: string) {
    setStore(markLessonProgress(membership.id, lessonId, "done"));
    setJustPassed(lessonId);
    setSessionLessonId(null);
  }

  if (sessionLesson) {
    return (
      <TutorSession
        key={sessionLesson.id}
        lesson={sessionLesson}
        learnerName={user.name}
        expertName={teacherFor(store, sessionLesson)}
        onPassed={() => onPassed(sessionLesson.id)}
        onExit={() => setSessionLessonId(null)}
      />
    );
  }

  return (
    <div className="learn">
      <header className="learn-head">
        <h1>Hi {firstName}</h1>
        <p className="learn-sub">
          {workRole ? `Learning ${workRole.title}` : "Welcome aboard"}
          {items.length ? ` · ${done} of ${items.length} lessons done` : ""}
        </p>
        {items.length ? (
          <div className="learn-progress" aria-hidden>
            <span style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
        ) : null}
      </header>

      {justPassed ? (
        <p className="learn-cheer">
          Nice work. “{lessonsById.get(justPassed)?.title}” is done.
        </p>
      ) : null}

      {nextLesson ? (
        <section className="learn-next">
          <span className="learn-kicker">{done ? "Next lesson" : "Your first lesson"}</span>
          <h2>{nextLesson.title}</h2>
          <p>{nextLesson.summary}</p>
          {teacherFor(store, nextLesson) ? (
            <p className="learn-from">From {teacherFor(store, nextLesson)}</p>
          ) : null}
          <button
            className="btn btn-primary btn-lg learn-start"
            type="button"
            onClick={() => start(nextLesson.id)}
          >
            Start with Mira
          </button>
        </section>
      ) : items.length ? (
        <section className="learn-next learn-next--done">
          <span className="learn-kicker">All caught up</span>
          <h2>You’ve finished every lesson for now.</h2>
          <p>New ones show up here as your colleagues record how they work.</p>
        </section>
      ) : (
        <section className="learn-next learn-next--done">
          <span className="learn-kicker">Coming soon</span>
          <h2>Your lessons are on the way.</h2>
          <p>
            {workRole
              ? "Experienced colleagues in your role are recording how they work. Lessons will appear here."
              : "Your manager is still setting up your role."}
          </p>
        </section>
      )}

      {items.length > 1 ? (
        <ol className="learn-path">
          {items.map((item) => {
            const lesson = lessonsById.get(item.lessonId);
            return (
              <li key={item.lessonId} data-status={item.status}>
                <span className="learn-dot" />
                <span>{lesson?.title ?? "Lesson"}</span>
                {item.status === "done" ? (
                  <button type="button" className="learn-redo" onClick={() => start(item.lessonId)}>
                    Review
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
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
    await enqueueSpeech(reply.message);
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
        paused={speaking || busy}
        armed={armed && !speaking && !busy}
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
            <HoldToTalk armed={armed} disabled={speaking || busy} onArmedChange={setArmed} />
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
