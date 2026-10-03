"use client";

import {
  advanceRoadmapItem,
  compileLessonsFromCapture,
  compileRoadmapForMember,
  compileWorkMapFromTeachBacks,
  createId,
  mergeLessonPool,
  normalizeTranscriptLines,
  ruleLabelFromAnswer,
  type CaptureSession,
  type Company,
  type Competence,
  type Lesson,
  type Membership,
  type PlatformRole,
  type Roadmap,
  type Seniority,
  type TeachBack,
  type User,
  type WorkRole,
} from "@mira/core";

const STORAGE_KEY = "mira-web-v1";

export type Store = {
  users: User[];
  companies: Company[];
  memberships: Membership[];
  workRoles: WorkRole[];
  captures: CaptureSession[];
  lessons: Lesson[];
  roadmaps: Roadmap[];
  sessionUserId: string | null;
  activeCompanyId: string | null;
};

export function emptyStore(): Store {
  return {
    users: [],
    companies: [],
    memberships: [],
    workRoles: [],
    captures: [],
    lessons: [],
    roadmaps: [],
    sessionUserId: null,
    activeCompanyId: null,
  };
}

function read(): Store {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    return restoreCompanyOwners({ ...emptyStore(), ...JSON.parse(raw) } as Store);
  } catch {
    return emptyStore();
  }
}

function write(store: Store): Store {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
  return store;
}

/** A company's creator always keeps owner access, even if a member edit overwrote it. */
function restoreCompanyOwners(store: Store): Store {
  const ownerOf = new Map(store.companies.map((c) => [c.id, c.ownerUserId]));
  let changed = false;
  const memberships = store.memberships.map((m) => {
    if (m.platformRole === "owner" || ownerOf.get(m.companyId) !== m.userId) return m;
    changed = true;
    return { ...m, platformRole: "owner" as const, newHire: undefined };
  });
  return changed ? { ...store, memberships } : store;
}

export function loadStore(): Store {
  return read();
}

export function clearStore(): Store {
  return write(emptyStore());
}

export function getSessionUser(store: Store): User | null {
  if (!store.sessionUserId) return null;
  return store.users.find((u) => u.id === store.sessionUserId) ?? null;
}

export function getActiveCompany(store: Store): Company | null {
  if (!store.activeCompanyId) return null;
  return store.companies.find((c) => c.id === store.activeCompanyId) ?? null;
}

export function membershipsForUser(store: Store, userId: string): Membership[] {
  return store.memberships.filter((m) => m.userId === userId);
}

export function activeMembership(store: Store): Membership | null {
  const user = getSessionUser(store);
  const company = getActiveCompany(store);
  if (!user || !company) return null;
  return store.memberships.find((m) => m.userId === user.id && m.companyId === company.id) ?? null;
}

export function signup(name: string, email: string, password: string): Store {
  void password;
  let store = read();
  const existing = store.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (existing) {
    store = { ...store, sessionUserId: existing.id };
    return write(store);
  }
  const user: User = {
    id: createId("usr"),
    name: name.trim() || email.split("@")[0],
    email: email.trim().toLowerCase(),
    createdAt: Date.now(),
  };
  store = {
    ...store,
    users: [...store.users, user],
    sessionUserId: user.id,
  };
  return write(store);
}

export function login(email: string, password: string): Store {
  void password;
  let store = read();
  const user = store.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) {
    return signup(email.split("@")[0], email, password);
  }
  store = { ...store, sessionUserId: user.id };
  const memberships = membershipsForUser(store, user.id);
  if (memberships.length && !memberships.some((m) => m.companyId === store.activeCompanyId)) {
    store = { ...store, activeCompanyId: memberships[0].companyId };
  }
  return write(store);
}

export function logout(): Store {
  const store = read();
  return write({ ...store, sessionUserId: null });
}

export function isOnboardingComplete(company: Company | null | undefined): boolean {
  if (!company) return false;
  // Legacy companies (created before the setup chat) have no flag — treat as done.
  if (company.onboardingComplete === undefined) return true;
  return company.onboardingComplete === true;
}

