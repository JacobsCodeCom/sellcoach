"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  buildOverviewAnalytics,
  formatRelativeTime,
  outcomeLabel,
  personStatusLabel,
} from "@/lib/adminAnalytics";
import { isOnboardingComplete } from "@/lib/repo";
import { useSession } from "@/lib/store";

export default function AdminOverviewPage() {
  const router = useRouter();
  const { ready, user, company, membership, store } = useSession();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/");
    else if (!company) router.replace("/onboarding");
    else if (!isOnboardingComplete(company)) router.replace("/onboarding");
    else if (membership?.platformRole !== "owner") {
      router.replace(membership?.newHire ? "/learn" : "/app");
    }
  }, [ready, user, company, membership, router]);

  const analytics = useMemo(
    () => (company ? buildOverviewAnalytics(store, company.id) : null),
    [store, company],
  );

  if (
    !ready ||
    !user ||
    !company ||
    !isOnboardingComplete(company) ||
    membership?.platformRole !== "owner" ||
    !analytics
  ) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <>
      <div className="admin-section-head">
        <div>
          <h2>Overview</h2>
          <p className="muted admin-meta">
            {company.name} · learning activity and progression
          </p>
        </div>
        <Link className="btn btn-primary" href="/admin/people">
          Manage people
        </Link>
      </div>

      <div className="admin-metrics" aria-label="Learning KPIs">
        <div className="admin-metric">
          <span className="admin-metric-value">{analytics.activeLearners7d}</span>
          <span className="admin-metric-label">Active learners (7d)</span>
        </div>
        <div className="admin-metric">
          <span className="admin-metric-value">
            {analytics.completions7d}
            <span className="admin-metric-sub">/{analytics.completionsAll}</span>
          </span>
          <span className="admin-metric-label">Completions (7d / all)</span>
        </div>
        <div className="admin-metric">
          <span className="admin-metric-value">{analytics.avgRoadmapCompletion}%</span>
          <span className="admin-metric-label">Avg roadmap done</span>
        </div>
        <Link href="/admin/lessons" className="admin-metric">
          <span className="admin-metric-value">{analytics.lessonsWithZeroPlays}</span>
          <span className="admin-metric-label">Lessons with 0 plays</span>
        </Link>
      </div>

      <div className="admin-overview-grid">
        <section className="admin-panel">
          <div className="admin-panel-head">
            <h3>Needs attention</h3>
            <Link className="admin-link" href="/admin/people">
              View people
            </Link>
          </div>
          {analytics.attention.length ? (
            <ul className="admin-attention-list">
              {analytics.attention.map((item) => (
                <li key={item.membershipId}>
                  <div>
                    <strong>{item.name}</strong>
                    <div className="muted">{item.detail}</div>
                  </div>
                  <span className={`admin-status admin-status-${item.kind}`}>
                    {personStatusLabel(item.kind)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted admin-panel-empty">Everyone looks on track.</p>
          )}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h3>Recent activity</h3>
            <Link className="admin-link" href="/admin/lessons">
              View lessons
            </Link>
          </div>
          {analytics.recentActivity.length ? (
            <ul className="admin-activity-list">
              {analytics.recentActivity.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.personName}</strong>
                    <div className="muted">
                      {outcomeLabel(item.outcome)} · {item.lessonTitle}
                    </div>
                  </div>
                  <span className="admin-activity-time">
                    {formatRelativeTime(item.at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted admin-panel-empty">
              No lesson sessions yet — activity appears when people open Learn.
            </p>
          )}
        </section>
      </div>

      <section className="admin-panel admin-top-lessons">
        <div className="admin-panel-head">
          <h3>Top lessons</h3>
          <Link className="admin-link" href="/admin/lessons">
            All lessons
          </Link>
        </div>
        {analytics.topLessons.length ? (
          <div className="admin-people">
            <div className="admin-people-cols admin-lesson-cols" aria-hidden>
              <span>Lesson</span>
              <span>Starts</span>
              <span>Done</span>
              <span>Rate</span>
            </div>
            <ul className="admin-people-list">
              {analytics.topLessons.map((row) => (
                <li key={row.lesson.id} className="admin-person">
                  <div className="admin-person-main admin-lesson-row">
                    <div className="admin-person-identity">
                      <div className="admin-person-name">
                        <strong>{row.lesson.title}</strong>
                        {row.zeroPlays ? (
                          <span className="admin-badge">No plays</span>
                        ) : null}
                      </div>
                      <div className="admin-person-email">
                        {row.sourceExpert} · {row.assignedLearners} assigned
                      </div>
                    </div>
                    <span className="admin-stat">{row.starts}</span>
                    <span className="admin-stat">{row.completions}</span>
                    <span className="admin-stat">
                      {row.starts > 0 ? `${row.completionRate}%` : "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted admin-panel-empty">
            No lessons yet — publish a Work Map from Workspace to create them.
          </p>
        )}
      </section>
    </>
  );
}
