import { buildLearnerPlan, type LearningSession, type Lesson, type Membership } from "@mira/core";
import {
  getRoadmapForMembership,
  latestInviteForMembership,
  type Store,
} from "@/lib/repo";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type PersonHealthStatus =
  | "on_track"
  | "stalled"
  | "not_started"
  | "invite_pending"
  | "complete";

export type PersonAnalyticsRow = {
  membership: Membership;
  name: string;
  email: string;
  done: number;
  total: number;
  progressPct: number;
  lastActiveAt: number | null;
  lastLoginAt: number | null;
  lastLessonTitle: string | null;
  status: PersonHealthStatus;
  invitePending: boolean;
};

export type LessonAnalyticsRow = {
  lesson: Lesson;
  sourceExpert: string;
  assignedLearners: number;
  starts: number;
  completions: number;
  completionRate: number;
  lastPlayedAt: number | null;
  zeroPlays: boolean;
};

export type AttentionItem = {
  kind: PersonHealthStatus;
  membershipId: string;
  name: string;
  detail: string;
};

export type RecentActivityItem = {
  id: string;
  membershipId: string;
  personName: string;
  lessonTitle: string;
  outcome: LearningSession["outcome"];
  at: number;
};

export type OverviewAnalytics = {
  activeLearners7d: number;
  completions7d: number;
  completionsAll: number;
  avgRoadmapCompletion: number;
  lessonsWithZeroPlays: number;
  attention: AttentionItem[];
  recentActivity: RecentActivityItem[];
  topLessons: LessonAnalyticsRow[];
};

export function formatRelativeTime(at: number | null | undefined, now = Date.now()): string {
  if (!at) return "—";
  const delta = Math.max(0, now - at);
  if (delta < 60_000) return "just now";
  if (delta < 60 * 60_000) {
    const mins = Math.floor(delta / 60_000);
    return `${mins}m ago`;
  }
  if (delta < DAY_MS) {
    const hours = Math.floor(delta / (60 * 60_000));
    return `${hours}h ago`;
  }
  if (delta < WEEK_MS) {
    const days = Math.floor(delta / DAY_MS);
    return `${days}d ago`;
  }
  if (delta < 30 * DAY_MS) {
    const weeks = Math.floor(delta / WEEK_MS);
    return `${weeks}w ago`;
  }
  return new Date(at).toLocaleDateString();
}

export function personStatusLabel(status: PersonHealthStatus): string {
  switch (status) {
    case "on_track":
      return "On track";
    case "stalled":
      return "Stalled";
    case "not_started":
      return "Not started";
    case "invite_pending":
      return "Invite pending";
    case "complete":
      return "Complete";
  }
}

function sessionsForCompany(store: Store, companyId: string): LearningSession[] {
  return (store.learningSessions ?? []).filter((s) => s.companyId === companyId);
}

function lastSessionForMember(
  sessions: LearningSession[],
  membershipId: string,
): LearningSession | null {
  let best: LearningSession | null = null;
  for (const s of sessions) {
    if (s.membershipId !== membershipId) continue;
    const at = s.endedAt ?? s.startedAt;
    if (!best || at > (best.endedAt ?? best.startedAt)) best = s;
  }
  return best;
}

function resolvePersonStatus(input: {
  invitePending: boolean;
  done: number;
  total: number;
  lastActiveAt: number | null;
  now: number;
}): PersonHealthStatus {
  if (input.invitePending) return "invite_pending";
  if (input.total > 0 && input.done >= input.total) return "complete";
  if (input.total === 0 || input.done === 0) {
    if (!input.lastActiveAt) return "not_started";
    if (input.now - input.lastActiveAt > WEEK_MS) return "stalled";
    return input.done === 0 ? "not_started" : "on_track";
  }
  if (!input.lastActiveAt || input.now - input.lastActiveAt > WEEK_MS) return "stalled";
  return "on_track";
}

export function buildPersonAnalytics(
  store: Store,
  companyId: string,
  now = Date.now(),
): PersonAnalyticsRow[] {
  const sessions = sessionsForCompany(store, companyId);
  const members = store.memberships.filter((m) => m.companyId === companyId);

  return members.map((membership) => {
    const person = store.users.find((u) => u.id === membership.userId);
    const learnerRole = store.workRoles.find((r) => r.id === membership.workRoleId) ?? null;
    const roadmap = getRoadmapForMembership(store, membership.id);
    const plan = buildLearnerPlan({
      roadmap,
      lessons: store.lessons,
      learnerRole,
      memberships: store.memberships,
      users: store.users,
      workRoles: store.workRoles,
    });
    const invite = latestInviteForMembership(store, membership.id);
    const invitePending = Boolean(invite && !invite.acceptedAt);
    const lastSession = lastSessionForMember(sessions, membership.id);
    const lastActiveAt =
      membership.lastActiveAt ??
      (lastSession ? lastSession.endedAt ?? lastSession.startedAt : null);
    const lastLessonTitle = lastSession
      ? store.lessons.find((l) => l.id === lastSession.lessonId)?.title ?? "Lesson"
      : null;
    const done = plan.doneCount;
    const total = plan.totalCount;
    const status = resolvePersonStatus({
      invitePending,
      done,
      total,
      lastActiveAt,
      now,
    });

    return {
      membership,
      name: person?.name ?? "Unknown",
      email: person?.email ?? "",
      done,
      total,
      progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
      lastActiveAt,
      lastLoginAt: person?.lastLoginAt ?? null,
      lastLessonTitle,
      status,
      invitePending,
    };
  });
}

