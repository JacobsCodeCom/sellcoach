"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { WorkMapLesson } from "@/components/learn/WorkMapLesson";
import {
  assigneesForCapture,
  canCaptureAs,
  deletePublishedCapture,
  getRoadmapForMembership,
  isOnboardingComplete,
  reopenCaptureForEdit,
  tasksForMembership,
  updateCaptureTaskStatus,
} from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

export default function WorkspacePage() {
  const router = useRouter();
  const { setStore } = useStore();
  const { ready, user, company, membership, store } = useSession();
  const [reviewCaptureId, setReviewCaptureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!company) {
      router.replace("/onboarding");
      return;
    }
    if (!isOnboardingComplete(company) && membership?.platformRole === "owner") {
      router.replace("/onboarding");
      return;
    }
    if (membership?.newHire) {
      router.replace("/learn");
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
  const planCount = roadmap?.items.length ?? 0;

  const myMaps = useMemo(
    () =>
      store.captures
        .filter((c) => c.memberId === membership?.id && (c.workMap || c.publishedAt))
        .sort((a, b) => b.startedAt - a.startedAt),
    [store.captures, membership?.id],
  );

  const draftMaps = myMaps.filter((c) => !c.publishedAt);
  const publishedMaps = myMaps.filter((c) => c.publishedAt);

  const myTasks = useMemo(
    () => (membership ? tasksForMembership(store, membership.id) : []),
    [store, membership],
  );
  const openTasks = myTasks.filter((t) => t.status === "todo" || t.status === "in_progress");

  const reviewCapture = reviewCaptureId
    ? publishedMaps.find((c) => c.id === reviewCaptureId) ?? null
    : null;

  if (!ready || !user || !company || !membership || membership.newHire) {
    return (
      <main>
        <AppNav />
        <section className="shell">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }

  const canCapture = canCaptureAs(membership, workRole);

  if (reviewCapture?.workMap) {
    return (
      <main>
        <AppNav />
        <section className="shell">
          <WorkMapLesson
            map={reviewCapture.workMap}
            moments={reviewCapture.moments ?? []}
            expertName={user.name}
            learnerName={user.name}
            preview
            onFinished={() => setReviewCaptureId(null)}
            onExit={() => setReviewCaptureId(null)}
          />
        </section>
      </main>
    );
  }

  function onEdit(captureId: string) {
    setError(null);
    try {
      setStore(reopenCaptureForEdit(captureId));
      router.push(`/capture?id=${captureId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open for edit");
    }
  }

  function onDelete(captureId: string, title: string) {
    setError(null);
    if (
      !window.confirm(
        `Delete “${title}”? It will leave everyone’s roadmap and any agent abilities that used it.`,
      )
    ) {
      return;
    }
    try {
      setStore(deletePublishedCapture(captureId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <main>
      <AppNav />
      <section className="shell workspace-page">
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
              competence on Team.
            </p>
          </div>
        ) : (
          <div className="workspace-stack">
            {planCount ? (
              <p className="workspace-learn-link">
                <Link href="/learn">Your learning plan</Link>
                <span className="muted">
                  {" "}
                  · {planCount} lesson{planCount === 1 ? "" : "s"}
                </span>
              </p>
            ) : null}

            {canCapture ? (
              <div className="panel stack workspace-record">
                <h3>Record a Work Map</h3>
                <p className="muted panel-intro">
                  Share your screen in the browser, walk through the work, then debrief and publish
                  so teammates can learn from it.
                </p>
                <div className="hero-actions">
                  <Link className="btn btn-primary" href="/capture">
                    Start recording
                  </Link>
                  <Link className="btn" href="/learn">
                    Open Learn
                  </Link>
                </div>
              </div>
            ) : (
              <p className="muted">
                Recording unlocks at mid/expert competence or seniority 3+. Your role:{" "}
                {workRole.competence}, L{workRole.seniority}. Open{" "}
                <Link href="/learn">Learn</Link> for your plan.
              </p>
            )}

            {canCapture && openTasks.length ? (
              <div className="panel stack">
                <h3>Your tasks</h3>
                <p className="muted panel-intro">
                  Record these in the browser — teammates learn from how you actually work.
                </p>
                <ul className="list">
                  {openTasks.map((task) => (
                    <li key={task.id}>
                      <span>
                        <strong>{task.title}</strong>
                        <br />
                        <span className="muted">{task.brief}</span>
                      </span>
                      <div className="workspace-published-actions">
                        <Link className="btn btn-sm btn-primary" href={`/capture?taskId=${task.id}`}>
                          Record
                        </Link>
                        <button
                          className="btn btn-sm"
                          type="button"
                          onClick={() => setStore(updateCaptureTaskStatus(task.id, "dismissed"))}
                        >
                          Dismiss
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {canCapture && draftMaps.length ? (
              <div className="panel stack">
                <h3>Unfinished</h3>
                <p className="muted panel-intro">Finish debrief and publish from web capture.</p>
                <ul className="list">
                  {draftMaps.map((c) => (
                    <li key={c.id}>
                      <span>
                        <strong>{c.workMap?.title ?? "Untitled session"}</strong>
                        <br />
                        <span className="muted">
                          {c.workMap?.confirmed ? "Ready to publish" : "Debrief pending"}
                        </span>
                      </span>
                      <Link className="btn btn-sm" href={`/capture?id=${c.id}`}>
                        Continue
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {canCapture && publishedMaps.length ? (
              <div className="panel stack">
                <h3>Published</h3>
                <ul className="list">
                  {publishedMaps.map((c) => {
                    const title = c.workMap?.title ?? "Untitled session";
                    const assignees = assigneesForCapture(store, c.id);
                    const assigneeLabel = assignees.length
                      ? `Assigned to ${assignees.map((a) => a.name.split(/\s+/)[0] || a.name).join(", ")}`
                      : "Not on anyone’s plan yet";

                    return (
                      <li key={c.id} className="workspace-published-row">
                        <span>
                          <strong>{title}</strong>
                          <br />
                          <span className="muted">
                            {new Date(c.startedAt).toLocaleDateString()}
                            {" · "}
                            {assigneeLabel}
                          </span>
                        </span>
                        <div className="workspace-published-actions">
                          <button
                            className="btn-text"
                            type="button"
                            disabled={!c.workMap}
                            onClick={() => setReviewCaptureId(c.id)}
                          >
                            Review
                          </button>
                          <button
                            className="btn-text"
                            type="button"
                            onClick={() => onEdit(c.id)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-text workspace-delete"
                            type="button"
                            onClick={() => onDelete(c.id, title)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
