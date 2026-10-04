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
  /** Last successful sign-in / session bind. */
  lastLoginAt?: number;
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
  /** External source id for idempotent org sync (e.g. Notion workspace). */
  externalId?: string;
};

export type Membership = {
  id: string;
  userId: string;
  companyId: string;
  platformRole: PlatformRole;
  workRoleId: string | null;
  /** Set when their work role was removed; cleared once a role is reassigned. */
  needsRole?: boolean;
  /** Person being onboarded: learner-only app (lessons + voice tutor, no capture). */
  newHire?: boolean;
  createdAt: number;
  /** Last Learn / Workspace activity for this membership. */
  lastActiveAt?: number;
  /** External person page id from an integration sync. */
  externalId?: string;
};

/** Admin-created join token — company binding is via invite, not email domain. */
export type Invite = {
  id: string;
  token: string;
  companyId: string;
  /** Denormalized for invite landing before the viewer is a member. */
  companyName?: string;
  email: string;
  name: string;
  workRoleId: string | null;
  platformRole: PlatformRole;
  newHire?: boolean;
  /** Membership created when the person was added (local preview / after accept). */
  membershipId?: string | null;
  createdAt: number;
  acceptedAt?: number;
  revokedAt?: number;
};

/** Company-defined job profile (title + seniority + competence). */
export type WorkRole = {
  id: string;
  companyId: string;
  title: string;
  seniority: Seniority;
  competence: Competence;
  createdAt: number;
  /** External role key from an integration sync. */
  externalId?: string;
};

export type IntegrationProvider = "notion";

export type IntegrationConnectionStatus = "connected" | "error" | "disconnected";

/** Company-level link to an external workspace (Notion first). */
export type IntegrationConnection = {
  id: string;
  companyId: string;
  provider: IntegrationProvider;
  status: IntegrationConnectionStatus;
  workspaceName: string;
  /** Opaque token reference — never store raw secrets in the client store for production. */
  tokenRef?: string;
  lastSyncAt?: number;
  /** Selected Notion people database id. */
  peopleDatabaseId?: string;
  /** Optional Notion page/database ids for process knowledge. */
  knowledgeSourceIds?: string[];
  errorMessage?: string;
  createdAt: number;
};

export type ExternalPersonAdminStatus = "pending" | "linked" | "ignored";

/** Imported person awaiting or confirmed admin role mapping. */
export type ExternalPerson = {
  id: string;
  companyId: string;
  connectionId: string;
  provider: IntegrationProvider;
  /** Notion page id (or other provider id). */
  externalId: string;
  externalUrl?: string;
  name: string;
  email?: string;
  roleText?: string;
  area?: string;
  jobRoles: string[];
  workSummaries: string[];
  suggestedTitle?: string;
  suggestedCompetence?: Competence;
  suggestedSeniority?: Seniority;
  suggestedNewHire?: boolean;
  /** Admin overrides before/after link. */
  mappedTitle?: string;
  mappedCompetence?: Competence;
  mappedSeniority?: Seniority;
  mappedNewHire?: boolean;
  userId?: string | null;
  membershipId?: string | null;
  workRoleId?: string | null;
  adminStatus: ExternalPersonAdminStatus;
  updatedAt: number;
};

export type KnowledgeTopicSource = "notion_page" | "assignment" | "profile";

/** Work topic imported from Notion (or derived from a person's work history). */
export type KnowledgeTopic = {
  id: string;
  companyId: string;
  connectionId: string;
  provider: IntegrationProvider;
  externalId: string;
  externalUrl?: string;
  title: string;
  summary: string;
  source: KnowledgeTopicSource;
  suggestedArea?: string;
  suggestedRoleTitle?: string;
  /** Optional link back to the person this topic was derived from. */
  externalPersonId?: string;
  updatedAt: number;
};

export type CaptureTaskStatus = "todo" | "in_progress" | "done" | "dismissed";

