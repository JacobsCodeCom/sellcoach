"use client";

import {
  advanceRoadmapItem,
  compileCaptureTasks,
  compileLessonFromWorkMap,
  compileLessonsFromCapture,
  compileRoadmapForMember,
  compileWorkMapFromTeachBacks,
  createId,
  mergeLessonPool,
  referencedMomentIds,
  suggestRoleFromNotion,
  type AbilityRun,
  type AbilityTrigger,
  type ActionIntent,
  type Agent,
  type AgentAbility,
  type AgentStatus,
  type CaptureSession,
  type CaptureTask,
  type CaptureTaskStatus,
  type Company,
  type Competence,
  type ExternalPerson,
  type ExternalPersonAdminStatus,
  type IntegrationConnection,
  type Invite,
  type KnowledgeTopic,
  type LearningSession,
  type LearningSessionOutcome,
  type Lesson,
  type LiveQuestion,
  type Membership,
  type PlatformRole,
  type Roadmap,
  type ScreenMoment,
  type Seniority,
  type TranscriptLine,
  type User,
  type WorkMap,
  type WorkRole,
} from "@mira/core";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { getFirebaseEmail } from "@/lib/firebase/auth";
import { deleteSharedDoc, syncSharedToCloud } from "@/lib/firebase/sync";
import { MIRA_PRODUCTION_ORIGIN } from "@/lib/site";

const STORAGE_KEY = "mira-web-v1";

/**
 * Chrome Web Store URL when NEXT_PUBLIC_CHROME_EXTENSION_URL is set.
 * Until then, the production install guide.
 */
export const CHROME_EXTENSION_INSTALL_URL =
  process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL?.trim() ||
  `${MIRA_PRODUCTION_ORIGIN}/extension`;

/** Mid-lesson progress so Continue can restore the live step after a break or exit. */
export type LessonCheckpoint = {
  membershipId: string;
  lessonId: string;
  stepIndex: number;
  guidedThisStep: boolean;
  updatedAt: number;
};

export type Store = {
  users: User[];
  companies: Company[];
  memberships: Membership[];
  workRoles: WorkRole[];
  captures: CaptureSession[];
  lessons: Lesson[];
  roadmaps: Roadmap[];
  agents: Agent[];
  abilities: AgentAbility[];
  abilityRuns: AbilityRun[];
  integrationConnections: IntegrationConnection[];
  externalPeople: ExternalPerson[];
  knowledgeTopics: KnowledgeTopic[];
  captureTasks: CaptureTask[];
  invites: Invite[];
  learningSessions: LearningSession[];
  lessonCheckpoints: LessonCheckpoint[];
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
    agents: [],
    abilities: [],
    abilityRuns: [],
    integrationConnections: [],
    externalPeople: [],
    knowledgeTopics: [],
    captureTasks: [],
    invites: [],
    learningSessions: [],
    lessonCheckpoints: [],
    sessionUserId: null,
    activeCompanyId: null,
  };
}

function read(): Store {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<Store>;
    return normalizeStore(parsed);
  } catch {
    return emptyStore();
  }
}

function requireOwner(): { store: Store; company: Company } {
  const store = read();
  const company = getActiveCompany(store);
  const membership = activeMembership(store);
  if (!company || !membership || membership.platformRole !== "owner") {
    throw new Error("Owner access required");
  }
  return { store, company };
}

function normalizeStore(store: Partial<Store> | Store): Store {
  return restoreCompanyOwners({
    ...emptyStore(),
    ...store,
    agents: store.agents ?? [],
    abilities: store.abilities ?? [],
    abilityRuns: store.abilityRuns ?? [],
    integrationConnections: store.integrationConnections ?? [],
    externalPeople: store.externalPeople ?? [],
    knowledgeTopics: store.knowledgeTopics ?? [],
    captureTasks: store.captureTasks ?? [],
    invites: store.invites ?? [],
    learningSessions: store.learningSessions ?? [],
    lessonCheckpoints: store.lessonCheckpoints ?? [],
  });
}

function createInviteToken(): string {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** 1×1 JPEG — used when dropping heavy stills to free quota. */
const PLACEHOLDER_MOMENT =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

function momentIdsUsedByCapture(capture: CaptureSession): Set<string> {
  const used = new Set<string>();
  const map = capture.workMap;
  if (!map) return used;
  for (const step of map.steps) if (step.momentId) used.add(step.momentId);
  for (const g of map.guardrails) if (g.momentId) used.add(g.momentId);
  return used;
}

/** Drop interrupted drafts and unused JPEG stills so localStorage fits. */
export function compactStore(store: Store): Store {
  const captures = [...store.captures]
    .filter((c) => c.endedAt || c.publishedAt || c.workMap)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((c, index) => {
      const keep = momentIdsUsedByCapture(c);
      let moments = c.moments ?? [];
      if (c.publishedAt || c.workMap?.confirmed) {
        moments = moments.filter((m) => keep.size === 0 || keep.has(m.id));
      } else {
        moments = moments.slice(0, 6);
      }
      if (index >= 12) {
        moments = moments.map((m) => ({ ...m, image: PLACEHOLDER_MOMENT }));
      } else {
        moments = moments.map((m) =>
          m.image.length > 80_000 ? { ...m, image: PLACEHOLDER_MOMENT } : m,
        );
      }
      return { ...c, moments };
    });

  return normalizeStore({ ...store, captures });
}

function write(store: Store): Store {
  let next = normalizeStore(store);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "QuotaExceededError")) throw err;
      next = compactStore(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Last resort: drop all moment images.
        next = {
          ...next,
          captures: next.captures.map((c) => ({
            ...c,
            moments: (c.moments ?? []).map((m) => ({ ...m, image: PLACEHOLDER_MOMENT })),
          })),
        };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          throw new Error("Browser storage is full. Discard old sessions and try again.");
        }
      }
    }
  }
  return next;
}

/** Persist an already-merged store (e.g. after Firestore hydrate). */
export function persistStore(store: Store): Store {
  return write(store);
}

function queueSharedSync(store: Store): void {
  if (!isFirebaseConfigured()) return;
  void syncSharedToCloud(store).catch((err) => {
    console.error("Firestore sync failed", err);
  });
}

/**
 * Bind the Firebase Auth user to the local session.
 * Remaps stub users (invite pre-provision) onto the Firebase uid when emails match.
 */
