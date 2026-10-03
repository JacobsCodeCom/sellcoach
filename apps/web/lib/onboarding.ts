import type { Competence } from "@mira/core";
import {
  assignWorkRole,
  completeCompanyOnboarding,
  createCompany,
  createMemberAccount,
  createWorkRole,
  findWorkRoleByTitle,
  getActiveCompany,
  getSessionUser,
  loadStore,
  removeMember,
  setMemberNewHire,
  type Store,
  updateCompanyProfile,
} from "@/lib/repo";

export type AgentMode = "setup" | "manage";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type OnboardingAction =
  | { type: "create_company"; name: string; summary?: string }
  | {
      type: "create_role";
      title: string;
      seniority: number;
      competence: Competence;
    }
  | {
      type: "create_member";
      name: string;
      email: string;
      roleTitle: string;
      competence?: Competence;
      newHire?: boolean;
    }
  | {
      type: "update_member";
      email: string;
      roleTitle?: string;
      competence?: Competence;
      newHire?: boolean;
    }
  | { type: "remove_member"; email: string }
  | { type: "owner_is_expert" }
  | {
      type: "assign_owner_role";
      roleTitle: string;
      competence?: Competence;
    }
  | { type: "complete_onboarding" };

export type OnboardingSnapshot = {
  ownerName: string;
  ownerEmail: string;
  company: { name: string; summary?: string; ownerIsExpert?: boolean } | null;
  roles: { title: string; seniority: number; competence: Competence }[];
  members: {
    name: string;
    email: string;
    roleTitle: string | null;
    isOwner: boolean;
    newHire?: boolean;
  }[];
  lessonCount?: number;
  /** Name waiting for an email on the next turn (voice-friendly). */
  pendingExpertName?: string | null;
};

export type AgentReply = {
  message: string;
  actions: OnboardingAction[];
  done?: boolean;
  placeholder?: string;
  options?: string[];
};

const COMPETENCES: Competence[] = ["junior", "mid", "expert"];

export function buildOnboardingSnapshot(store: Store): OnboardingSnapshot {
  const user = getSessionUser(store);
  const company = getActiveCompany(store);
  const roles = company
    ? store.workRoles.filter((r) => r.companyId === company.id)
    : [];
  const members = company
    ? store.memberships
        .filter((m) => m.companyId === company.id)
        .map((m) => {
          const person = store.users.find((u) => u.id === m.userId);
          const role = roles.find((r) => r.id === m.workRoleId);
          return {
            name: person?.name ?? "Unknown",
            email: person?.email ?? "",
            roleTitle: role ? `${role.title} (${role.competence})` : null,
            isOwner: m.platformRole === "owner",
            newHire: Boolean(m.newHire),
          };
        })
    : [];
  const lessonCount = company
    ? store.lessons.filter((l) => l.companyId === company.id).length
    : 0;

  const pendingExpertName =
    typeof window !== "undefined" ? sessionStorage.getItem("mira-pending-expert") : null;

  return {
    ownerName: user?.name ?? "",
    ownerEmail: user?.email ?? "",
    company: company
      ? {
          name: company.name,
          summary: company.summary,
          ownerIsExpert: company.ownerIsExpert,
        }
      : null,
    roles: roles.map((r) => ({
      title: r.title,
      seniority: r.seniority,
      competence: r.competence,
    })),
    members,
    lessonCount,
    pendingExpertName,
  };
}

function optionalCompetence(value: unknown): Competence | undefined {
  return COMPETENCES.includes(value as Competence) ? (value as Competence) : undefined;
}

