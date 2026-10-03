import { createId } from "./id";
import { COMPETENCE_RANK, type Lesson, type Membership, type Roadmap, type WorkRole } from "./types";

export type RoadmapCompileInput = {
  membership: Membership;
  memberWorkRole: WorkRole;
  companyRoles: WorkRole[];
  lessons: Lesson[];
  previous?: Roadmap | null;
  now?: number;
};

function isExpertRelativeTo(hire: WorkRole, expertRole: WorkRole): boolean {
  if (expertRole.companyId !== hire.companyId) return false;
  if (normalizeTitle(expertRole.title) !== normalizeTitle(hire.title)) return false;
  if (expertRole.seniority > hire.seniority) return true;
  if (expertRole.seniority < hire.seniority) return false;
  return COMPETENCE_RANK[expertRole.competence] > COMPETENCE_RANK[hire.competence];
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Build/update a member roadmap from company lessons produced by higher
 * seniority/competence roles with the same job title.
 */
export function compileRoadmapForMember(input: RoadmapCompileInput): Roadmap {
  const { membership, memberWorkRole, companyRoles, lessons, previous, now = Date.now() } = input;

  const expertRoleIds = new Set(
    companyRoles.filter((r) => isExpertRelativeTo(memberWorkRole, r)).map((r) => r.id),
  );

  const matched = lessons
    .filter((l) => l.companyId === membership.companyId && l.status === "active")
    .filter((l) => expertRoleIds.has(l.sourceWorkRoleId) || l.sourceWorkRoleId === memberWorkRole.id)
    // Prefer lessons from strictly more senior/competent experts; keep same-role only if no experts yet
    .filter((l) => {
      if (expertRoleIds.size === 0) return l.sourceWorkRoleId === memberWorkRole.id;
      return expertRoleIds.has(l.sourceWorkRoleId);
    })
    .sort((a, b) => a.orderHint - b.orderHint || a.createdAt - b.createdAt);

  // Deduplicate by title+passCriteria so repeated captures don't spam the hire
  const seen = new Set<string>();
  const unique: Lesson[] = [];
  for (const lesson of matched) {
    const key = `${normalizeTitle(lesson.title)}::${lesson.passCriteria.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(lesson);
  }

  const prevByLesson = new Map(previous?.items.map((i) => [i.lessonId, i]) ?? []);

  const items = unique.map((lesson, order) => {
    const prev = prevByLesson.get(lesson.id);
    return {
      lessonId: lesson.id,
      order,
      status: prev?.status === "done" || prev?.status === "in_progress" ? prev.status : order === 0 ? ("available" as const) : ("locked" as const),
    };
  });

  // Unlock next after done items
  let unlocked = true;
  for (const item of items) {
    if (item.status === "done") continue;
    if (unlocked) {
      if (item.status === "locked") item.status = "available";
      unlocked = false;
    } else if (item.status !== "in_progress") {
      item.status = "locked";
    }
  }

  return {
    id: previous?.id ?? createId("rm"),
    companyId: membership.companyId,
    membershipId: membership.id,
    workRoleId: memberWorkRole.id,
    items,
    updatedAt: now,
  };
}

export function advanceRoadmapItem(
  roadmap: Roadmap,
  lessonId: string,
  status: "in_progress" | "done",
  now = Date.now(),
): Roadmap {
  const items = roadmap.items.map((i) => (i.lessonId === lessonId ? { ...i, status } : { ...i }));
  if (status === "done") {
    let unlockNext = false;
    for (const item of items) {
      if (item.lessonId === lessonId) {
        unlockNext = true;
        continue;
      }
      if (unlockNext && item.status === "locked") {
        item.status = "available";
        break;
      }
    }
  }
  return { ...roadmap, items, updatedAt: now };
}
