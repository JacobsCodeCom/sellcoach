import { COMPETENCE_RANK, type Lesson, type Roadmap, type RoadmapItemStatus, type WorkRole } from "./types";

export const RULE_LESSON_MINUTES = 5;
const MIN_WORKMAP_MINUTES = 5;
const MINUTES_PER_STEP = 3;
const MINUTES_PER_JUDGMENT = 2;

export type LearnerPlanPerson = {
  id: string;
  name: string;
};

export type LearnerPlanMembership = {
  id: string;
  userId: string;
};

export type LearnerPlanRow = {
  lessonId: string;
  order: number;
  status: RoadmapItemStatus;
  title: string;
  summary: string;
  estimateMinutes: number;
  why: string;
  expertName?: string;
  lesson: Lesson;
};

export type LearnerPlan = {
  rows: LearnerPlanRow[];
  doneCount: number;
  totalCount: number;
  totalMinutes: number;
  remainingMinutes: number;
  next: LearnerPlanRow | null;
};

/** Rough learner time for a Work Map lesson: steps + judgment practice. */
export function estimateWorkMapMinutes(stepCount: number, judgmentCount: number): number {
  const raw = stepCount * MINUTES_PER_STEP + judgmentCount * MINUTES_PER_JUDGMENT;
  return Math.max(MIN_WORKMAP_MINUTES, raw);
}

/** Stored estimate, or a sensible fallback for older lessons. */
export function estimateLessonMinutes(lesson: Lesson): number {
  if (typeof lesson.estimateMinutes === "number" && lesson.estimateMinutes > 0) {
    return lesson.estimateMinutes;
  }
  return RULE_LESSON_MINUTES;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function levelPhrase(role: WorkRole): string {
  return `${role.competence} ${role.title}`;
}

/**
 * One-line reason this lesson is on the learner's path.
 * Derived from source expert vs learner role — not stored on RoadmapItem.
 */
export function whyAssigned(input: {
  expertName?: string;
  expertRole?: WorkRole | null;
  learnerRole?: WorkRole | null;
}): string {
  const { expertName, expertRole, learnerRole } = input;
  const from = expertName?.trim() || "A teammate";

  if (!expertRole) {
    return `From ${from}`;
  }

  const expertLabel = levelPhrase(expertRole);

  if (!learnerRole) {
    return `From ${from} · ${expertLabel}`;
  }

  if (normalizeTitle(expertRole.title) === normalizeTitle(learnerRole.title)) {
    const higherLevel =
      expertRole.seniority > learnerRole.seniority ||
      (expertRole.seniority === learnerRole.seniority &&
        COMPETENCE_RANK[expertRole.competence] > COMPETENCE_RANK[learnerRole.competence]);
    if (higherLevel) {
      return `From ${from} · ${expertLabel} — same role, higher level than you`;
    }
    if (expertRole.id === learnerRole.id) {
      return `From ${from} · ${expertLabel} — how your role does this work`;
    }
    return `From ${from} · ${expertLabel} — matched to your ${learnerRole.title} path`;
  }

  return `From ${from} · ${expertLabel}`;
}

export type BuildLearnerPlanInput = {
  roadmap: Roadmap | null | undefined;
  lessons: Lesson[];
  learnerRole: WorkRole | null;
  /** Memberships used to resolve lesson.sourceMemberId → user. */
  memberships: LearnerPlanMembership[];
  users: LearnerPlanPerson[];
  workRoles: WorkRole[];
};

export function buildLearnerPlan(input: BuildLearnerPlanInput): LearnerPlan {
  const { roadmap, lessons, learnerRole, memberships, users, workRoles } = input;
  const lessonsById = new Map(lessons.map((l) => [l.id, l]));
  const membershipById = new Map(memberships.map((m) => [m.id, m]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const roleById = new Map(workRoles.map((r) => [r.id, r]));

  const items = [...(roadmap?.items ?? [])].sort((a, b) => a.order - b.order);

  const rows: LearnerPlanRow[] = items.map((item) => {
    const lesson = lessonsById.get(item.lessonId);
    const expertRole = lesson ? roleById.get(lesson.sourceWorkRoleId) ?? null : null;
    const sourceMembership = lesson ? membershipById.get(lesson.sourceMemberId) : undefined;
    const expert = sourceMembership ? userById.get(sourceMembership.userId) : undefined;
    const estimateMinutes = lesson ? estimateLessonMinutes(lesson) : RULE_LESSON_MINUTES;
    const title = lesson?.title ?? "Lesson";
    const summary = lesson?.summary ?? "";
    const why = whyAssigned({
      expertName: expert?.name,
      expertRole,
      learnerRole,
    });

    return {
      lessonId: item.lessonId,
      order: item.order,
      status: item.status,
      title,
      summary,
      estimateMinutes,
      why,
      expertName: expert?.name,
      lesson: lesson ?? {
        id: item.lessonId,
        companyId: roadmap?.companyId ?? "",
        sourceCaptureId: "",
        sourceMemberId: "",
        sourceWorkRoleId: "",
        title,
        summary,
        prompt: "",
        passCriteria: "",
        orderHint: item.order,
        status: "active",
        createdAt: 0,
        estimateMinutes,
      },
    };
  });

  const doneCount = rows.filter((r) => r.status === "done").length;
  const totalCount = rows.length;
  const totalMinutes = rows.reduce((sum, r) => sum + r.estimateMinutes, 0);
  const remainingMinutes = rows
    .filter((r) => r.status !== "done")
    .reduce((sum, r) => sum + r.estimateMinutes, 0);
  const next =
    rows.find((r) => r.status === "in_progress" || r.status === "available") ?? null;

  return {
    rows,
    doneCount,
    totalCount,
    totalMinutes,
    remainingMinutes,
    next,
  };
}

/** Human-readable remaining time, e.g. "About 40 min left". */
export function formatRemainingMinutes(minutes: number): string {
  if (minutes <= 0) return "Nothing left on your plan";
  if (minutes < 60) return `About ${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return hours === 1 ? "About 1 hour left" : `About ${hours} hours left`;
  return `About ${hours}h ${rem}m left`;
}

export function statusLabel(status: RoadmapItemStatus): string {
  switch (status) {
    case "locked":
      return "Locked";
    case "available":
      return "Up next";
    case "in_progress":
      return "In progress";
    case "done":
      return "Done";
  }
}