export function bindAuthUser(input: {
  uid: string;
  email: string;
  name: string;
}): Store {
  let store = read();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email.split("@")[0] || "User";
  const byUid = store.users.find((u) => u.id === input.uid) ?? null;
  const byEmail =
    store.users.find((u) => u.email.toLowerCase() === email && u.id !== input.uid) ?? null;
  const now = Date.now();

  if (byUid) {
    store = {
      ...store,
      users: store.users.map((u) =>
        u.id === input.uid
          ? { ...u, email, name: name || u.name, lastLoginAt: now }
          : u,
      ),
      sessionUserId: input.uid,
    };
  } else if (byEmail) {
    const oldId = byEmail.id;
    const user: User = {
      ...byEmail,
      id: input.uid,
      email,
      name: name || byEmail.name,
      lastLoginAt: now,
    };
    store = {
      ...store,
      users: [...store.users.filter((u) => u.id !== oldId), user],
      memberships: store.memberships.map((m) =>
        m.userId === oldId ? { ...m, userId: input.uid } : m,
      ),
      companies: store.companies.map((c) =>
        c.ownerUserId === oldId ? { ...c, ownerUserId: input.uid } : c,
      ),
      sessionUserId: input.uid,
    };
  } else {
    const user: User = {
      id: input.uid,
      email,
      name,
      createdAt: now,
      lastLoginAt: now,
    };
    store = {
      ...store,
      users: [...store.users, user],
      sessionUserId: input.uid,
    };
  }

  store = write(store);
  queueSharedSync(store);
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
  const now = Date.now();
  const existing = store.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (existing) {
    store = {
      ...store,
      users: store.users.map((u) =>
        u.id === existing.id ? { ...u, lastLoginAt: now } : u,
      ),
      sessionUserId: existing.id,
    };
    return write(store);
  }
  const user: User = {
    id: createId("usr"),
    name: name.trim() || email.split("@")[0],
    email: email.trim().toLowerCase(),
    createdAt: now,
    lastLoginAt: now,
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
  const now = Date.now();
  store = {
    ...store,
    users: store.users.map((u) => (u.id === user.id ? { ...u, lastLoginAt: now } : u)),
    sessionUserId: user.id,
  };
  const memberships = membershipsForUser(store, user.id);
  if (memberships.length && !memberships.some((m) => m.companyId === store.activeCompanyId)) {
    store = { ...store, activeCompanyId: memberships[0].companyId };
  }
  return write(store);
}

function touchMembershipActive(store: Store, membershipId: string, at = Date.now()): Store {
  return {
    ...store,
    memberships: store.memberships.map((m) =>
      m.id === membershipId ? { ...m, lastActiveAt: at } : m,
    ),
  };
}

/** Bump last-active for the signed-in membership (Learn / Workspace). */
export function touchMemberActivity(membershipId?: string | null): Store {
  let store = read();
  const membership = membershipId
    ? store.memberships.find((m) => m.id === membershipId)
    : activeMembership(store);
  if (!membership) return store;
  return write(touchMembershipActive(store, membership.id));
}

/** Open a learning session when a learner starts a lesson. */
export function startLearningSession(membershipId: string, lessonId: string): Store {
  let store = read();
  const membership = store.memberships.find((m) => m.id === membershipId);
  if (!membership) throw new Error("Membership not found");
  const now = Date.now();
  const session: LearningSession = {
    id: createId("lsn"),
    companyId: membership.companyId,
    membershipId,
    lessonId,
    startedAt: now,
    outcome: "started",
  };
  store = touchMembershipActive(
    {
      ...store,
      learningSessions: [...(store.learningSessions ?? []), session],
    },
    membershipId,
    now,
  );
  return write(store);
}

/** Close the open learning session for a membership+lesson (complete or exit). */
export function endLearningSession(
  membershipId: string,
  lessonId: string,
  outcome: Exclude<LearningSessionOutcome, "started">,
): Store {
  let store = read();
  const now = Date.now();
  const sessions = store.learningSessions ?? [];
  const open = [...sessions]
    .reverse()
    .find(
      (s) =>
        s.membershipId === membershipId &&
        s.lessonId === lessonId &&
        s.outcome === "started" &&
        !s.endedAt,
    );
  if (!open) {
    // No open session — still record a terminal event so analytics stay honest.
    const membership = store.memberships.find((m) => m.id === membershipId);
    if (!membership) return store;
    const session: LearningSession = {
      id: createId("lsn"),
      companyId: membership.companyId,
      membershipId,
      lessonId,
      startedAt: now,
      endedAt: now,
      outcome,
    };
    store = touchMembershipActive(
      { ...store, learningSessions: [...sessions, session] },
      membershipId,
      now,
    );
    return write(store);
  }
  store = touchMembershipActive(
    {
      ...store,
      learningSessions: sessions.map((s) =>
        s.id === open.id ? { ...s, endedAt: now, outcome } : s,
      ),
    },
    membershipId,
    now,
  );
  return write(store);
}

/** Clear the signed-in user without re-serializing the full store (captures/images). */
export function clearSessionUserId(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const patched = raw.replace(
      /"sessionUserId"\s*:\s*(null|"[^"]*")/,
      '"sessionUserId":null',
    );
    if (patched !== raw) {
      localStorage.setItem(STORAGE_KEY, patched);
      return;
    }
  } catch {
    /* fall through */
  }
  write({ ...read(), sessionUserId: null });
}

export function logout(): Store {
  clearSessionUserId();
  return { ...read(), sessionUserId: null };
}

export function isOnboardingComplete(company: Company | null | undefined): boolean {
  if (!company) return false;
  // Legacy companies (created before the setup chat) have no flag — treat as done.
  if (company.onboardingComplete === undefined) return true;
  return company.onboardingComplete === true;
}

/**
 * Post-auth home for the active membership.
 * Owners → admin; new hires → learn; everyone else → workspace (record + maps).
 * Web app paths are first-class while the Chrome extension awaits store approval.
 */
export function homePathForSession(opts: {
  user: User | null;
  company: Company | null;
  membership: Membership | null;
}): string {
  const { user, company, membership } = opts;
  if (!user) return "/login";
  if (!company || !isOnboardingComplete(company)) return "/onboarding";
  if (membership?.platformRole === "owner") return "/admin";
  if (membership?.newHire) return "/learn";
  return "/app";
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
  store = write(store);
  queueSharedSync(store);
  return store;
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
  store = write(store);
  queueSharedSync(store);
  return store;
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
  store = write(store);
  queueSharedSync(store);
  return store;
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
  let store = read();
  const user = getSessionUser(store);
  if (!user) throw new Error("Not signed in");
  const allowed = membershipsForUser(store, user.id).some((m) => m.companyId === companyId);
  if (!allowed) throw new Error("You are not a member of that company");
  return write({ ...store, activeCompanyId: companyId });
}

export function createWorkRole(input: {
  title: string;
  seniority: Seniority;
  competence: Competence;
  externalId?: string;
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
    externalId: input.externalId,
    createdAt: Date.now(),
  };
  store = { ...store, workRoles: [...store.workRoles, role] };
  store = write(store);
  queueSharedSync(store);
  return store;
}

export function updateWorkRole(
  roleId: string,
  input: {
    title: string;
    seniority: Seniority;
    competence: Competence;
  },
): Store {
  let store = read();
  const company = getActiveCompany(store);
  const membership = activeMembership(store);
  if (!company || !membership || membership.platformRole !== "owner") {
    throw new Error("Owner access required");
  }
  const existing = store.workRoles.find((r) => r.id === roleId && r.companyId === company.id);
  if (!existing) throw new Error("Role not found");
  const title = input.title.trim();
  if (!title) throw new Error("Job title is required");
  store = {
    ...store,
    workRoles: store.workRoles.map((r) =>
      r.id === roleId
        ? {
            ...r,
            title,
            seniority: input.seniority,
            competence: input.competence,
          }
        : r,
    ),
  };
  store = recompileRoadmapsForCompany(store, company.id);
  store = write(store);
  queueSharedSync(store);
  return store;
}