/** Session an experienced teammate should record to reveal how work is done. */
export type CaptureTask = {
  id: string;
  companyId: string;
  assigneeMembershipId: string;
  title: string;
  brief: string;
  topicId?: string | null;
  status: CaptureTaskStatus;
  captureId?: string | null;
  createdAt: number;
  updatedAt: number;
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

/** Small JPEG of the shared screen at `t` ms into the session. */
export type ScreenMoment = {
  id: string;
  t: number;
  image: string;
  /** Active tab URL when the moment was captured (extension recording). */
  url?: string;
};

export type TranscriptLine = {
  t: number;
  who: "expert" | "apprentice";
  text: string;
};

export type QuestionKind = "why" | "guardrail" | "exception";

/** A question the apprentice asked during recording, with the expert's spoken answer. */
export type LiveQuestion = {
  id: string;
  t: number;
  question: string;
  kind: QuestionKind;
  answer: string;
  momentId: string | null;
};

export type GuardrailType = "limit" | "exception" | "stop_and_ask";

export type WorkMapGuardrail = {
  id: string;
  type: GuardrailType;
  rule: string;
  /** The expert's own words, or "" until the debrief fills it in. */
  quote: string;
  t: number | null;
  momentId: string | null;
};

export type WorkMapStep = {
  id: string;
  title: string;
  t: number | null;
  momentId: string | null;
  /** One line: what was on screen. */
  screen: string;
  decision: string;
  isJudgmentCall: boolean;
  /** Expert's reason in their own words, or "" if not yet explained. */
  reason: string;
  reasonSource: string;
  guardrailIds: string[];
  /** Page the expert was on for this step (from the linked screen moment). */
  pageUrl?: string;
};

/** The workflow an expert showed: ordered steps, judgment calls and guardrails. */
export type WorkMap = {
  title: string;
  steps: WorkMapStep[];
  guardrails: WorkMapGuardrail[];
  openQuestions: string[];
  /** The whole process read back to the expert for confirmation. */
  teachBack: string;
  confirmed: boolean;
  corrections: string[];
};

/** Experienced member's recorded knowledge for one session. */
export type CaptureSession = {
  id: string;
  companyId: string;
  memberId: string;
  workRoleId: string;
  startedAt: number;
  /** When recording stopped (legacy captures: when published). */
  endedAt: number | null;
  publishedAt?: number;
  events: CaptureEvent[];
  teachBacks: TeachBack[];
  guardrails: GuardrailDraft[];
  mapSteps: MapStepDraft[];
  transcript?: TranscriptLine[];
  questions?: LiveQuestion[];
  moments?: ScreenMoment[];
  debrief?: TranscriptLine[];
  workMap?: WorkMap | null;
  /** Capture task that launched this session, if any. */
  taskId?: string | null;
  /** Brief for the apprentice / expert about what to reveal. */
  taskBrief?: string | null;
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
  /** "workmap": one lesson covering a whole captured Work Map. Absent on legacy per-rule lessons. */
  kind?: "rule" | "workmap";
  /** Rough learner time for the full lesson (walkthrough + practice). */
  estimateMinutes?: number;
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

export type LearningSessionOutcome = "started" | "completed" | "exited";

/** One lesson play attempt — used for admin analytics. */
export type LearningSession = {
  id: string;
  companyId: string;
  membershipId: string;
  lessonId: string;
  startedAt: number;
  endedAt?: number;
  outcome: LearningSessionOutcome;
};

export const COMPETENCE_RANK: Record<Competence, number> = {
  junior: 1,
  mid: 2,
  expert: 3,
};

/** Company digital worker that can be given abilities from recorded work. */
export type AgentStatus = "draft" | "active";

export type Agent = {
  id: string;
  companyId: string;
  name: string;
  brief: string;
  workRoleId: string | null;
  status: AgentStatus;
  createdAt: number;
};

/** When this ability should fire. `described` is free-text for later real triggers. */
export type AbilityTrigger = "manual" | "described";

/**
 * A Work Map assigned to an agent with trigger + runtime config.
 * Later: a computer-use executor consumes ActionPlans produced from this.
 */
export type AgentAbility = {
  id: string;
  agentId: string;
  companyId: string;
  name: string;
  sourceCaptureId: string;
  sourceLessonId: string | null;
  trigger: AbilityTrigger;
  /** When trigger is `described`: natural-language when-to-fire. */
  triggerDescription: string;
  notes: string;
  extraGuardrails: string[];
  enabled: boolean;
  createdAt: number;
};

/** Semantic executable step — not UI coordinates. Future executors map these to clicks/keys. */
export type ActionIntentKind = "observe" | "act" | "decide" | "ask_human" | "stop";

export type ActionIntent = {
  id: string;
  kind: ActionIntentKind;
  title: string;
  detail: string;
  workMapStepId: string | null;
  guardrailIds: string[];
};

export type AbilityRunMode = "dry_run";

export type AbilityRunStatus = "complete" | "failed";

export type AbilityRun = {
  id: string;
  abilityId: string;
  agentId: string;
  mode: AbilityRunMode;
  status: AbilityRunStatus;
  /** Optional free-text situation for this run. */
  context: string;
  plan: ActionIntent[];
  summary: string;
  createdAt: number;
};