export function sanitizeActions(raw: unknown): OnboardingAction[] {
  if (!Array.isArray(raw)) return [];
  const out: OnboardingAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const type = String(a.type || "");
    if (type === "create_company" && typeof a.name === "string" && a.name.trim()) {
      out.push({
        type: "create_company",
        name: a.name,
        summary: typeof a.summary === "string" ? a.summary : undefined,
      });
    } else if (type === "create_role" && typeof a.title === "string" && a.title.trim()) {
      const competence = COMPETENCES.includes(a.competence as Competence)
        ? (a.competence as Competence)
        : "mid";
      out.push({
        type: "create_role",
        title: a.title,
        seniority: Number(a.seniority) || 1,
        competence,
      });
    } else if (
      type === "create_member" &&
      typeof a.name === "string" &&
      typeof a.email === "string" &&
      typeof a.roleTitle === "string"
    ) {
      out.push({
        type: "create_member",
        name: a.name,
        email: a.email,
        roleTitle: a.roleTitle,
        competence: optionalCompetence(a.competence),
        newHire: a.newHire === true ? true : undefined,
      });
    } else if (type === "update_member" && typeof a.email === "string" && a.email.trim()) {
      out.push({
        type: "update_member",
        email: a.email,
        roleTitle: typeof a.roleTitle === "string" && a.roleTitle.trim() ? a.roleTitle : undefined,
        competence: optionalCompetence(a.competence),
        newHire: typeof a.newHire === "boolean" ? a.newHire : undefined,
      });
    } else if (type === "remove_member" && typeof a.email === "string" && a.email.trim()) {
      out.push({ type: "remove_member", email: a.email });
    } else if (type === "owner_is_expert") {
      out.push({ type: "owner_is_expert" });
    } else if (type === "assign_owner_role" && typeof a.roleTitle === "string") {
      out.push({
        type: "assign_owner_role",
        roleTitle: a.roleTitle,
        competence: COMPETENCES.includes(a.competence as Competence)
          ? (a.competence as Competence)
          : undefined,
      });
    } else if (type === "complete_onboarding") {
      out.push({ type: "complete_onboarding" });
    }
  }
  return out;
}

export function applyOnboardingActions(actions: OnboardingAction[]): {
  store: Store;
  notes: string[];
  done: boolean;
} {
  let store = loadStore();
  const notes: string[] = [];
  let done = false;

  for (const action of actions) {
    store = applyOne(store, action, notes);
    if (action.type === "complete_onboarding") done = true;
  }

  return { store, notes, done };
}