export function deleteWorkRole(roleId: string): Store {
  let store = read();
  const company = getActiveCompany(store);
  const membership = activeMembership(store);
  if (!company || !membership || membership.platformRole !== "owner") {
    throw new Error("Owner access required");
  }
  const existing = store.workRoles.find((r) => r.id === roleId && r.companyId === company.id);
  if (!existing) throw new Error("Role not found");

  store = {
    ...store,
    workRoles: store.workRoles.filter((r) => r.id !== roleId),
    memberships: store.memberships.map((m) =>
      m.companyId === company.id && m.workRoleId === roleId
        ? { ...m, workRoleId: null, needsRole: true }
        : m,
    ),
    invites: store.invites.map((i) =>
      i.companyId === company.id && i.workRoleId === roleId ? { ...i, workRoleId: null } : i,
    ),
    agents: store.agents.map((a) =>
      a.companyId === company.id && a.workRoleId === roleId ? { ...a, workRoleId: null } : a,
    ),
    externalPeople: store.externalPeople.map((p) =>
      p.companyId === company.id && p.workRoleId === roleId ? { ...p, workRoleId: null } : p,
    ),
  };
  store = recompileRoadmapsForCompany(store, company.id);
  store = write(store);
  queueSharedSync(store);
  if (isFirebaseConfigured()) {
    void deleteSharedDoc("workRoles", roleId).catch((err) => {
      console.error("Firestore role delete failed", err);
    });
  }
  return store;
}

function ensureWorkRole(
  store: Store,
  companyId: string,
  input: { title: string; seniority: Seniority; competence: Competence; externalId?: string },
): { store: Store; role: WorkRole } {
  const externalId = input.externalId || `${normalizeTitle(input.title)}:${input.competence}`;
  const existing =
    store.workRoles.find((r) => r.companyId === companyId && r.externalId === externalId) ??
    findWorkRoleByTitle(store, companyId, input.title, input.competence);
  if (existing) return { store, role: existing };
  const role: WorkRole = {
    id: createId("wr"),
    companyId,
    title: input.title.trim(),
    seniority: input.seniority,
    competence: input.competence,
    externalId,
    createdAt: Date.now(),
  };
  return { store: { ...store, workRoles: [...store.workRoles, role] }, role };
}

export function createMemberAccount(input: {
  name: string;
  email: string;
  workRoleId: string | null;
  platformRole?: PlatformRole;
  newHire?: boolean;
}): Store {
  return createMemberInvite(input).store;
}

