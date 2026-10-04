import { createId } from "./id";
import type {
  CaptureSession,
  CaptureTask,
  Competence,
  ExternalPerson,
  KnowledgeTopic,
  Lesson,
  Membership,
  WorkRole,
} from "./types";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleOverlaps(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function canCaptureRole(workRole: WorkRole | null | undefined): boolean {
  if (!workRole) return false;
  return workRole.competence === "expert" || workRole.competence === "mid" || workRole.seniority >= 3;
}

export function suggestRoleFromNotion(input: {
  roleText?: string;
  area?: string;
  jobRoles?: string[];
}): { title: string; competence: Competence; seniority: number; newHire: boolean } {
  const job = input.jobRoles?.[0] || input.roleText || input.area || "Teammate";
  const hay = `${input.roleText ?? ""} ${input.jobRoles?.join(" ") ?? ""} ${job}`.toLowerCase();
  let competence: Competence = "mid";
  let seniority = 2;
  if (/\b(junior|jr|associate|intern)\b/.test(hay)) {
    competence = "junior";
    seniority = 1;
  } else if (/\b(senior|lead|principal|staff|head|director)\b/.test(hay)) {
    competence = "expert";
    seniority = 4;
  } else if (/\b(mid|medior)\b/.test(hay)) {
    competence = "mid";
    seniority = 2;
  }
  const newHire = /\b(new hire|junior|intern|associate)\b/.test(hay) && competence === "junior";
  return { title: job.trim(), competence, seniority, newHire };
}

function topicCoveredByLessons(topic: KnowledgeTopic, lessons: Lesson[], workRoleId: string): boolean {
  return lessons.some(
    (l) =>
      l.sourceWorkRoleId === workRoleId &&
      l.status === "active" &&
      (titleOverlaps(l.title, topic.title) || titleOverlaps(l.summary, topic.title)),
  );
}

function topicMatchesExpert(
  topic: KnowledgeTopic,
  workRole: WorkRole,
  person: ExternalPerson | undefined,
): boolean {
  if (person && topic.externalPersonId === person.id) return true;
  const roleTitle = normalize(workRole.title);
  if (topic.suggestedRoleTitle && titleOverlaps(topic.suggestedRoleTitle, workRole.title)) return true;
  if (topic.suggestedArea && person?.area && normalize(topic.suggestedArea) === normalize(person.area)) {
    return true;
  }
  if (person?.jobRoles.some((j) => titleOverlaps(j, workRole.title))) return true;
  if (person?.roleText && titleOverlaps(person.roleText, workRole.title)) return true;
  // Area-level topics: match when the role title mentions the area (e.g. Frontend developer).
  if (topic.suggestedArea && roleTitle.includes(normalize(topic.suggestedArea))) return true;
  return !topic.externalPersonId && !topic.suggestedRoleTitle && !topic.suggestedArea;
}

/**
 * Build capture tasks for experts from uncovered knowledge topics.
 * Preserves done/dismissed/in_progress tasks; refreshes open todos for the same assignee+topic.
 */
export function compileCaptureTasks(input: {
  companyId: string;
  memberships: Membership[];
  workRoles: WorkRole[];
  people: ExternalPerson[];
  topics: KnowledgeTopic[];
  lessons: Lesson[];
  captures: CaptureSession[];
  previous: CaptureTask[];
}): CaptureTask[] {
  const now = Date.now();
  const rolesById = new Map(input.workRoles.map((r) => [r.id, r]));
  const peopleByMembership = new Map(
    input.people.filter((p) => p.membershipId).map((p) => [p.membershipId!, p]),
  );

  const preserved = input.previous.filter(
    (t) =>
      t.companyId === input.companyId &&
      (t.status === "done" || t.status === "dismissed" || t.status === "in_progress"),
  );
  const preservedKeys = new Set(
    preserved.map((t) => `${t.assigneeMembershipId}:${t.topicId ?? t.title}`),
  );

  const next: CaptureTask[] = [...preserved];

  for (const membership of input.memberships) {
    if (membership.companyId !== input.companyId || membership.newHire || !membership.workRoleId) {
      continue;
    }
    const workRole = rolesById.get(membership.workRoleId);
    if (!canCaptureRole(workRole)) continue;
    const person = peopleByMembership.get(membership.id);

    const relevantTopics = input.topics.filter(
      (topic) =>
        topic.companyId === input.companyId && topicMatchesExpert(topic, workRole!, person),
    );

    // Role-gap fallback when Notion has people but few knowledge pages.
    const gapTopics: KnowledgeTopic[] =
      relevantTopics.length > 0
        ? relevantTopics
        : [
            {
              id: `gap_${membership.id}`,
              companyId: input.companyId,
              connectionId: person?.connectionId ?? "local",
              provider: "notion",
              externalId: `gap:${workRole!.title}`,
              title: `How ${workRole!.title} work is done`,
              summary: person?.workSummaries[0] ||
                `Record a real session showing how a ${workRole!.title} (${workRole!.competence}) gets work done day to day.`,
              source: "profile",
              suggestedRoleTitle: workRole!.title,
              suggestedArea: person?.area,
              externalPersonId: person?.id,
              updatedAt: now,
            },
          ];

    for (const topic of gapTopics) {
      const key = `${membership.id}:${topic.id.startsWith("gap_") ? topic.title : topic.id}`;
      if (preservedKeys.has(key)) continue;
      if (topicCoveredByLessons(topic, input.lessons, workRole!.id)) continue;

      const existingOpen = input.previous.find(
        (t) =>
          t.companyId === input.companyId &&
          t.assigneeMembershipId === membership.id &&
          t.status === "todo" &&
          (t.topicId === topic.id || titleOverlaps(t.title, topic.title)),
      );

      const briefParts = [
        topic.summary,
        person?.workSummaries.filter(Boolean).slice(0, 2).join(" "),
      ].filter(Boolean);

      next.push({
        id: existingOpen?.id ?? createId("task"),
        companyId: input.companyId,
        assigneeMembershipId: membership.id,
        title: topic.title,
        brief: briefParts.join(" — ").slice(0, 600) || `Record how you do: ${topic.title}`,
        topicId: topic.id.startsWith("gap_") ? null : topic.id,
        status: "todo",
        captureId: existingOpen?.captureId ?? null,
        createdAt: existingOpen?.createdAt ?? now,
        updatedAt: now,
      });
      preservedKeys.add(key);
    }
  }

  return next;
}