function applyOne(store: Store, action: OnboardingAction, notes: string[]): Store {
  switch (action.type) {
    case "create_company": {
      const existing = getActiveCompany(store);
      if (existing) {
        const next = updateCompanyProfile({
          name: action.name,
          summary: action.summary,
        });
        notes.push(`Updated company profile: ${action.name}`);
        return next;
      }
      const next = createCompany(action.name, action.summary);
      notes.push(`Created company: ${action.name}`);
      return next;
    }
    case "create_role": {
      const company = getActiveCompany(store);
      if (!company) {
        notes.push("Skipped role — create the company first");
        return store;
      }
      const competence = COMPETENCES.includes(action.competence) ? action.competence : "mid";
      const seniority = Math.max(1, Math.min(10, Number(action.seniority) || 1));
      const duplicate = findWorkRoleByTitle(store, company.id, action.title, competence);
      if (duplicate && duplicate.seniority === seniority) {
        notes.push(`Role already exists: ${action.title} (${competence})`);
        return store;
      }
      const next = createWorkRole({
        title: action.title,
        seniority,
        competence,
      });
      notes.push(`Added role: ${action.title} · ${competence} L${seniority}`);
      return next;
    }
    case "create_member": {
      const company = getActiveCompany(store);
      if (!company) {
        notes.push("Skipped member — create the company first");
        return store;
      }
      const competence = action.competence ?? (action.newHire ? "junior" : undefined);
      const { store: withRole, role } = ensureRole(store, company.id, action.roleTitle, competence);
      store = withRole;
      const next = createMemberAccount({
        name: action.name,
        email: action.email,
        workRoleId: role?.id ?? null,
        platformRole: "member",
        newHire: action.newHire,
      });
      if (typeof window !== "undefined") sessionStorage.removeItem("mira-pending-expert");
      const label = action.newHire ? "new hire" : role?.competence;
      notes.push(
        role
          ? `Added ${action.name} as ${role.title} (${label})`
          : `Added ${action.name} (no matching role yet)`,
      );
      return next;
    }
    case "update_member": {
      const company = getActiveCompany(store);
      const target = company ? findMembershipByEmail(store, company.id, action.email) : null;
      if (!company || !target || target.platformRole === "owner") {
        notes.push(`Could not find ${action.email}`);
        return store;
      }
      if (action.roleTitle) {
        const competence = action.competence ?? (action.newHire ? "junior" : undefined);
        const { store: withRole, role } = ensureRole(
          store,
          company.id,
          action.roleTitle,
          competence,
        );
        store = withRole;
        if (role) store = assignWorkRole(target.id, role.id);
      }
      if (action.newHire !== undefined) store = setMemberNewHire(target.id, action.newHire);
      notes.push(`Updated ${action.email}`);
      return store;
    }
    case "remove_member": {
      const company = getActiveCompany(store);
      const target = company ? findMembershipByEmail(store, company.id, action.email) : null;
      if (!target || target.platformRole === "owner") {
        notes.push(`Could not remove ${action.email}`);
        return store;
      }
      notes.push(`Removed ${action.email}`);
      return removeMember(target.id);
    }
    case "owner_is_expert": {
      const next = updateCompanyProfile({ ownerIsExpert: true });
      if (typeof window !== "undefined") sessionStorage.removeItem("mira-pending-expert");
      notes.push("You'll capture as the expert");
      return next;
    }
    case "assign_owner_role": {
      const company = getActiveCompany(store);
      const owner = store.memberships.find(
        (m) =>
          m.companyId === company?.id &&
          m.platformRole === "owner" &&
          m.userId === store.sessionUserId,
      );
      if (!company || !owner) {
        notes.push("Skipped owner role — no owner membership");
        return store;
      }
      const role = findWorkRoleByTitle(
        store,
        company.id,
        action.roleTitle,
        action.competence,
      );
      if (!role) {
        notes.push(`Could not find role “${action.roleTitle}” for you`);
        return store;
      }
      const next = assignWorkRole(owner.id, role.id);
      notes.push(`Assigned you: ${role.title} (${role.competence})`);
      return next;
    }
    case "complete_onboarding": {
      const next = completeCompanyOnboarding();
      notes.push("Setup complete");
      return next;
    }
    default:
      return store;
  }
}

function findMembershipByEmail(store: Store, companyId: string, email: string) {
  const user = store.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) return null;
  return store.memberships.find((m) => m.userId === user.id && m.companyId === companyId) ?? null;
}

/** Find a role by title (+competence); create it when the title is new to the company. */
function ensureRole(
  store: Store,
  companyId: string,
  title: string,
  competence?: Competence,
): { store: Store; role: ReturnType<typeof findWorkRoleByTitle> } {
  const existing = findWorkRoleByTitle(store, companyId, title, competence);
  if (existing && (!competence || existing.competence === competence)) {
    return { store, role: existing };
  }
  if (!title.trim()) return { store, role: existing };
  const band = competence ?? "mid";
  const next = createWorkRole({
    title: existing?.title ?? title,
    seniority: band === "expert" ? 4 : band === "mid" ? 3 : 1,
    competence: band,
  });
  return { store: next, role: findWorkRoleByTitle(next, companyId, existing?.title ?? title, band) };
}

