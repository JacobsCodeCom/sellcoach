/** Platform role on a company membership (not the job title). */
export type PlatformRole = "owner" | "member";

/** Competence band for a work role — used when matching experts → hires. */
export type Competence = "junior" | "mid" | "expert";

export type Seniority = number;

export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: number;
};

export type Company = {
  id: string;
  name: string;
  /** Short description of what the company does — set during owner onboarding. */
  summary?: string;
  createdAt: number;
  ownerUserId: string;
  /** False until the setup chat finishes; undefined treated as already done (legacy). */
  onboardingComplete?: boolean;
  /** Solo founder: owner will capture as the expert (no separate teammate). */
  ownerIsExpert?: boolean;
};

export type Membership = {
  id: string;
  userId: string;
  companyId: string;
  platformRole: PlatformRole;
  workRoleId: string | null;
  /** Person being onboarded: learner-only app (lessons + voice tutor, no capture). */
  newHire?: boolean;
  createdAt: number;
};

/** Company-defined job profile (title + seniority + competence). */
export type WorkRole = {
  id: string;
  companyId: string;
  title: string;
  seniority: Seniority;
  competence: Competence;
  createdAt: number;
};

export type CaptureEvent = {
  id: string;
  t: number;
  kind: string;
  label: string;
  detail?: string;
};

export type TeachBack = {
  id: string;
  prompt: string;
  answer: string;
  confirmed: boolean;
  ruleLabel?: string;
};

export type GuardrailDraft = {
  id: string;
  label: string;
  ruleText: string;
  sourceEventIds: string[];
  confirmed: boolean;
};

export type MapStepDraft = {
  id: string;
  title: string;
  summary: string;
  order: number;
  guardrailIds: string[];
};

/** Experienced member's recorded knowledge for one session. */
export type CaptureSession = {
  id: string;
  companyId: string;
  memberId: string;
  workRoleId: string;
  startedAt: number;
  endedAt: number | null;
  events: CaptureEvent[];
  teachBacks: TeachBack[];
  guardrails: GuardrailDraft[];
  mapSteps: MapStepDraft[];
};

export type LessonStatus = "draft" | "active";

/** Compiled from confirmed guardrails / map steps — not hard-coded vertical content. */
export type Lesson = {
  id: string;
  companyId: string;
  sourceCaptureId: string;
  sourceMemberId: string;
  sourceWorkRoleId: string;
  title: string;
  summary: string;
  prompt: string;
  passCriteria: string;
  orderHint: number;
  status: LessonStatus;
  createdAt: number;
};

export type RoadmapItemStatus = "locked" | "available" | "in_progress" | "done";

export type RoadmapItem = {
  lessonId: string;
  status: RoadmapItemStatus;
  order: number;
};

/** Ordered lessons attached to a membership from matching expert knowledge. */
export type Roadmap = {
  id: string;
  companyId: string;
  membershipId: string;
  workRoleId: string;
  items: RoadmapItem[];
  updatedAt: number;
};

export const COMPETENCE_RANK: Record<Competence, number> = {
  junior: 1,
  mid: 2,
  expert: 3,
};