export function createCompany(name: string, summary?: string): Store {
  let store = read();
  const user = getSessionUser(store);
  if (!user) throw new Error("Not signed in");

  const company: Company = {
    id: createId("co"),
    name: name.trim(),
    summary: summary?.trim() || undefined,
    createdAt: Date.now(),
    ownerUserId: user.id,
    onboardingComplete: false,
  };
  const membership: Membership = {
    id: createId("mem"),
    userId: user.id,
    companyId: company.id,
    platformRole: "owner",
    workRoleId: null,
    createdAt: Date.now(),
  };
  store = {
    ...store,
    companies: [...store.companies, company],
    memberships: [...store.memberships, membership],
    activeCompanyId: company.id,
  };
  return write(store);
}

export function updateCompanyProfile(input: {
  name?: string;
  summary?: string;
  ownerIsExpert?: boolean;
}): Store {
  let store = read();
  const company = getActiveCompany(store);
  const membership = activeMembership(store);
  if (!company || !membership || membership.platformRole !== "owner") {
    throw new Error("Owner access required");
  }
  store = {
    ...store,
    companies: store.companies.map((c) =>
      c.id === company.id
        ? {
            ...c,
            name: input.name?.trim() || c.name,
            summary: input.summary !== undefined ? input.summary.trim() || undefined : c.summary,
            ownerIsExpert:
              input.ownerIsExpert !== undefined ? input.ownerIsExpert : c.ownerIsExpert,
          }
        : c,
    ),
  };
  return write(store);
}