/** Deterministic team agent when the LLM is unavailable (after setup). */
export function localManageReply(
  messages: ChatMessage[],
  snapshot: OnboardingSnapshot,
): AgentReply {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content.trim() ?? "";
  const titles = [...new Set(snapshot.roles.map((r) => r.title))];
  const people = snapshot.members.filter((m) => !m.isOwner);
  const placeholder = `Sara Lind, sara@${domainFromEmail(snapshot.ownerEmail)}, new hire in ${titles[0] ?? "Operations"}`;

  if (!lastUser) {
    const newHires = people.filter((m) => m.newHire).length;
    return {
      message: `Hi ${snapshot.ownerName.split(/\s+/)[0] || "there"}. ${people.length} people, ${newHires} onboarding. Who should I add or change?`,
      actions: [],
      placeholder,
      options: ["Add a new hire", "Add an expert", "Who's onboarding?"],
    };
  }

  const lower = lastUser.toLowerCase();
  const email = lastUser.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];

  if (/\b(remove|delete|offboard)\b/.test(lower)) {
    const target = people.find(
      (p) =>
        (email && p.email.toLowerCase() === email.toLowerCase()) ||
        lower.includes(p.name.toLowerCase().split(/\s+/)[0] ?? "\u0000"),
    );
    if (!target) return { message: "Who should I remove? Say their name or email.", actions: [] };
    return {
      message: `Removed **${target.name}**.`,
      actions: [{ type: "remove_member", email: target.email }],
    };
  }

  if (/who'?s onboarding|list|show/.test(lower) && !email) {
    const hires = people.filter((p) => p.newHire);
    return {
      message: hires.length
        ? `Onboarding now: ${hires.map((h) => `**${h.name}**`).join(", ")}.`
        : "Nobody is onboarding yet. Add a new hire?",
      actions: [],
      placeholder,
    };
  }

  if (/^add (a )?new hire$/i.test(lastUser)) {
    return { message: "What's their name, email, and role?", actions: [], placeholder };
  }
  if (/^add (an )?expert$/i.test(lastUser)) {
    return {
      message: "What's the expert's name, email, and role?",
      actions: [],
      placeholder: `Anna Berg, anna@${domainFromEmail(snapshot.ownerEmail)}, senior ${titles[0] ?? "Operations"}`,
    };
  }

  if (email) {
    const newHire = /\b(new hire|new|onboard|starting|starts|trainee|intern)\b/.test(lower);
    const competence: Competence = newHire
      ? "junior"
      : /\b(expert|senior|lead)\b/.test(lower)
        ? "expert"
        : /\bjunior\b/.test(lower)
          ? "junior"
          : "mid";
    const rest = lastUser.replace(email, " ");
    const roleTitle =
      matchRoleTitle(rest, titles) ??
      rest.match(/\b(?:in|as(?: an?)?)\s+([A-Za-z][A-Za-z\s]{2,30})$/i)?.[1]?.trim() ??
      titles[0] ??
      "Core role";
    const name =
      rest
        .split(/[,—–-]/)[0]
        ?.replace(/\b(add|please|new hire|new|expert|senior|junior|mid)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim() || email.split("@")[0]!;
    const existing = people.find((p) => p.email.toLowerCase() === email.toLowerCase());
    return {
      message: existing
        ? `Updated **${existing.name}**.`
        : newHire
          ? `Added **${name}** as a new hire in ${roleTitle}. They'll see a simple lessons app.`
          : `Added **${name}** to ${roleTitle} (${competence}).`,
      actions: existing
        ? [{ type: "update_member", email, roleTitle, competence, newHire }]
        : [{ type: "create_member", name, email, roleTitle, competence, newHire }],
      placeholder,
    };
  }

  return {
    message: "Give me a name and email, plus role and whether they're a new hire.",
    actions: [],
    placeholder,
  };
}

