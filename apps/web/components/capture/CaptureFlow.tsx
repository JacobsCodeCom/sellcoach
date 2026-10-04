"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { TranscriptLine, WorkMap } from "@mira/core";
import { AppNav } from "@/components/AppNav";
import { FlowSteps } from "@/components/FlowSteps";
import { DebriefStep } from "@/components/capture/DebriefStep";
import { RecordStep } from "@/components/capture/RecordStep";
import { ExtensionCaptureController } from "@/lib/extensionCapture";
import { LiveCaptureController, type CaptureController } from "@/lib/liveCapture";
import type { LiveApprenticeResult } from "@/lib/useLiveApprentice";
import {
  canCaptureAs,
  compactStore,
  discardCapture,
  discardInterruptedForMember,
  isOnboardingComplete,
  loadStore,
  publishCapture,
  saveRecording,
  setCaptureWorkMap,
  startCapture,
  userHasCompanyMembership,
} from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

const STEPS = ["Record", "Debrief"];

type CaptureFlowProps = {
  /** Base path for capture routes — `/capture` or `/ext/capture`. */
  basePath?: string;
  /** When true, skip AppNav (extension shell provides chrome). */
  embedded?: boolean;
  homeHref?: string;
};

export function CaptureFlow({
  basePath = "/capture",
  embedded = false,
  homeHref,
}: CaptureFlowProps) {
  const router = useRouter();
  const params = useSearchParams();
  const captureId = params.get("id");
  const taskId = params.get("taskId");
  const { setStore } = useStore();
  const { ready, user, company, membership, store } = useSession();
  const [recorder, setRecorder] = useState<CaptureController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recorderRef = useRef<CaptureController | null>(null);
  recorderRef.current = recorder;
  const backHome = homeHref ?? (embedded ? "/ext" : "/app");
  const goIdle = useCallback(() => {
    router.replace(basePath);
  }, [router, basePath]);

  useEffect(
    () => () => {
      void recorderRef.current?.stop();
      if (recorderRef.current instanceof ExtensionCaptureController) {
        recorderRef.current.dispose();
      }
    },
    [],
  );

  // Extension: never strand the user on "Discard and start over".
  useEffect(() => {
    if (!embedded || !ready || !membership || captureId || recorder) return;
    const interrupted = store.captures.some((c) => c.memberId === membership.id && !c.endedAt);
    if (!interrupted) return;
    setStore(discardInterruptedForMember(membership.id));
    router.replace(basePath);
  }, [embedded, ready, membership, captureId, recorder, store.captures, setStore, router, basePath]);

  // Free space once when opening the extension record surface.
  useEffect(() => {
    if (!embedded || !ready) return;
    try {
      setStore(compactStore(loadStore()));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on embed mount
  }, [embedded, ready]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(embedded ? "/login?next=/ext" : "/login");
      return;
    }
    if (!userHasCompanyMembership(store, user.id)) {
      if (!embedded) router.replace("/onboarding");
      return;
    }
    if (!company) {
      if (!embedded) router.replace("/onboarding");
      return;
    }
    if (!isOnboardingComplete(company) && membership?.platformRole === "owner" && !embedded) {
      router.replace("/onboarding");
    }
  }, [ready, user, company, membership, router, embedded, store]);

  const workRole = useMemo(
    () => store.workRoles.find((r) => r.id === membership?.workRoleId) ?? null,
    [store.workRoles, membership?.workRoleId],
  );
  const capture = useMemo(() => {
    if (!captureId || !membership) return null;
    const found = store.captures.find((c) => c.id === captureId) ?? null;
    if (!found || found.companyId !== membership.companyId) return null;
    if (found.memberId === membership.id || membership.platformRole === "owner") return found;
    return null;
  }, [store.captures, captureId, membership]);
  const mine = useMemo(
    () =>
      store.captures
        .filter((c) => c.memberId === membership?.id && (c.workMap || c.publishedAt))
        .sort((a, b) => b.startedAt - a.startedAt),
    [store.captures, membership?.id],
  );

  const run = useCallback(
    (fn: () => ReturnType<typeof publishCapture>) => {
      setError(null);
      try {
        setStore(fn());
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        return false;
      }
    },
    [setStore],
  );

  const launchTask = useMemo(
    () =>
      taskId
        ? (store.captureTasks.find(
            (t) => t.id === taskId && t.assigneeMembershipId === membership?.id,
          ) ?? null)
        : null,
    [taskId, store.captureTasks, membership?.id],
  );

  function begin() {
    setError(null);
    setNotice(null);

    let id: string;
    try {
      const next = startCapture(taskId ? { taskId } : undefined);
      const latest = next.captures.filter((c) => c.memberId === membership?.id).at(-1);
      if (!latest) throw new Error("Capture session missing");
      id = latest.id;
      setStore(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start capture");
      return;
    }

    // Extension: mic + tab screenshots via parent page (no Share picker).
    // Web: classic screen share + mic.
    const controller: CaptureController = embedded
      ? new ExtensionCaptureController()
      : new LiveCaptureController();

    void controller.start(embedded ? undefined : { preferCurrentTab: false }).catch((err) => {
      const message = err instanceof Error ? err.message : "Could not start capture";
      setError(message);
      try {
        setStore(discardCapture(id));
      } catch {
        /* ignore */
      }
      if (controller instanceof ExtensionCaptureController) controller.dispose();
      setRecorder(null);
      router.replace(taskId ? `${basePath}?taskId=${taskId}` : basePath);
    });
    setRecorder(controller);
    router.replace(`${basePath}?id=${id}`);
  }

  const onRecorded = useCallback(
    (result: LiveApprenticeResult) => {
      setRecorder(null);
      if (!captureId) return;
      const ok = run(() => saveRecording(captureId, result));
      if (!ok) return;
      if (!result.transcript.some((l) => l.who === "expert")) {
        setNotice(
          "No speech was picked up. The draft will be thin; add reasons in the debrief or edit the map.",
        );
      }
    },
    [captureId, run],
  );

  const onDraft = useCallback(
    (map: WorkMap) => {
      if (captureId) run(() => setCaptureWorkMap(captureId, { ...map, confirmed: false }));
    },
    [captureId, run],
  );

  const onConfirmed = useCallback(
    (map: WorkMap, debrief: TranscriptLine[]) => {
      if (!captureId) return;
      const ok = run(() => {
        setCaptureWorkMap(captureId, { ...map, confirmed: true }, debrief);
        return publishCapture(captureId);
      });
      if (!ok) return;
      setNotice("Published. Start another when you're ready.");
      goIdle();
    },
    [captureId, run, goIdle],
  );

  const onDiscard = useCallback(() => {
    if (!captureId) return;
    if (run(() => discardCapture(captureId))) goIdle();
  }, [captureId, run, goIdle]);

  // Confirmed maps publish automatically — never park on a manual publish screen.
  useEffect(() => {
    if (!ready || !captureId || !capture?.workMap?.confirmed || recorder) return;
    if (!capture.publishedAt) {
      const ok = run(() => publishCapture(captureId));
      if (!ok) return;
      setNotice("Published. Start another when you're ready.");
    }
    goIdle();
  }, [
    ready,
    captureId,
    capture?.workMap?.confirmed,
    capture?.publishedAt,
    recorder,
    run,
    goIdle,
  ]);

  function shell(children: ReactNode, className = "shell") {
    if (embedded) {
      return <section className={`ext-section ${className}`}>{children}</section>;
    }
    return (
      <main>
        <AppNav />
        <section className={className}>{children}</section>
      </main>
    );
  }

  if (!ready || !user) {
    return shell(<p className="muted">Loading…</p>);
  }

  if (!userHasCompanyMembership(store, user.id) || !company || !membership) {
    return shell(
      <div className="panel stack">
        <h2>Accept your company invite</h2>
        <p className="muted">
          You&apos;re signed in, but not attached to a company yet. Open the invite link your admin
          sent — recordings bind to that company, not your email domain.
        </p>
        <Link className="btn" href={backHome}>
          Back
        </Link>
      </div>,
    );
  }

  const expertName = user.name;
  const canCapture = canCaptureAs(membership, workRole);
  const live = Boolean(recorder);
  const phase = live
    ? "record"
    : !capture
      ? "idle"
      : !capture.endedAt
        ? "interrupted"
        : !capture.workMap?.confirmed
          ? "debrief"
          : "publishing";
  const stepIndex = phase === "debrief" || phase === "publishing" ? 1 : 0;

  const unfinished = mine.filter((c) => !c.publishedAt).slice(0, 5);
  const recorded = mine.filter((c) => Boolean(c.publishedAt));

  return shell(
    <>
      {!embedded ? (
        <div className="page-head">
          <div>
            <p className="tag">
              {company.name}
              {workRole ? ` · ${workRole.title}` : ""}
            </p>
            <h1>Teach the apprentice</h1>
          </div>
          <FlowSteps steps={STEPS} active={stepIndex} />
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="flow-notice">{notice}</p> : null}

      {!canCapture ? (
        <div className="panel">
          <p className="muted">
            Recording unlocks at mid/expert competence or seniority 3+.
            {workRole
              ? ` Your role: ${workRole.competence}, L${workRole.seniority}.`
              : " Ask your owner to assign a role."}
          </p>
          <Link className="btn" href={backHome}>
            Back
          </Link>
        </div>
      ) : phase === "record" && recorder ? (
        <RecordStep
          controller={recorder}
          expertName={expertName}
          onDone={onRecorded}
          embedded={embedded}
        />
      ) : phase === "debrief" && capture ? (
        <DebriefStep
          key={capture.id}
          capture={capture}
          expertName={expertName}
          onDraft={onDraft}
          onConfirmed={onConfirmed}
          onDiscard={onDiscard}
          embedded={embedded}
        />
      ) : phase === "publishing" && capture?.workMap ? (
        <div className={`panel stack${embedded ? " ext-map" : ""}`}>
          <h2>{capture.workMap.title}</h2>
          {error ? (
            <div className="hero-actions">
              <p className="error">{error}</p>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  if (run(() => publishCapture(capture.id))) {
                    setNotice("Published. Start another when you're ready.");
                    goIdle();
                  }
                }}
              >
                Try again
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  if (run(() => discardCapture(capture.id))) goIdle();
                }}
              >
                Discard
              </button>
            </div>
          ) : (
            <p className="muted">Publishing…</p>
          )}
        </div>
      ) : phase === "interrupted" && capture ? (
        embedded ? (
          <div className="ext-start">
            <button className="btn btn-primary btn-lg" type="button" onClick={begin}>
              Start
            </button>
            <p className="muted">Ready when you are.</p>
          </div>
        ) : (
          <div className="panel stack">
            <p>This recording was interrupted before it finished.</p>
            <div className="hero-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  if (run(() => discardCapture(capture.id))) router.replace(basePath);
                }}
              >
                Discard and start over
              </button>
            </div>
          </div>
        )
      ) : (
        <div className={embedded ? "ext-idle" : "flow-start"}>
          {embedded ? (
            <div className="ext-start">
              {launchTask ? <p className="ext-task-brief">{launchTask.brief}</p> : null}
              <button className="btn btn-primary btn-lg" type="button" onClick={begin}>
                {launchTask ? "Start task" : "Start"}
              </button>
              <p className="muted">Talk while you work. Stop when done — it publishes itself.</p>
              {unfinished.length ? (
                <div className="ext-drafts">
                  <p className="ext-drafts-label">
                    Finish {unfinished.length} draft{unfinished.length === 1 ? "" : "s"}
                  </p>
                  <ul>
                    {unfinished.slice(0, 2).map((c) => (
                      <li key={c.id}>
                        <span>{c.workMap?.title ?? "Untitled"}</span>
                        <Link className="btn btn-sm" href={`${basePath}?id=${c.id}`}>
                          Open
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {recorded.length ? (
                <div className="ext-drafts ext-recorded">
                  <p className="ext-drafts-label">Already recorded</p>
                  <ul>
                    {recorded.slice(0, 12).map((c) => (
                      <li key={c.id}>
                        <span title={c.workMap?.title ?? "Untitled"}>
                          {c.workMap?.title ?? "Untitled"}
                        </span>
                        <span className="ext-recorded-date">
                          {new Date(c.startedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="panel stack">
                <h2>{launchTask ? launchTask.title : "Record how you work"}</h2>
                {launchTask ? <p className="muted">{launchTask.brief}</p> : null}
                {capture?.taskBrief ? (
                  <p className="flow-notice">Focus for this session: {capture.taskBrief}</p>
                ) : null}
                <ol className="flow-howto">
                  <li>
                    <strong>Record.</strong> Share your screen and do a real task. Talk through it.
                  </li>
                  <li>
                    <strong>Debrief.</strong> Answer a few follow-ups — then it publishes on its own.
                  </li>
                </ol>
                <div className="hero-actions">
                  <button className="btn btn-primary btn-lg" type="button" onClick={begin}>
                    {launchTask ? "Start this task" : "Start"}
                  </button>
                  <Link className="btn" href={backHome}>
                    Queue
                  </Link>
                </div>
              </div>

              <div className="panel stack">
                <h3>Already recorded</h3>
                {recorded.length ? (
                  <ul className="list">
                    {recorded.map((c) => (
                      <li key={c.id}>
                        <span>
                          <strong>{c.workMap?.title ?? "Untitled session"}</strong>
                          <br />
                          <span className="muted">{new Date(c.startedAt).toLocaleDateString()}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Nothing recorded yet.</p>
                )}
                {unfinished.length ? (
                  <>
                    <h3>Finish these</h3>
                    <ul className="list">
                      {unfinished.map((c) => (
                        <li key={c.id}>
                          <span>
                            <strong>{c.workMap?.title ?? "Untitled session"}</strong>
                            <br />
                            <span className="muted">
                              {c.workMap?.confirmed ? "publish failed — retry" : "debrief pending"}
                            </span>
                          </span>
                          <Link className="btn btn-sm" href={`${basePath}?id=${c.id}`}>
                            Open
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}
    </>,
    embedded ? "ext-section flow-shell" : "shell flow-shell",
  );
}
