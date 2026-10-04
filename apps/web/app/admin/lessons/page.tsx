"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildLessonAnalytics, formatRelativeTime } from "@/lib/adminAnalytics";
import {
  deletePublishedCapture,
  isOnboardingComplete,
  reopenCaptureForEdit,
} from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

export default function AdminLessonsPage() {
  const router = useRouter();
  const { setStore } = useStore();
  const { ready, user, company, membership, store } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/");
    else if (!company) router.replace("/onboarding");
    else if (!isOnboardingComplete(company)) router.replace("/onboarding");
    else if (membership?.platformRole !== "owner") {
      router.replace(membership?.newHire ? "/learn" : "/app");
    }
  }, [ready, user, company, membership, router]);

  const rows = useMemo(
    () => (company ? buildLessonAnalytics(store, company.id) : []),
    [store, company],
  );

  if (
    !ready ||
    !user ||
    !company ||
    !isOnboardingComplete(company) ||
    membership?.platformRole !== "owner"
  ) {
    return <p className="muted">Loading…</p>;
  }

  const zeroPlays = rows.filter((r) => r.zeroPlays).length;

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
    <>
      <div className="admin-section-head">
        <div>
          <h2>Lessons</h2>
          <p className="muted admin-meta">
            {rows.length} {rows.length === 1 ? "lesson" : "lessons"}
            {zeroPlays ? ` · ${zeroPlays} never played` : ""}
          </p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="admin-people">
        <div className="admin-people-cols admin-lesson-cols-manage" aria-hidden>
          <span>Lesson</span>
          <span>Assigned</span>
          <span>Starts</span>
          <span>Done</span>
          <span>Rate</span>
          <span>Last played</span>
          <span />
        </div>
        {!rows.length ? (
          <p className="muted admin-people-empty">
            No lessons yet — experts publish Work Maps from Workspace.
          </p>
        ) : (
          <ul className="admin-people-list">
            {rows.map((row) => {
              const captureId = row.lesson.sourceCaptureId;
              return (
                <li
                  key={row.lesson.id}
                  className={`admin-person${row.zeroPlays ? " is-zero-play" : ""}`}
                >
                  <div className="admin-person-main admin-lesson-row-manage">
                    <div className="admin-person-identity">
                      <div className="admin-person-name">
                        <strong>{row.lesson.title}</strong>
                        {row.zeroPlays ? (
                          <span className="admin-badge">No plays</span>
                        ) : null}
                      </div>
                      <div className="admin-person-email">
                        {row.sourceExpert}
                        {row.lesson.summary ? ` · ${row.lesson.summary}` : ""}
                      </div>
                    </div>
                    <span className="admin-stat">{row.assignedLearners}</span>
                    <span className="admin-stat">{row.starts}</span>
                    <span className="admin-stat">{row.completions}</span>
                    <span className="admin-stat">
                      {row.starts > 0 ? `${row.completionRate}%` : "—"}
                    </span>
                    <span className="admin-stat admin-stat-muted">
                      {formatRelativeTime(row.lastPlayedAt)}
                    </span>
                    <div className="admin-lesson-actions">
                      {captureId ? (
                        <>
                          <button
                            type="button"
                            className="btn-text"
                            onClick={() => onEdit(captureId)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-text workspace-delete"
                            onClick={() => onDelete(captureId, row.lesson.title)}
                          >
                            Remove
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