/** Deterministic coach when the LLM is unavailable — same essentials, no model. */
export function localOnboardingReply(
  messages: ChatMessage[],
  snapshot: OnboardingSnapshot,
): AgentReply {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content.trim() ?? "";
  const expertPlaceholder = `Sam Lee, sam@${domainFromEmail(snapshot.ownerEmail)}, role`;
  const uniqueTitles = (roles: { title: string }[]) => [...new Set(roles.map((r) => r.title))];

  if (!snapshot.company) {
    if (!lastUser || messages.filter((m) => m.role === "user").length === 0) {
      return {
        message: `Hi ${snapshot.ownerName || "there"}. What's your company, and what do you do?`,
        actions: [],
        placeholder: "Acme — B2B sales coaching",
      };
    }
    const { name, summary } = parseCompanyLine(lastUser);
    const roles = suggestRoles(summary || name);
    return {
      message: `**${name}** — I added ${uniqueTitles(roles).join(", ")}.\n\nWho's your first expert?`,
      actions: [
        { type: "create_company", name, summary },
        ...roles.map((r) => ({ type: "create_role" as const, ...r })),
      ],
      placeholder: expertPlaceholder,
    };
  }

  if (!snapshot.roles.length) {
    const roles = suggestRoles(snapshot.company.summary || snapshot.company.name);
    const custom = parseRoleList(lastUser);
    const nextRoles = custom.length ? custom : roles;
    return {
      message: `I added ${uniqueTitles(nextRoles).join(", ")}.\n\nWho's your first expert?`,
      actions: nextRoles.map((r) => ({ type: "create_role" as const, ...r })),
      placeholder: expertPlaceholder,
    };
  }

  const nonOwnerMembers = snapshot.members.filter((m) => !m.isOwner && !m.newHire);
  const hasExpertSource = nonOwnerMembers.length > 0 || Boolean(snapshot.company?.ownerIsExpert);
  if (!hasExpertSource) {
    if (isSoloExpertClaim(lastUser, snapshot)) {
      return {
        message: "Got it — you'll capture as the expert. Which role is yours?",
        actions: [{ type: "owner_is_expert" }],
        options: uniqueTitles(snapshot.roles),
      };
    }

    // Prior turn left a name waiting for an email.
    if (snapshot.pendingExpertName) {
      const emailOnly = lastUser.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
      if (emailOnly && emailOnly.toLowerCase() !== snapshot.ownerEmail.toLowerCase()) {
        const defaultTitle =
          snapshot.roles.find((r) => r.competence === "expert")?.title ??
          snapshot.roles[0]?.title ??
          "Core role";
        return {
          message: `Added ${snapshot.pendingExpertName}. Which role is yours?`,
          actions: [
            {
              type: "create_member",
              name: snapshot.pendingExpertName,
              email: emailOnly,
              roleTitle: defaultTitle,
              competence: "expert",
            },
          ],
          options: uniqueTitles(snapshot.roles),
        };
      }
      if (emailOnly && emailOnly.toLowerCase() === snapshot.ownerEmail.toLowerCase()) {
        return {
          message: "Got it — you'll capture as the expert. Which role is yours?",
          actions: [{ type: "owner_is_expert" }],
          options: uniqueTitles(snapshot.roles),
        };
      }
      return {
        message: `What's ${snapshot.pendingExpertName}'s work email?`,
        actions: [],
        placeholder: `${snapshot.pendingExpertName.split(/\s+/)[0]?.toLowerCase() || "sam"}@${domainFromEmail(snapshot.ownerEmail)}`,
      };
    }

    const parsed = parseMembers(lastUser, snapshot);
    if (parsed.length) {
      return {
        message: `Added ${parsed.map((p) => p.name).join(" and ")}. Which role is yours?`,
        actions: parsed.map((p) => ({ type: "create_member" as const, ...p })),
        options: uniqueTitles(snapshot.roles),
      };
    }

    const nameOnly = parseExpertNameOnly(lastUser, snapshot);
    if (nameOnly) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("mira-pending-expert", nameOnly);
      }
      return {
        message: `What's ${nameOnly}'s work email?`,
        actions: [],
        placeholder: `${nameOnly.split(/\s+/)[0]?.toLowerCase() || "sam"}@${domainFromEmail(snapshot.ownerEmail)}`,
      };
    }

    return {
      message: "Who's your first expert? Name them, or say it's just you.",
      actions: [],
      placeholder: expertPlaceholder,
    };
  }

  const owner = snapshot.members.find((m) => m.isOwner);
  if (owner && !owner.roleTitle) {
    const resolved = resolveOwnerRole(lastUser, snapshot.roles);
    if (!resolved) {
      return {
        message: "Which role is yours? Tap a chip, or say it in your own words (founder, specialist…).",
        actions: [],
        options: uniqueTitles(snapshot.roles),
      };
    }
    return {
      message: `All set — you're **${resolved.title}**.`,
      actions: [
        ...resolved.createRoles,
        {
          type: "assign_owner_role",
          roleTitle: resolved.title,
          competence: resolved.competence,
        },
        { type: "complete_onboarding" },
      ],
      done: true,
    };
  }

  return {
    message: "You're already set up.",
    actions: [{ type: "complete_onboarding" }],
    done: true,
  };
}