/** Create (or refresh) a member + shareable invite for the active company. */
export function createMemberInvite(input: {
  name: string;
  email: string;
  workRoleId: string | null;
  platformRole?: PlatformRole;
  newHire?: boolean;
}): { store: Store; invite: Invite } {
  let store = read();
  const company = getActiveCompany(store);
  const actor = activeMembership(store);
  if (!company || !actor || actor.platformRole !== "owner") {
    throw new Error("Owner access required");
  }

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !name) throw new Error("Name and email are required");

  let user = store.users.find((u) => u.email.toLowerCase() === email);
  if (!user) {
    user = {
      id: createId("usr"),
      name,
      email,
      createdAt: Date.now(),
    };
    store = { ...store, users: [...store.users, user] };
  } else if (name && user.name !== name) {
    store = {
      ...store,
      users: store.users.map((u) => (u.id === user!.id ? { ...u, name } : u)),
    };
    user = store.users.find((u) => u.id === user!.id)!;
  }

  let membership = store.memberships.find((m) => m.userId === user!.id && m.companyId === company.id);
  if (membership) {
    store = {
      ...store,
      memberships: store.memberships.map((m) =>
        m.id === membership!.id
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
    membership = store.memberships.find((m) => m.id === membership!.id)!;
  } else {
    membership = {
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

  // Revoke prior pending invites for this email+company, then issue a fresh token.
  store = {
    ...store,
    invites: store.invites.map((inv) =>
      inv.companyId === company.id &&
      inv.email === email &&
      !inv.acceptedAt &&
      !inv.revokedAt
        ? { ...inv, revokedAt: Date.now() }
        : inv,
    ),
  };

  const invite: Invite = {
    id: createId("inv"),
    token: createInviteToken(),
    companyId: company.id,
    companyName: company.name,
    email,
    name,
    workRoleId: membership.workRoleId,
    platformRole: membership.platformRole === "owner" ? "member" : membership.platformRole,
    newHire: membership.newHire,
    membershipId: membership.id,
    createdAt: Date.now(),
  };
  store = { ...store, invites: [...store.invites, invite] };
  store = recompileRoadmapsForCompany(store, company.id);
  store = write(store);
  queueSharedSync(store);
  return { store, invite };
}

export function getInviteByToken(store: Store, token: string): Invite | null {
  const invite = store.invites.find((i) => i.token === token) ?? null;
  if (!invite || invite.revokedAt) return null;
  return invite;
}

export function invitePath(token: string): string {
  return `/invite/${token}`;
}

export function inviteAbsoluteUrl(token: string): string {
  if (typeof window === "undefined") return invitePath(token);
  return `${window.location.origin}${invitePath(token)}`;
}

export function pendingInvitesForCompany(store: Store, companyId: string): Invite[] {
  return store.invites
    .filter((i) => i.companyId === companyId && !i.acceptedAt && !i.revokedAt)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function latestInviteForMembership(store: Store, membershipId: string): Invite | null {
  return (
    store.invites
      .filter((i) => i.membershipId === membershipId && !i.revokedAt)
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}

export function revokeInvite(inviteId: string): Store {
  let store = read();
  const actor = activeMembership(store);
  if (!actor || actor.platformRole !== "owner") throw new Error("Owner access required");
  const invite = store.invites.find((i) => i.id === inviteId);
  if (!invite || invite.companyId !== actor.companyId) throw new Error("Invite not found");
  if (invite.acceptedAt) throw new Error("Invite already accepted");
  store = {
    ...store,
    invites: store.invites.map((i) =>
      i.id === inviteId ? { ...i, revokedAt: Date.now() } : i,
    ),
  };
  store = write(store);
  queueSharedSync(store);
  return store;
}

/**
 * Bind the signed-in user (or the invite email account) to the company.
 * Company is always from the invite — never inferred from email domain.
 */
export function acceptInvite(token: string): Store {
  let store = read();
  const invite = getInviteByToken(store, token);
  if (!invite) throw new Error("Invite is invalid or revoked");

  if (isFirebaseConfigured()) {
    const firebaseEmail = getFirebaseEmail();
    if (!firebaseEmail) {
      throw new Error("Sign in required to accept this invite");
    }
    if (firebaseEmail !== invite.email.toLowerCase()) {
      throw new Error(
        `This invite is for ${invite.email}. Sign in with that email to accept.`,
      );
    }
  }

  if (invite.acceptedAt) {
    // Idempotent re-accept: just switch into that company if the user matches.
    const user = getSessionUser(store);
    if (!user || user.email.toLowerCase() !== invite.email) {
      throw new Error(`Sign in as ${invite.email} to open this invite`);
    }
    store = { ...store, sessionUserId: user.id, activeCompanyId: invite.companyId };
    store = write(store);
    queueSharedSync(store);
    return store;
  }

  let user = getSessionUser(store);
  if (user && user.email.toLowerCase() !== invite.email) {
    throw new Error(`This invite is for ${invite.email}. Sign in with that email to accept.`);
  }

  if (!user) {
    user = store.users.find((u) => u.email.toLowerCase() === invite.email) ?? null;
    if (!user) {
      user = {
        id: createId("usr"),
        name: invite.name,
        email: invite.email,
        createdAt: Date.now(),
      };
      store = { ...store, users: [...store.users, user] };
    }
  }

  let membership =
    (invite.membershipId
      ? store.memberships.find((m) => m.id === invite.membershipId)
      : null) ??
    store.memberships.find((m) => m.userId === user!.id && m.companyId === invite.companyId) ??
    null;

  if (!membership) {
    membership = {
      id: createId("mem"),
      userId: user.id,
      companyId: invite.companyId,
      platformRole: invite.platformRole,
      workRoleId: invite.workRoleId,
      newHire: invite.newHire,
      createdAt: Date.now(),
    };
    store = { ...store, memberships: [...store.memberships, membership] };
  } else if (membership.userId !== user.id) {
    // Invite was pre-created against a stub user — re-point membership to the accepting user.
    store = {
      ...store,
      memberships: store.memberships.map((m) =>
        m.id === membership!.id ? { ...m, userId: user!.id } : m,
      ),
    };
    membership = store.memberships.find((m) => m.id === membership!.id)!;
  }

  const now = Date.now();
  store = {
    ...store,
    sessionUserId: user.id,
    activeCompanyId: invite.companyId,
    invites: store.invites.map((i) =>
      i.id === invite.id
        ? { ...i, acceptedAt: now, membershipId: membership!.id }
        : i,
    ),
  };
  store = recompileRoadmapsForCompany(store, invite.companyId);
  store = write(store);
  queueSharedSync(store);
  return store;
}

export function extensionInstallBlurb(
  companyName: string,
  inviteUrl: string,
  opts?: { newHire?: boolean },
): string {
  const third = opts?.newHire
    ? "3. After you join, open Learn in Mira for your guided plan"
    : "3. After you join, open Workspace to record and publish Work Maps";
  return [
    `Join ${companyName} on Mira`,
    ``,
    `1. Open your invite and sign in with this email: ${inviteUrl}`,
    `2. Use Mira in the browser (Chrome extension optional while it’s awaiting store approval)`,
    third,
    ``,
    `Your work in Mira goes to ${companyName} via this invite — not your email domain.`,
  ].join("\n");
}

export function userHasCompanyMembership(store: Store, userId: string | null | undefined): boolean {
  if (!userId) return false;
  return membershipsForUser(store, userId).length > 0;
}

export function assignWorkRole(membershipId: string, workRoleId: string | null): Store {
  let store = read();
  const actor = activeMembership(store);
  if (!actor || actor.platformRole !== "owner") throw new Error("Owner access required");

  store = {
    ...store,
    memberships: store.memberships.map((m) =>
      m.id === membershipId
        ? {
            ...m,
            workRoleId,
            // Persist false so Firestore merge clears a prior true (undefined is stripped).
            needsRole: workRoleId ? false : m.needsRole,
          }
        : m,
    ),
  };
  const membership = store.memberships.find((m) => m.id === membershipId);
  if (membership) {
    store = recompileRoadmapsForCompany(store, membership.companyId);
  }
  store = write(store);
  queueSharedSync(store);
  return store;
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
  store = write(store);
  queueSharedSync(store);
  return store;
}

export function removeMember(membershipId: string): Store {
  let store = read();
  const actor = activeMembership(store);
  if (!actor || actor.platformRole !== "owner") throw new Error("Owner access required");
  const target = store.memberships.find((m) => m.id === membershipId);
  if (!target || target.platformRole === "owner") return store;
  const now = Date.now();
  store = {
    ...store,
    memberships: store.memberships.filter((m) => m.id !== membershipId),
    roadmaps: store.roadmaps.filter((r) => r.membershipId !== membershipId),
    invites: store.invites.map((i) =>
      i.membershipId === membershipId && !i.acceptedAt && !i.revokedAt
        ? { ...i, revokedAt: now }
        : i,
    ),
  };
  store = write(store);
  queueSharedSync(store);
  return store;
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

/** Remove unfinished captures for a member (interrupted Start attempts). */
export function discardInterruptedForMember(membershipId: string): Store {
  let store = read();
  const doomed = new Set(
    store.captures.filter((c) => c.memberId === membershipId && !c.endedAt).map((c) => c.id),
  );
  if (!doomed.size) return store;
  const now = Date.now();
  store = {
    ...store,
    captures: store.captures.filter((c) => !doomed.has(c.id)),
    captureTasks: store.captureTasks.map((t) =>
      t.captureId && doomed.has(t.captureId)
        ? { ...t, status: "todo" as const, captureId: null, updatedAt: now }
        : t,
    ),
  };
  return write(store);
}

export function startCapture(input?: { taskId?: string }): Store {
  let store = read();
  const user = getSessionUser(store);
  if (!user) throw new Error("Sign in to record");
  if (!userHasCompanyMembership(store, user.id)) {
    throw new Error("Accept your company invite before recording");
  }
  const company = getActiveCompany(store);
  const membership = activeMembership(store);
  if (!company || !membership) {
    throw new Error("Select the company you were invited to before recording");
  }
  if (!membership.workRoleId) {
    throw new Error("Active company and work role required");
  }
  if (membership.newHire) {
    throw new Error("New hires learn lessons — recording is for experienced teammates");
  }

  // Clear leftover interrupted sessions so Start never requires Discard first.
  store = discardInterruptedForMember(membership.id);

  const task = input?.taskId
    ? store.captureTasks.find(
        (t) =>
          t.id === input.taskId &&
          t.companyId === company.id &&
          t.assigneeMembershipId === membership.id,
      )
    : null;
  if (input?.taskId && !task) throw new Error("Capture task not found");

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
    transcript: [],
    questions: [],
    moments: [],
    workMap: null,
    taskId: task?.id ?? null,
    taskBrief: task?.brief ?? null,
  };
  const now = Date.now();
  store = touchMembershipActive(
    { ...store, captures: [...store.captures, session] },
    membership.id,
    now,
  );
  if (task) {
    store = {
      ...store,
      captureTasks: store.captureTasks.map((t) =>
        t.id === task.id
          ? { ...t, status: "in_progress" as const, captureId: session.id, updatedAt: now }
          : t,
      ),
    };
  }
  return write(store);
}

function patchCapture(captureId: string, patch: (c: CaptureSession) => CaptureSession): Store {
  const store = read();
  if (!store.captures.some((c) => c.id === captureId)) throw new Error("Capture not found");
  return write({
    ...store,
    captures: store.captures.map((c) => (c.id === captureId ? patch(c) : c)),
  });
}

/** Store what the apprentice saw and heard once recording stops. */
export function saveRecording(
  captureId: string,
  input: { transcript: TranscriptLine[]; questions: LiveQuestion[]; moments: ScreenMoment[] },
): Store {
  return patchCapture(captureId, (c) => ({
    ...c,
    ...input,
    endedAt: Date.now(),
  }));
}

export function setCaptureWorkMap(captureId: string, workMap: WorkMap, debrief?: TranscriptLine[]): Store {
  return patchCapture(captureId, (c) => ({
    ...c,
    workMap,
    debrief: debrief ?? c.debrief,
  }));
}

/** Publish a confirmed Work Map as one lesson for everyone it matches; keeps only the screen moments it uses. */
export function publishCapture(captureId: string): Store {
  let store = read();
  const capture = store.captures.find((c) => c.id === captureId);
  if (!capture?.workMap?.steps.length) throw new Error("Confirm the Work Map before publishing");
  const used = referencedMomentIds(capture.workMap);
  const published: CaptureSession = {
    ...capture,
    workMap: { ...capture.workMap, confirmed: true },
    moments: (capture.moments ?? []).filter((m) => used.has(m.id)),
    endedAt: capture.endedAt ?? Date.now(),
    publishedAt: Date.now(),
  };
  const compiled = compileLessonFromWorkMap(published);
  const previous = store.lessons.find((l) => l.sourceCaptureId === captureId && l.kind === "workmap");
  const lesson = compiled && previous ? { ...compiled, id: previous.id, createdAt: previous.createdAt } : compiled;
  const now = Date.now();
  store = {
    ...store,
    captures: store.captures.map((c) => (c.id === captureId ? published : c)),
    lessons: lesson ? mergeLessonPool(store.lessons, [lesson]) : store.lessons,
    captureTasks: store.captureTasks.map((t) =>
      t.captureId === captureId || t.id === published.taskId
        ? { ...t, status: "done" as const, captureId, updatedAt: now }
        : t,
    ),
  };
  store = recompileRoadmapsForCompany(store, published.companyId);
  store = regenerateCaptureTasks(store, published.companyId);
  return write(store);
}

/** Drop an unpublished capture. Published ones (and legacy captures with lessons) are kept. */
export function discardCapture(captureId: string): Store {
  const store = read();
  const capture = store.captures.find((c) => c.id === captureId);
  const hasLessons = store.lessons.some((l) => l.sourceCaptureId === captureId);
  if (capture?.publishedAt || hasLessons) return store;
  const now = Date.now();
  return write({
    ...store,
    captures: store.captures.filter((c) => c.id !== captureId),
    captureTasks: store.captureTasks.map((t) =>
      t.captureId === captureId || t.id === capture?.taskId
        ? { ...t, status: "todo" as const, captureId: null, updatedAt: now }
        : t,
    ),
  });
}

function requireOwnCapture(captureId: string): { store: Store; capture: CaptureSession; membership: Membership } {
  const store = read();
  const membership = activeMembership(store);
  if (!membership) throw new Error("Not signed in");
  const capture = store.captures.find((c) => c.id === captureId);
  if (!capture || capture.companyId !== membership.companyId) throw new Error("Capture not found");
  const isOwner = membership.platformRole === "owner";
  if (capture.memberId !== membership.id && !isOwner) {
    throw new Error("You can only change your own captures");
  }
  return { store, capture, membership };
}

/** Creator or company owner can edit/remove a published lesson capture. */
export function canManageCapture(
  membership: Membership | null | undefined,
  capture: { memberId: string; companyId: string } | null | undefined,
): boolean {
  if (!membership || !capture) return false;
  if (capture.companyId !== membership.companyId) return false;
  return capture.memberId === membership.id || membership.platformRole === "owner";
}

/** Unconfirm a published Work Map so CaptureFlow opens Debrief for edits; lesson id stays on republish. */
export function reopenCaptureForEdit(captureId: string): Store {
  const { capture } = requireOwnCapture(captureId);
  if (!capture.publishedAt || !capture.workMap) throw new Error("Only published maps can be reopened");
  return setCaptureWorkMap(captureId, { ...capture.workMap, confirmed: false });
}

/** Remove a published capture, its lessons, and dependent agent abilities; recompile roadmaps. */
export function deletePublishedCapture(captureId: string): Store {
  let { store, capture } = requireOwnCapture(captureId);
  if (!capture.publishedAt && !store.lessons.some((l) => l.sourceCaptureId === captureId)) {
    throw new Error("Capture is not published");
  }
  const doomedAbilities = new Set(
    store.abilities.filter((a) => a.sourceCaptureId === captureId).map((a) => a.id),
  );
  const now = Date.now();
  store = {
    ...store,
    captures: store.captures.filter((c) => c.id !== captureId),
    lessons: store.lessons.filter((l) => l.sourceCaptureId !== captureId),
    abilities: store.abilities.filter((a) => a.sourceCaptureId !== captureId),
    abilityRuns: store.abilityRuns.filter((r) => !doomedAbilities.has(r.abilityId)),
    captureTasks: store.captureTasks.map((t) =>
      t.captureId === captureId || t.id === capture.taskId
        ? { ...t, status: "todo" as const, captureId: null, updatedAt: now }
        : t,
    ),
  };
  store = recompileRoadmapsForCompany(store, capture.companyId);
  store = regenerateCaptureTasks(store, capture.companyId);
  return write(store);
}

/** People whose roadmap includes a lesson compiled from this capture. */
export function assigneesForCapture(
  store: Store,
  captureId: string,
): { membershipId: string; name: string }[] {
  const lessonIds = new Set(
    store.lessons.filter((l) => l.sourceCaptureId === captureId).map((l) => l.id),
  );
  if (!lessonIds.size) return [];
  const out: { membershipId: string; name: string }[] = [];
  for (const roadmap of store.roadmaps) {
    if (!roadmap.items.some((i) => lessonIds.has(i.lessonId))) continue;
    const member = store.memberships.find((m) => m.id === roadmap.membershipId);
    if (!member) continue;
    const name = store.users.find((u) => u.id === member.userId)?.name ?? "Unknown";
    out.push({ membershipId: member.id, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function captureForLesson(store: Store, lesson: Lesson): CaptureSession | null {
  return store.captures.find((c) => c.id === lesson.sourceCaptureId) ?? null;
}

export function expertNameForCapture(store: Store, capture: Pick<CaptureSession, "memberId">): string {
  const member = store.memberships.find((m) => m.id === capture.memberId);
  return store.users.find((u) => u.id === member?.userId)?.name ?? "Your colleague";
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
  const checkpoints =
    status === "done"
      ? (store.lessonCheckpoints ?? []).filter(
          (c) => !(c.membershipId === membershipId && c.lessonId === lessonId),
        )
      : (store.lessonCheckpoints ?? []);
  store = touchMembershipActive(
    {
      ...store,
      roadmaps: store.roadmaps.map((r) => (r.id === roadmap.id ? next : r)),
      lessonCheckpoints: checkpoints,
    },
    membershipId,
  );
  return write(store);
}

export function getLessonCheckpoint(
  store: Store,
  membershipId: string,
  lessonId: string,
): LessonCheckpoint | null {
  return (
    (store.lessonCheckpoints ?? []).find(
      (c) => c.membershipId === membershipId && c.lessonId === lessonId,
    ) ?? null
  );
}

/** Persist the learner's current live step so they can continue after a break. */
export function saveLessonCheckpoint(
  membershipId: string,
  lessonId: string,
  input: { stepIndex: number; guidedThisStep?: boolean },
): Store {
  let store = read();
  const membership = store.memberships.find((m) => m.id === membershipId);
  if (!membership) throw new Error("Membership not found");
  const stepIndex = Math.max(0, Math.floor(input.stepIndex));
  const now = Date.now();
  const next: LessonCheckpoint = {
    membershipId,
    lessonId,
    stepIndex,
    guidedThisStep: Boolean(input.guidedThisStep),
    updatedAt: now,
  };
  const others = (store.lessonCheckpoints ?? []).filter(
    (c) => !(c.membershipId === membershipId && c.lessonId === lessonId),
  );
  store = touchMembershipActive(
    { ...store, lessonCheckpoints: [...others, next] },
    membershipId,
    now,
  );
  return write(store);
}

export function clearLessonCheckpoint(membershipId: string, lessonId: string): Store {
  let store = read();
  const next = (store.lessonCheckpoints ?? []).filter(
    (c) => !(c.membershipId === membershipId && c.lessonId === lessonId),
  );
  if (next.length === (store.lessonCheckpoints ?? []).length) return store;
  store = touchMembershipActive({ ...store, lessonCheckpoints: next }, membershipId);
  return write(store);
}

/** Published captures with a confirmed Work Map — eligible sources for agent abilities. */
export function publishedWorkMapCaptures(store: Store, companyId: string): CaptureSession[] {
  return store.captures.filter(
    (c) =>
      c.companyId === companyId &&
      Boolean(c.publishedAt) &&
      Boolean(c.workMap?.confirmed) &&
      (c.workMap?.steps.length ?? 0) > 0,
  );
}

export function createAgent(input: {
  name: string;
  brief?: string;
  workRoleId?: string | null;
  status?: AgentStatus;
}): Store {
  let { store, company } = requireOwner();
  const name = input.name.trim();
  if (!name) throw new Error("Agent name is required");
  const workRoleId = input.workRoleId || null;
  if (workRoleId && !store.workRoles.some((r) => r.id === workRoleId && r.companyId === company.id)) {
    throw new Error("Work role not found");
  }
  const agent: Agent = {
    id: createId("agt"),
    companyId: company.id,
    name,
    brief: (input.brief || "").trim(),
    workRoleId,
    status: input.status ?? "draft",
    createdAt: Date.now(),
  };
  store = { ...store, agents: [...store.agents, agent] };
  return write(store);
}

export function updateAgent(
  agentId: string,
  patch: Partial<Pick<Agent, "name" | "brief" | "workRoleId" | "status">>,
): Store {
  let { store, company } = requireOwner();
  const agent = store.agents.find((a) => a.id === agentId && a.companyId === company.id);
  if (!agent) throw new Error("Agent not found");
  if (patch.workRoleId) {
    if (!store.workRoles.some((r) => r.id === patch.workRoleId && r.companyId === company.id)) {
      throw new Error("Work role not found");
    }
  }
  const next: Agent = {
    ...agent,
    name: patch.name !== undefined ? patch.name.trim() || agent.name : agent.name,
    brief: patch.brief !== undefined ? patch.brief.trim() : agent.brief,
    workRoleId: patch.workRoleId !== undefined ? patch.workRoleId : agent.workRoleId,
    status: patch.status ?? agent.status,
  };
  store = { ...store, agents: store.agents.map((a) => (a.id === agentId ? next : a)) };
  return write(store);
}

export function createAbility(input: {
  agentId: string;
  name: string;
  sourceCaptureId: string;
  sourceLessonId?: string | null;
  trigger?: AbilityTrigger;
  triggerDescription?: string;
  notes?: string;
  extraGuardrails?: string[];
  enabled?: boolean;
}): Store {
  let { store, company } = requireOwner();
  const agent = store.agents.find((a) => a.id === input.agentId && a.companyId === company.id);
  if (!agent) throw new Error("Agent not found");
  const capture = store.captures.find((c) => c.id === input.sourceCaptureId && c.companyId === company.id);
  if (!capture?.publishedAt || !capture.workMap?.confirmed || !capture.workMap.steps.length) {
    throw new Error("Pick a published capture with a confirmed Work Map");
  }
  const lesson =
    input.sourceLessonId != null
      ? store.lessons.find((l) => l.id === input.sourceLessonId && l.sourceCaptureId === capture.id)
      : store.lessons.find((l) => l.sourceCaptureId === capture.id && l.kind === "workmap");
  const name = input.name.trim() || capture.workMap.title || "Untitled ability";
  const trigger: AbilityTrigger = input.trigger === "described" ? "described" : "manual";
  const ability: AgentAbility = {
    id: createId("abl"),
    agentId: agent.id,
    companyId: company.id,
    name,
    sourceCaptureId: capture.id,
    sourceLessonId: lesson?.id ?? null,
    trigger,
    triggerDescription: trigger === "described" ? (input.triggerDescription || "").trim() : "",
    notes: (input.notes || "").trim(),
    extraGuardrails: (input.extraGuardrails || []).map((g) => g.trim()).filter(Boolean),
    enabled: input.enabled ?? true,
    createdAt: Date.now(),
  };
  store = { ...store, abilities: [...store.abilities, ability] };
  return write(store);
}

export function updateAbility(
  abilityId: string,
  patch: Partial<
    Pick<
      AgentAbility,
      "name" | "trigger" | "triggerDescription" | "notes" | "extraGuardrails" | "enabled"
    >
  >,
): Store {
  let { store, company } = requireOwner();
  const ability = store.abilities.find((a) => a.id === abilityId && a.companyId === company.id);
  if (!ability) throw new Error("Ability not found");
  const trigger = patch.trigger ?? ability.trigger;
  const next: AgentAbility = {
    ...ability,
    name: patch.name !== undefined ? patch.name.trim() || ability.name : ability.name,
    trigger,
    triggerDescription:
      trigger === "described"
        ? patch.triggerDescription !== undefined
          ? patch.triggerDescription.trim()
          : ability.triggerDescription
        : "",
    notes: patch.notes !== undefined ? patch.notes.trim() : ability.notes,
    extraGuardrails:
      patch.extraGuardrails !== undefined
        ? patch.extraGuardrails.map((g) => g.trim()).filter(Boolean)
        : ability.extraGuardrails,
    enabled: patch.enabled ?? ability.enabled,
  };
  store = { ...store, abilities: store.abilities.map((a) => (a.id === abilityId ? next : a)) };
  return write(store);
}

export function saveAbilityRun(input: {
  abilityId: string;
  agentId: string;
  context: string;
  plan: ActionIntent[];
  summary: string;
  status?: AbilityRun["status"];
}): Store {
  let { store, company } = requireOwner();
  const ability = store.abilities.find(
    (a) => a.id === input.abilityId && a.agentId === input.agentId && a.companyId === company.id,
  );
  if (!ability) throw new Error("Ability not found");
  const run: AbilityRun = {
    id: createId("run"),
    abilityId: ability.id,
    agentId: ability.agentId,
    mode: "dry_run",
    status: input.status ?? "complete",
    context: (input.context || "").trim(),
    plan: input.plan,
    summary: (input.summary || "").trim(),
    createdAt: Date.now(),
  };
  store = { ...store, abilityRuns: [...store.abilityRuns, run] };
  return write(store);
}

function regenerateCaptureTasks(store: Store, companyId: string): Store {
  const tasks = compileCaptureTasks({
    companyId,
    memberships: store.memberships.filter((m) => m.companyId === companyId),
    workRoles: store.workRoles.filter((r) => r.companyId === companyId),
    people: store.externalPeople.filter((p) => p.companyId === companyId && p.adminStatus === "linked"),
    topics: store.knowledgeTopics.filter((t) => t.companyId === companyId),
    lessons: store.lessons.filter((l) => l.companyId === companyId),
    captures: store.captures.filter((c) => c.companyId === companyId),
    previous: store.captureTasks.filter((t) => t.companyId === companyId),
  });
  return {
    ...store,
    captureTasks: [
      ...store.captureTasks.filter((t) => t.companyId !== companyId),
      ...tasks,
    ],
  };
}

export function getNotionConnection(store: Store, companyId: string): IntegrationConnection | null {
  return (
    store.integrationConnections.find(
      (c) => c.companyId === companyId && c.provider === "notion" && c.status !== "disconnected",
    ) ?? null
  );
}

export function connectNotionIntegration(input: {
  workspaceName: string;
  tokenRef?: string;
  peopleDatabaseId?: string;
  knowledgeSourceIds?: string[];
}): Store {
  let { store, company } = requireOwner();
  const existing = getNotionConnection(store, company.id);
  const now = Date.now();
  if (existing) {
    store = {
      ...store,
      integrationConnections: store.integrationConnections.map((c) =>
        c.id === existing.id
          ? {
              ...c,
              status: "connected" as const,
              workspaceName: input.workspaceName.trim() || c.workspaceName,
              tokenRef: input.tokenRef ?? c.tokenRef,
              peopleDatabaseId: input.peopleDatabaseId ?? c.peopleDatabaseId,
              knowledgeSourceIds: input.knowledgeSourceIds ?? c.knowledgeSourceIds,
              errorMessage: undefined,
            }
          : c,
      ),
    };
  } else {
    const connection: IntegrationConnection = {
      id: createId("int"),
      companyId: company.id,
      provider: "notion",
      status: "connected",
      workspaceName: input.workspaceName.trim() || "Notion",
      tokenRef: input.tokenRef,
      peopleDatabaseId: input.peopleDatabaseId,
      knowledgeSourceIds: input.knowledgeSourceIds ?? [],
      createdAt: now,
    };
    store = {
      ...store,
      integrationConnections: [...store.integrationConnections, connection],
    };
  }
  return write(store);
}

export function disconnectNotionIntegration(): Store {
  let { store, company } = requireOwner();
  store = {
    ...store,
    integrationConnections: store.integrationConnections.map((c) =>
      c.companyId === company.id && c.provider === "notion"
        ? { ...c, status: "disconnected" as const, errorMessage: undefined }
        : c,
    ),
  };
  return write(store);
}

export type NotionSyncPersonPayload = {
  externalId: string;
  externalUrl?: string;
  name: string;
  email?: string;
  roleText?: string;
  area?: string;
  jobRoles?: string[];
  workSummaries?: string[];
};

export type NotionSyncTopicPayload = {
  externalId: string;
  externalUrl?: string;
  title: string;
  summary: string;
  source: KnowledgeTopic["source"];
  suggestedArea?: string;
  suggestedRoleTitle?: string;
  personExternalId?: string;
};

/** Upsert synced Notion people/topics without overwriting admin mapping overrides. */
export function applyNotionSync(input: {
  workspaceName?: string;
  peopleDatabaseId?: string;
  knowledgeSourceIds?: string[];
  people: NotionSyncPersonPayload[];
  topics: NotionSyncTopicPayload[];
}): Store {
  let { store, company } = requireOwner();
  let connection = getNotionConnection(store, company.id);
  const now = Date.now();
  if (!connection) {
    connection = {
      id: createId("int"),
      companyId: company.id,
      provider: "notion",
      status: "connected",
      workspaceName: input.workspaceName?.trim() || "Notion",
      peopleDatabaseId: input.peopleDatabaseId,
      knowledgeSourceIds: input.knowledgeSourceIds ?? [],
      createdAt: now,
    };
    store = {
      ...store,
      integrationConnections: [...store.integrationConnections, connection],
    };
  } else {
    store = {
      ...store,
      integrationConnections: store.integrationConnections.map((c) =>
        c.id === connection!.id
          ? {
              ...c,
              status: "connected" as const,
              workspaceName: input.workspaceName?.trim() || c.workspaceName,
              peopleDatabaseId: input.peopleDatabaseId ?? c.peopleDatabaseId,
              knowledgeSourceIds: input.knowledgeSourceIds ?? c.knowledgeSourceIds,
              lastSyncAt: now,
              errorMessage: undefined,
            }
          : c,
      ),
    };
    connection = store.integrationConnections.find((c) => c.id === connection!.id)!;
  }

  const byExternal = new Map(
    store.externalPeople
      .filter((p) => p.companyId === company.id && p.connectionId === connection!.id)
      .map((p) => [p.externalId, p]),
  );

  const nextPeople: ExternalPerson[] = store.externalPeople.filter(
    (p) => !(p.companyId === company.id && p.connectionId === connection!.id),
  );

  for (const row of input.people) {
    const suggested = suggestRoleFromNotion({
      roleText: row.roleText,
      area: row.area,
      jobRoles: row.jobRoles,
    });
    const prev = byExternal.get(row.externalId);
    nextPeople.push({
      id: prev?.id ?? createId("exp"),
      companyId: company.id,
      connectionId: connection.id,
      provider: "notion",
      externalId: row.externalId,
      externalUrl: row.externalUrl,
      name: row.name.trim(),
      email: row.email?.trim().toLowerCase() || undefined,
      roleText: row.roleText,
      area: row.area,
      jobRoles: row.jobRoles ?? [],
      workSummaries: row.workSummaries ?? [],
      suggestedTitle: suggested.title,
      suggestedCompetence: suggested.competence,
      suggestedSeniority: suggested.seniority,
      suggestedNewHire: suggested.newHire,
      mappedTitle: prev?.mappedTitle,
      mappedCompetence: prev?.mappedCompetence,
      mappedSeniority: prev?.mappedSeniority,
      mappedNewHire: prev?.mappedNewHire,
      userId: prev?.userId,
      membershipId: prev?.membershipId,
      workRoleId: prev?.workRoleId,
      adminStatus: prev?.adminStatus ?? "pending",
      updatedAt: now,
    });
  }

  const personIdByExternal = new Map(nextPeople.map((p) => [p.externalId, p.id]));
  const prevTopics = new Map(
    store.knowledgeTopics
      .filter((t) => t.companyId === company.id && t.connectionId === connection!.id)
      .map((t) => [t.externalId, t]),
  );
  const nextTopics: KnowledgeTopic[] = store.knowledgeTopics.filter(
    (t) => !(t.companyId === company.id && t.connectionId === connection!.id),
  );
  for (const row of input.topics) {
    const prev = prevTopics.get(row.externalId);
    nextTopics.push({
      id: prev?.id ?? createId("topic"),
      companyId: company.id,
      connectionId: connection.id,
      provider: "notion",
      externalId: row.externalId,
      externalUrl: row.externalUrl,
      title: row.title.trim(),
      summary: row.summary.trim(),
      source: row.source,
      suggestedArea: row.suggestedArea,
      suggestedRoleTitle: row.suggestedRoleTitle,
      externalPersonId: row.personExternalId
        ? personIdByExternal.get(row.personExternalId)
        : undefined,
      updatedAt: now,
    });
  }

  store = {
    ...store,
    externalPeople: nextPeople,
    knowledgeTopics: nextTopics,
    companies: store.companies.map((c) =>
      c.id === company.id
        ? {
            ...c,
            externalId: c.externalId ?? `notion:${connection!.id}`,
            summary: c.summary || `Synced from ${connection!.workspaceName}`,
          }
        : c,
    ),
  };
  return write(store);
}

export function updateExternalPersonMapping(
  externalPersonId: string,
  patch: {
    mappedTitle?: string;
    mappedCompetence?: Competence;
    mappedSeniority?: Seniority;
    mappedNewHire?: boolean;
    adminStatus?: ExternalPersonAdminStatus;
  },
): Store {
  let { store, company } = requireOwner();
  store = {
    ...store,
    externalPeople: store.externalPeople.map((p) =>
      p.id === externalPersonId && p.companyId === company.id
        ? {
            ...p,
            mappedTitle: patch.mappedTitle !== undefined ? patch.mappedTitle.trim() : p.mappedTitle,
            mappedCompetence: patch.mappedCompetence ?? p.mappedCompetence,
            mappedSeniority: patch.mappedSeniority ?? p.mappedSeniority,
            mappedNewHire: patch.mappedNewHire ?? p.mappedNewHire,
            adminStatus: patch.adminStatus ?? p.adminStatus,
            updatedAt: Date.now(),
          }
        : p,
    ),
  };
  return write(store);
}

/** Confirm pending/mapped Notion people into users, roles, memberships; regenerate tasks. */
export function confirmNotionImport(externalPersonIds?: string[]): Store {
  let { store, company } = requireOwner();
  const targets = store.externalPeople.filter(
    (p) =>
      p.companyId === company.id &&
      p.adminStatus !== "ignored" &&
      (!externalPersonIds?.length || externalPersonIds.includes(p.id)),
  );
  if (!targets.length) throw new Error("No people to import");

  for (const person of targets) {
    const title = (person.mappedTitle || person.suggestedTitle || person.roleText || "Teammate").trim();
    const competence = person.mappedCompetence || person.suggestedCompetence || "mid";
    const seniority = person.mappedSeniority ?? person.suggestedSeniority ?? 2;
    const newHire = person.mappedNewHire ?? person.suggestedNewHire ?? false;

    const ensured = ensureWorkRole(store, company.id, {
      title,
      competence,
      seniority,
      externalId: `${normalizeTitle(title)}:${competence}`,
    });
    store = ensured.store;
    const role = ensured.role;

    let email = person.email;
    if (!email) {
      const slug = person.name.toLowerCase().replace(/[^a-z0-9]+/g, ".") || "person";
      email = `${slug}@${company.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "company"}.local`;
    }

    let user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      user = {
        id: createId("usr"),
        name: person.name,
        email: email.toLowerCase(),
        createdAt: Date.now(),
      };
      store = { ...store, users: [...store.users, user] };
    } else if (user.name !== person.name) {
      store = {
        ...store,
        users: store.users.map((u) => (u.id === user!.id ? { ...u, name: person.name } : u)),
      };
    }

    const isOwnerUser = user.id === company.ownerUserId;
    let membership = store.memberships.find((m) => m.userId === user!.id && m.companyId === company.id);
    if (!membership) {
      membership = {
        id: createId("mem"),
        userId: user.id,
        companyId: company.id,
        platformRole: isOwnerUser ? "owner" : "member",
        workRoleId: role.id,
        newHire: isOwnerUser ? undefined : newHire || undefined,
        externalId: person.externalId,
        createdAt: Date.now(),
      };
      store = { ...store, memberships: [...store.memberships, membership] };
    } else {
      membership = {
        ...membership,
        workRoleId: role.id,
        newHire: membership.platformRole === "owner" ? undefined : newHire || undefined,
        externalId: person.externalId,
      };
      store = {
        ...store,
        memberships: store.memberships.map((m) => (m.id === membership!.id ? membership! : m)),
      };
    }

    store = {
      ...store,
      externalPeople: store.externalPeople.map((p) =>
        p.id === person.id
          ? {
              ...p,
              adminStatus: "linked" as const,
              userId: user!.id,
              membershipId: membership!.id,
              workRoleId: role.id,
              mappedTitle: title,
              mappedCompetence: competence,
              mappedSeniority: seniority,
              mappedNewHire: newHire,
              updatedAt: Date.now(),
            }
          : p,
      ),
    };
  }

  store = {
    ...store,
    companies: store.companies.map((c) =>
      c.id === company.id ? { ...c, onboardingComplete: true } : c,
    ),
  };
  store = recompileRoadmapsForCompany(store, company.id);
  store = regenerateCaptureTasks(store, company.id);
  return write(store);
}

export function regenerateExpertCaptureTasks(): Store {
  const { store, company } = requireOwner();
  return write(regenerateCaptureTasks(store, company.id));
}

export function updateCaptureTaskStatus(taskId: string, status: CaptureTaskStatus): Store {
  let store = read();
  const company = getActiveCompany(store);
  const membership = activeMembership(store);
  if (!company || !membership) throw new Error("Not signed in");
  const task = store.captureTasks.find((t) => t.id === taskId && t.companyId === company.id);
  if (!task) throw new Error("Task not found");
  if (
    membership.platformRole !== "owner" &&
    task.assigneeMembershipId !== membership.id
  ) {
    throw new Error("Not allowed");
  }
  store = {
    ...store,
    captureTasks: store.captureTasks.map((t) =>
      t.id === taskId ? { ...t, status, updatedAt: Date.now() } : t,
    ),
  };
  return write(store);
}

export function reassignCaptureTask(taskId: string, assigneeMembershipId: string): Store {
  let { store, company } = requireOwner();
  const assignee = store.memberships.find(
    (m) => m.id === assigneeMembershipId && m.companyId === company.id,
  );
  if (!assignee) throw new Error("Assignee not found");
  store = {
    ...store,
    captureTasks: store.captureTasks.map((t) =>
      t.id === taskId && t.companyId === company.id
        ? { ...t, assigneeMembershipId, updatedAt: Date.now() }
        : t,
    ),
  };
  return write(store);
}

export function tasksForMembership(store: Store, membershipId: string): CaptureTask[] {
  return store.captureTasks
    .filter((t) => t.assigneeMembershipId === membershipId && t.status !== "dismissed")
    .sort((a, b) => {
      const rank = { in_progress: 0, todo: 1, done: 2, dismissed: 3 };
      return rank[a.status] - rank[b.status] || b.updatedAt - a.updatedAt;
    });
}

/** Ensure a company exists before Notion connect during onboarding. */
export function ensureCompanyForNotionImport(input?: { name?: string; summary?: string }): Store {
  let store = read();
  const user = getSessionUser(store);
  if (!user) throw new Error("Not signed in");
  const company = getActiveCompany(store);
  if (company) {
    if (input?.name || input?.summary) {
      return updateCompanyProfile({
        name: input.name,
        summary: input.summary,
      });
    }
    return store;
  }
  return createCompany(input?.name?.trim() || "My company", input?.summary);
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