export function completeCompanyOnboarding(): Store {
  let store = read();
  const company = getActiveCompany(store);
  const membership = activeMembership(store);
  if (!company || !membership || membership.platformRole !== "owner") {
    throw new Error("Owner access required");
  }
  store = {
    ...store,
    companies: store.companies.map((c) =>
      c.id === company.id ? { ...c, onboardingComplete: true } : c,
    ),
  };
  return write(store);
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findWorkRoleByTitle(
  store: Store,
  companyId: string,
  title: string,
  competence?: Competence,
): WorkRole | null {
  const roles = store.workRoles.filter(
    (r) => r.companyId === companyId && normalizeTitle(r.title) === normalizeTitle(title),
  );
  if (!roles.length) return null;
  if (competence) {
    return roles.find((r) => r.competence === competence) ?? roles[0];
  }
  // Prefer expert when assigning people by title alone.
  return (
    roles.find((r) => r.competence === "expert") ??
    roles.find((r) => r.competence === "mid") ??
    roles[0]
  );
}

export function setActiveCompany(companyId: string): Store {
  const store = read();
  return write({ ...store, activeCompanyId: companyId });
}

export function createWorkRole(input: {
  title: string;
  seniority: Seniority;
  competence: Competence;
}): Store {
  let store = read();
  const company = getActiveCompany(store);
  const membership = activeMembership(store);
  if (!company || !membership || membership.platformRole !== "owner") {
    throw new Error("Owner access required");
  }
  const role: WorkRole = {
    id: createId("wr"),
    companyId: company.id,
    title: input.title.trim(),
    seniority: input.seniority,
    competence: input.competence,
    createdAt: Date.now(),
  };
  store = { ...store, workRoles: [...store.workRoles, role] };
  return write(store);
}

export function createMemberAccount(input: {
  name: string;
  email: string;
  workRoleId: string | null;
  platformRole?: PlatformRole;
  newHire?: boolean;
}): Store {
  let store = read();
  const company = getActiveCompany(store);
  const actor = activeMembership(store);
  if (!company || !actor || actor.platformRole !== "owner") {
    throw new Error("Owner access required");
  }

  let user = store.users.find((u) => u.email.toLowerCase() === input.email.trim().toLowerCase());
  if (!user) {
    user = {
      id: createId("usr"),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      createdAt: Date.now(),
    };
    store = { ...store, users: [...store.users, user] };
  }

  const already = store.memberships.find((m) => m.userId === user!.id && m.companyId === company.id);
  if (already) {
    store = {
      ...store,
      memberships: store.memberships.map((m) =>
        m.id === already.id
          ? {
              ...m,
              workRoleId: input.workRoleId,
              platformRole:
                m.platformRole === "owner" ? "owner" : (input.platformRole ?? m.platformRole),
              newHire: input.newHire ?? m.newHire,
            }
          : m,
      ),
    };
  } else {
    const membership: Membership = {
      id: createId("mem"),
      userId: user.id,
      companyId: company.id,
      platformRole: input.platformRole ?? "member",
      workRoleId: input.workRoleId,
      newHire: input.newHire || undefined,
      createdAt: Date.now(),
    };
    store = { ...store, memberships: [...store.memberships, membership] };
  }

  store = recompileRoadmapsForCompany(store, company.id);
  return write(store);
}

export function assignWorkRole(membershipId: string, workRoleId: string | null): Store {
  let store = read();
  const actor = activeMembership(store);
  if (!actor || actor.platformRole !== "owner") throw new Error("Owner access required");

  store = {
    ...store,
    memberships: store.memberships.map((m) => (m.id === membershipId ? { ...m, workRoleId } : m)),
  };
  const membership = store.memberships.find((m) => m.id === membershipId);
  if (membership) {
    store = recompileRoadmapsForCompany(store, membership.companyId);
  }
  return write(store);
}

export function setMemberNewHire(membershipId: string, newHire: boolean): Store {
  let store = read();
  const actor = activeMembership(store);
  if (!actor || actor.platformRole !== "owner") throw new Error("Owner access required");
  store = {
    ...store,
    memberships: store.memberships.map((m) =>
      m.id === membershipId && m.platformRole !== "owner"
        ? { ...m, newHire: newHire || undefined }
        : m,
    ),
  };
  return write(store);
}

export function removeMember(membershipId: string): Store {
  let store = read();
  const actor = activeMembership(store);
  if (!actor || actor.platformRole !== "owner") throw new Error("Owner access required");
  const target = store.memberships.find((m) => m.id === membershipId);
  if (!target || target.platformRole === "owner") return store;
  store = {
    ...store,
    memberships: store.memberships.filter((m) => m.id !== membershipId),
    roadmaps: store.roadmaps.filter((r) => r.membershipId !== membershipId),
  };
  return write(store);
}

/** Owner previews the app as one of their people (local demo — no passwords). */
export function signInAsMember(membershipId: string): Store {
  let store = read();
  const actor = activeMembership(store);
  if (!actor || actor.platformRole !== "owner") throw new Error("Owner access required");
  const target = store.memberships.find((m) => m.id === membershipId);
  if (!target) throw new Error("Member not found");
  store = { ...store, sessionUserId: target.userId, activeCompanyId: target.companyId };
  return write(store);
}

export function canCaptureAs(membership: Membership | null, workRole: WorkRole | null): boolean {
  if (!membership || membership.newHire || !workRole) return false;
  return workRole.competence === "expert" || workRole.competence === "mid" || workRole.seniority >= 3;
}

function recompileRoadmapsForCompany(store: Store, companyId: string): Store {
  const roles = store.workRoles.filter((r) => r.companyId === companyId);
  const lessons = store.lessons.filter((l) => l.companyId === companyId);
  const memberships = store.memberships.filter((m) => m.companyId === companyId && m.workRoleId);

  let roadmaps = store.roadmaps.filter((r) => r.companyId !== companyId);
  for (const membership of memberships) {
    const workRole = roles.find((r) => r.id === membership.workRoleId);
    if (!workRole) continue;
    const previous = store.roadmaps.find((r) => r.membershipId === membership.id) ?? null;
    const next = compileRoadmapForMember({
      membership,
      memberWorkRole: workRole,
      companyRoles: roles,
      lessons,
      previous,
    });
    roadmaps = [...roadmaps, next];
  }
  return { ...store, roadmaps };
}

export function startCapture(): Store {
  let store = read();
  const company = getActiveCompany(store);
  const membership = activeMembership(store);
  if (!company || !membership?.workRoleId) {
    throw new Error("Active company and work role required");
  }
  if (membership.newHire) {
    throw new Error("New hires learn lessons — recording is for experienced teammates");
  }

  const session: CaptureSession = {
    id: createId("cap"),
    companyId: company.id,
    memberId: membership.id,
    workRoleId: membership.workRoleId,
    startedAt: Date.now(),
    endedAt: null,
    events: [],
    teachBacks: [],
    guardrails: [],
    mapSteps: [],
  };
  store = { ...store, captures: [...store.captures, session] };
  return write(store);
}

export function addTeachBackToCapture(captureId: string, teachBack: Omit<TeachBack, "id">): Store {
  let store = read();
  store = {
    ...store,
    captures: store.captures.map((c) => {
      if (c.id !== captureId) return c;
      const answer = teachBack.answer.trim();
      const teachBacks = [
        ...c.teachBacks,
        {
          id: createId("tb"),
          ...teachBack,
          answer,
          ruleLabel: teachBack.ruleLabel?.trim() || ruleLabelFromAnswer(answer),
        },
      ];
      const compiled = compileWorkMapFromTeachBacks({ ...c, teachBacks });
      return { ...c, teachBacks, ...compiled };
    }),
  };
  return write(store);
}

export function updateTeachBackInCapture(
  captureId: string,
  teachBackId: string,
  patch: Partial<Pick<TeachBack, "answer" | "ruleLabel" | "confirmed">>,
): Store {
  let store = read();
  store = {
    ...store,
    captures: store.captures.map((c) => {
      if (c.id !== captureId) return c;
      const teachBacks = c.teachBacks.map((tb) => {
        if (tb.id !== teachBackId) return tb;
        const answer = (patch.answer ?? tb.answer).trim();
        return {
          ...tb,
          ...patch,
          answer,
          ruleLabel:
            patch.ruleLabel?.trim() ||
            (patch.answer !== undefined ? ruleLabelFromAnswer(answer) : tb.ruleLabel),
        };
      });
      const compiled = compileWorkMapFromTeachBacks({ ...c, teachBacks });
      return { ...c, teachBacks, ...compiled };
    }),
  };
  return write(store);
}

export function removeTeachBackFromCapture(captureId: string, teachBackId: string): Store {
  let store = read();
  store = {
    ...store,
    captures: store.captures.map((c) => {
      if (c.id !== captureId) return c;
      const teachBacks = c.teachBacks.filter((tb) => tb.id !== teachBackId);
      const compiled = compileWorkMapFromTeachBacks({ ...c, teachBacks });
      return { ...c, teachBacks, ...compiled };
    }),
  };
  return write(store);
}

/** Drop an unfinished capture without publishing lessons. */
export function discardCapture(captureId: string): Store {
  let store = read();
  store = {
    ...store,
    captures: store.captures.filter((c) => !(c.id === captureId && c.endedAt === null)),
  };
  return write(store);
}

export function appendCaptureEvents(
  captureId: string,
  events: { kind: string; label: string; detail?: string; t?: number }[],
): Store {
  let store = read();
  const now = Date.now();
  store = {
    ...store,
    captures: store.captures.map((c) => {
      if (c.id !== captureId) return c;
      const nextEvents = [
        ...c.events,
        ...events.map((event) => ({
          id: createId("ev"),
          t: event.t ?? now,
          kind: event.kind,
          label: event.label,
          detail: event.detail,
        })),
      ];
      return { ...c, events: nextEvents };
    }),
  };
  return write(store);
}

/** Turn spoken / noted lines into confirmed teach-backs so finalize can compile lessons. */
export function ingestTranscriptAsTeachBacks(captureId: string, lines: string[]): Store {
  let store = read();
  const cleaned = normalizeTranscriptLines(lines);
  if (!cleaned.length) return store;

  store = {
    ...store,
    captures: store.captures.map((c) => {
      if (c.id !== captureId) return c;
      const existing = new Set(c.teachBacks.map((tb) => tb.answer.trim().toLowerCase()));
      const teachBacks = [...c.teachBacks];
      for (const line of cleaned) {
        const key = line.toLowerCase();
        if (existing.has(key)) continue;
        if ([...existing].some((prev) => prev.includes(key.slice(0, 24)) || key.includes(prev.slice(0, 24)))) {
          continue;
        }
        existing.add(key);
        teachBacks.push({
          id: createId("tb"),
          prompt: "What rule should a new hire learn from this moment?",
          answer: line,
          confirmed: true,
          ruleLabel: ruleLabelFromAnswer(line),
        });
      }
      const compiled = compileWorkMapFromTeachBacks({ ...c, teachBacks });
      return { ...c, teachBacks, ...compiled };
    }),
  };
  return write(store);
}

export function finalizeCapture(captureId: string): Store {
  let store = read();
  const capture = store.captures.find((c) => c.id === captureId);
  if (!capture) throw new Error("Capture not found");

  const compiled = compileWorkMapFromTeachBacks(capture);
  const closed: CaptureSession = {
    ...capture,
    ...compiled,
    endedAt: Date.now(),
  };
  const newLessons = compileLessonsFromCapture(closed);
  store = {
    ...store,
    captures: store.captures.map((c) => (c.id === captureId ? closed : c)),
    lessons: mergeLessonPool(store.lessons, newLessons),
  };
  store = recompileRoadmapsForCompany(store, closed.companyId);
  return write(store);
}

export function getRoadmapForMembership(store: Store, membershipId: string): Roadmap | null {
  return store.roadmaps.find((r) => r.membershipId === membershipId) ?? null;
}

export function markLessonProgress(
  membershipId: string,
  lessonId: string,
  status: "in_progress" | "done",
): Store {
  let store = read();
  const roadmap = store.roadmaps.find((r) => r.membershipId === membershipId);
  if (!roadmap) throw new Error("Roadmap not found");
  const next = advanceRoadmapItem(roadmap, lessonId, status);
  store = {
    ...store,
    roadmaps: store.roadmaps.map((r) => (r.id === roadmap.id ? next : r)),
  };
  return write(store);
}

/** Seed a sandbox company for the landing page walkthrough (does not sign you in). */
export function buildSandboxWalkthrough(): {
  company: Company;
  roles: WorkRole[];
  lessons: Lesson[];
  roadmap: Roadmap;
} {
  const company: Company = {
    id: "sandbox_co",
    name: "Acme Ops",
    createdAt: 1,
    ownerUserId: "sandbox_owner",
  };
  const expertRole: WorkRole = {
    id: "sandbox_wr_exp",
    companyId: company.id,
    title: "Customer success",
    seniority: 4,
    competence: "expert",
    createdAt: 1,
  };
  const hireRole: WorkRole = {
    id: "sandbox_wr_hire",
    companyId: company.id,
    title: "Customer success",
    seniority: 1,
    competence: "junior",
    createdAt: 2,
  };
  const capture: CaptureSession = {
    id: "sandbox_cap",
    companyId: company.id,
    memberId: "sandbox_mem_exp",
    workRoleId: expertRole.id,
    startedAt: 10,
    endedAt: 20,
    events: [],
    teachBacks: [
      {
        id: "tb1",
        prompt: "When do you escalate a churn-risk account?",
        answer: "Escalate if the account mentions cancellation twice in one week or asks for a competitor comparison.",
        confirmed: true,
        ruleLabel: "Churn escalation",
      },
      {
        id: "tb2",
        prompt: "What do you send after a failed onboarding call?",
        answer: "Same-day recap with three next steps and a booking link; never wait for the customer to follow up.",
        confirmed: true,
        ruleLabel: "Failed-call follow-up",
      },
    ],
    guardrails: [],
    mapSteps: [],
  };
  const mapped = compileWorkMapFromTeachBacks(capture);
  const closed = { ...capture, ...mapped };
  const lessons = compileLessonsFromCapture(closed, 30);
  const membership: Membership = {
    id: "sandbox_mem_hire",
    userId: "sandbox_hire",
    companyId: company.id,
    platformRole: "member",
    workRoleId: hireRole.id,
    createdAt: 40,
  };
  const roadmap = compileRoadmapForMember({
    membership,
    memberWorkRole: hireRole,
    companyRoles: [expertRole, hireRole],
    lessons,
    now: 50,
  });
  return { company, roles: [expertRole, hireRole], lessons, roadmap };
}