function parseCompanyLine(text: string): { name: string; summary: string } {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const dash = cleaned.split(/\s+[—\-–:]\s+/);
  if (dash.length >= 2) {
    return { name: dash[0].trim(), summary: dash.slice(1).join(" — ").trim() };
  }
  const named = cleaned.match(/^(.+?)\s+(?:is|does|we(?:'re| are))\s+(.+)$/i);
  if (named) {
    return { name: named[1].trim(), summary: named[2].trim() };
  }
  const words = cleaned.split(" ");
  if (words.length > 4) {
    return { name: words.slice(0, 3).join(" "), summary: cleaned };
  }
  return { name: cleaned || "My company", summary: cleaned };
}

/** Build the same essentials the coach collects, for the manual form path. */
export function buildManualSetupActions(input: {
  companyName: string;
  summary: string;
  expertName: string;
  expertEmail: string;
  ownerEmail?: string;
  ownerRoleTitle?: string;
}): OnboardingAction[] {
  const name = input.companyName.trim();
  const summary = input.summary.trim();
  const expertName = input.expertName.trim();
  const expertEmail = input.expertEmail.trim();
  if (!name || !expertName || !expertEmail) return [];

  const roles = suggestRoles(summary || name);
  const expertRole =
    roles.find((r) => r.competence === "expert")?.title ?? roles[0]?.title ?? "Core role";

  if (input.ownerEmail && expertEmail.toLowerCase() === input.ownerEmail.trim().toLowerCase()) {
    return [
      { type: "create_company", name, summary: summary || undefined },
      ...roles.map((r) => ({ type: "create_role" as const, ...r })),
      { type: "owner_is_expert" },
      { type: "assign_owner_role", roleTitle: expertRole, competence: "expert" },
      { type: "complete_onboarding" },
    ];
  }

  const ownerRole =
    input.ownerRoleTitle?.trim() ||
    roles.find((r) => r.competence === "mid")?.title ||
    expertRole;

  return [
    { type: "create_company", name, summary: summary || undefined },
    ...roles.map((r) => ({ type: "create_role" as const, ...r })),
    {
      type: "create_member",
      name: expertName,
      email: expertEmail,
      roleTitle: expertRole,
      competence: "expert",
    },
    { type: "assign_owner_role", roleTitle: ownerRole },
    { type: "complete_onboarding" },
  ];
}

export function suggestRoles(hint: string): {
  title: string;
  seniority: number;
  competence: Competence;
}[] {
  const h = hint.toLowerCase();
  if (/sales|revenue|pipeline|\bae\b|sdr/.test(h)) {
    return [
      { title: "Account executive", seniority: 4, competence: "expert" },
      { title: "Account executive", seniority: 1, competence: "junior" },
      { title: "Sales development", seniority: 3, competence: "mid" },
    ];
  }
  if (/success|support|\bcs\b|customer/.test(h)) {
    return [
      { title: "Customer success", seniority: 4, competence: "expert" },
      { title: "Customer success", seniority: 1, competence: "junior" },
      { title: "Support", seniority: 3, competence: "mid" },
    ];
  }
  if (/ops|operations|logistics|dispatch/.test(h)) {
    return [
      { title: "Operations", seniority: 4, competence: "expert" },
      { title: "Operations", seniority: 1, competence: "junior" },
      { title: "Coordinator", seniority: 2, competence: "mid" },
    ];
  }
  if (/\bap\b|accounts payable|invoice|finance|controller/.test(h)) {
    return [
      { title: "Accounts payable", seniority: 4, competence: "expert" },
      { title: "Accounts payable", seniority: 1, competence: "junior" },
      { title: "Controller", seniority: 3, competence: "mid" },
    ];
  }
  return [
    { title: "Core role", seniority: 4, competence: "expert" },
    { title: "Core role", seniority: 1, competence: "junior" },
    { title: "Specialist", seniority: 3, competence: "mid" },
  ];
}

function parseRoleList(text: string): {
  title: string;
  seniority: number;
  competence: Competence;
}[] {
  const parts = text
    .split(/[,;\n]/)
    .map((p) => p.replace(/^[•\-\d.]+\s*/, "").trim())
    .filter(Boolean)
    .filter((p) => !/^(yes|ok|sure|no)$/i.test(p));
  if (parts.length < 1) return [];
  return parts.slice(0, 4).flatMap((title, i) => {
    const base = title.replace(/\s*\(.*\)\s*$/, "").trim();
    if (!base) return [];
    if (i === 0) {
      return [
        { title: base, seniority: 4, competence: "expert" as Competence },
        { title: base, seniority: 1, competence: "junior" as Competence },
      ];
    }
    return [{ title: base, seniority: 3, competence: "mid" as Competence }];
  });
}

function parseMembers(
  text: string,
  snapshot: OnboardingSnapshot,
): { name: string; email: string; roleTitle: string; competence?: Competence }[] {
  const lines = text.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  const chunks = lines.length > 1 ? lines : text.split(/\s+and\s+/i);
  const defaultTitle =
    snapshot.roles.find((r) => r.competence === "expert")?.title ??
    snapshot.roles[0]?.title ??
    "Core role";
  const out: { name: string; email: string; roleTitle: string; competence?: Competence }[] = [];

  for (const chunk of chunks) {
    const emailMatch = chunk.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (!emailMatch) continue;
    const email = emailMatch[0];
    if (email.toLowerCase() === snapshot.ownerEmail.toLowerCase()) continue;
    const withoutEmail = chunk.replace(email, " ").replace(/[,\-–]/g, " ").replace(/\s+/g, " ").trim();
    const roleHit = matchRoleTitle(withoutEmail, [...new Set(snapshot.roles.map((r) => r.title))]);
    let name = withoutEmail;
    if (roleHit) {
      name = withoutEmail.replace(new RegExp(roleHit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "").trim();
    }
    name = name.replace(/\b(expert|junior|mid)\b/gi, "").trim() || email.split("@")[0];
    out.push({
      name,
      email,
      roleTitle: roleHit ?? defaultTitle,
      competence: "expert",
    });
    if (out.length >= 2) break;
  }
  return out;
}

/** Spoken answers like "just me", "I'm the only employee", "it's me Jacob". */
export function isSoloExpertClaim(text: string, snapshot: OnboardingSnapshot): boolean {
  const lower = text.toLowerCase().replace(/[“”"]/g, "");
  if (
    /\b(just me|only me|only one|solo|no (other )?teammates?|no one else|i'?m the (only )?(one|expert|employee)|it'?s (only )?me|pick (it|me) up)\b/.test(
      lower,
    )
  ) {
    return true;
  }
  const ownerFirst = snapshot.ownerName.split(/\s+/)[0]?.toLowerCase();
  if (
    ownerFirst &&
    ownerFirst.length > 1 &&
    lower.includes(ownerFirst) &&
    /\b(me|i am|i'?m|it'?s|myself)\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

/** Name without email — voice often gives this first. */
export function parseExpertNameOnly(text: string, snapshot: OnboardingSnapshot): string | null {
  const cleaned = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
    .replace(
      /\b(my|the|first|expert|employee|teammate|colleague|add|please|name is|it'?s|called|named|who'?s|your|exercise)\b/gi,
      " ",
    )
    .replace(/[,?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 2) return null;
  if (isSoloExpertClaim(text, snapshot)) return null;
  // 1–4 tokens that look like a person name
  if (!/^[A-Za-z][A-Za-z\s\-']{1,40}$/.test(cleaned)) return null;
  const words = cleaned.split(/\s+/);
  if (words.length < 1 || words.length > 4) return null;
  if (words.every((w) => w.length < 2)) return null;
  return words.map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function matchRoleTitle(text: string, titles: string[]): string | null {
  const lower = text.toLowerCase();
  const exact = titles.find((t) => lower.includes(t.toLowerCase()));
  if (exact) return exact;
  for (const t of titles) {
    const words = t.toLowerCase().split(/\s+/);
    if (words.every((w) => lower.includes(w))) return t;
  }
  return null;
}

/** Map spoken answers like "I'm the founder" onto a work role (create if needed). */
export function resolveOwnerRole(
  text: string,
  roles: { title: string; seniority: number; competence: Competence }[],
): {
  title: string;
  competence?: Competence;
  createRoles: Extract<OnboardingAction, { type: "create_role" }>[];
} | null {
  if (!text.trim()) return null;
  const titles = [...new Set(roles.map((r) => r.title))];
  const direct = matchRoleTitle(text, titles);
  if (direct) {
    const role = roles.find((r) => r.title === direct);
    return { title: direct, competence: role?.competence, createRoles: [] };
  }

  const lower = text.toLowerCase();
  const expert =
    roles.find((r) => r.competence === "expert") ??
    roles.slice().sort((a, b) => b.seniority - a.seniority)[0];

  if (/\b(founder|co-?founder|ceo|owner|boss|principal|managing director)\b/.test(lower)) {
    if (expert) {
      return { title: expert.title, competence: expert.competence, createRoles: [] };
    }
    return {
      title: "Founder",
      competence: "expert",
      createRoles: [{ type: "create_role", title: "Founder", seniority: 5, competence: "expert" }],
    };
  }

  if (/\b(specialist|special)\b/.test(lower)) {
    const specialist = titles.find((t) => /special/i.test(t));
    if (specialist) {
      const role = roles.find((r) => r.title === specialist);
      return { title: specialist, competence: role?.competence, createRoles: [] };
    }
  }

  if (/\b(core|main|primary)\b/.test(lower)) {
    const core = titles.find((t) => /core/i.test(t));
    if (core) {
      const role = roles.find((r) => r.title === core);
      return { title: core, competence: role?.competence, createRoles: [] };
    }
  }

  // "I am a product manager" → create that title if nothing matches
  const asRole = lower.match(
    /\b(?:i(?:'m| am)|my role is|work as(?: a| an)?)\s+([a-z][a-z\s\-/]{2,40})$/i,
  );
  if (asRole?.[1]) {
    const title = asRole[1]
      .replace(/\b(of the company|here|now)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    if (title.length >= 3 && title.length <= 48) {
      const existing = matchRoleTitle(title, titles);
      if (existing) {
        const role = roles.find((r) => r.title === existing);
        return { title: existing, competence: role?.competence, createRoles: [] };
      }
      return {
        title,
        competence: "expert",
        createRoles: [{ type: "create_role", title, seniority: 4, competence: "expert" }],
      };
    }
  }

  return null;
}

function domainFromEmail(email: string): string {
  return email.split("@")[1] || "company.com";
}