export function buildLessonAnalytics(
  store: Store,
  companyId: string,
): LessonAnalyticsRow[] {
  const sessions = sessionsForCompany(store, companyId);
  const lessons = store.lessons.filter((l) => l.companyId === companyId);
  const roadmaps = store.roadmaps.filter((r) => r.companyId === companyId);

  return lessons
    .map((lesson) => {
      const lessonSessions = sessions.filter((s) => s.lessonId === lesson.id);
      const starts = lessonSessions.length;
      const completions = lessonSessions.filter((s) => s.outcome === "completed").length;
      const lastPlayedAt = lessonSessions.reduce<number | null>((best, s) => {
        const at = s.endedAt ?? s.startedAt;
        return best === null || at > best ? at : best;
      }, null);
      const assignedLearners = roadmaps.filter((r) =>
        r.items.some((i) => i.lessonId === lesson.id),
      ).length;
      const sourceMember = store.memberships.find((m) => m.id === lesson.sourceMemberId);
      const sourceUser = store.users.find((u) => u.id === sourceMember?.userId);
      return {
        lesson,
        sourceExpert: sourceUser?.name ?? "Unknown",
        assignedLearners,
        starts,
        completions,
        completionRate: starts > 0 ? Math.round((completions / starts) * 100) : 0,
        lastPlayedAt,
        zeroPlays: starts === 0,
      };
    })
    .sort((a, b) => {
      if (a.zeroPlays !== b.zeroPlays) return a.zeroPlays ? 1 : -1;
      return (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0);
    });
}

export function buildOverviewAnalytics(
  store: Store,
  companyId: string,
  now = Date.now(),
): OverviewAnalytics {
  const weekAgo = now - WEEK_MS;
  const people = buildPersonAnalytics(store, companyId, now);
  const lessons = buildLessonAnalytics(store, companyId);
  const sessions = sessionsForCompany(store, companyId);

  const activeLearners7d = new Set(
    sessions
      .filter((s) => (s.endedAt ?? s.startedAt) >= weekAgo)
      .map((s) => s.membershipId),
  ).size;

  const completions7d = sessions.filter(
    (s) => s.outcome === "completed" && (s.endedAt ?? s.startedAt) >= weekAgo,
  ).length;
  const completionsAll = sessions.filter((s) => s.outcome === "completed").length;

  const withRoadmap = people.filter((p) => p.total > 0);
  const avgRoadmapCompletion =
    withRoadmap.length > 0
      ? Math.round(
          withRoadmap.reduce((sum, p) => sum + p.progressPct, 0) / withRoadmap.length,
        )
      : 0;

  const attention: AttentionItem[] = people
    .filter((p) =>
      ["stalled", "not_started", "invite_pending"].includes(p.status),
    )
    .slice(0, 8)
    .map((p) => ({
      kind: p.status,
      membershipId: p.membership.id,
      name: p.name,
      detail:
        p.status === "invite_pending"
          ? "Invite not accepted"
          : p.status === "stalled"
            ? `No activity since ${formatRelativeTime(p.lastActiveAt, now)}`
            : p.total > 0
              ? "Hasn't started their roadmap"
              : "No roadmap yet",
    }));

  const recentActivity: RecentActivityItem[] = [...sessions]
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    .slice(0, 10)
    .map((s) => {
      const person = people.find((p) => p.membership.id === s.membershipId);
      const lesson = store.lessons.find((l) => l.id === s.lessonId);
      return {
        id: s.id,
        membershipId: s.membershipId,
        personName: person?.name ?? "Someone",
        lessonTitle: lesson?.title ?? "Lesson",
        outcome: s.outcome,
        at: s.endedAt ?? s.startedAt,
      };
    });

  const topLessons = [...lessons]
    .sort((a, b) => b.starts - a.starts || b.completions - a.completions)
    .slice(0, 5);

  return {
    activeLearners7d,
    completions7d,
    completionsAll,
    avgRoadmapCompletion,
    lessonsWithZeroPlays: lessons.filter((l) => l.zeroPlays).length,
    attention,
    recentActivity,
    topLessons,
  };
}

export function outcomeLabel(outcome: LearningSession["outcome"]): string {
  switch (outcome) {
    case "started":
      return "Started";
    case "completed":
      return "Completed";
    case "exited":
      return "Exited";
  }
}
