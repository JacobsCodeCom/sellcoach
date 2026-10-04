import { isBlockedProperty } from "./allowlist";
import {
  extractMulti,
  extractPlain,
  findProperty,
  type NotionPage,
  type NotionProperty,
} from "./client";

export type NormalizedNotionPerson = {
  externalId: string;
  externalUrl?: string;
  name: string;
  email?: string;
  roleText?: string;
  area?: string;
  jobRoles: string[];
  workSummaries: string[];
};

export type NormalizedNotionTopic = {
  externalId: string;
  externalUrl?: string;
  title: string;
  summary: string;
  source: "notion_page" | "assignment" | "profile";
  suggestedArea?: string;
  suggestedRoleTitle?: string;
  personExternalId?: string;
};

function propMap(properties: Record<string, NotionProperty>): Record<string, NotionProperty> {
  const out: Record<string, NotionProperty> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (isBlockedProperty(key)) continue;
    out[key] = value;
  }
  return out;
}

export function normalizeNotionPerson(page: NotionPage): NormalizedNotionPerson | null {
  const properties = propMap(page.properties);
  const name = extractPlain(findProperty(properties, ["Namn", "Name", "Title"]));
  if (!name) return null;

  const peopleProp = findProperty(properties, ["Användare", "Person", "User"]);
  const emailProp = findProperty(properties, ["Email", "E-post"]);
  let email = extractPlain(emailProp);
  if (!email && peopleProp?.type === "people") {
    email = (peopleProp.people || []).map((p) => p.person?.email).find(Boolean) || "";
  }

  const roleText = extractPlain(findProperty(properties, ["Roll", "Role"])) || undefined;
  const area = extractPlain(findProperty(properties, ["Area"])) || undefined;
  const jobRoles = extractMulti(findProperty(properties, ["Job roles", "Job role"]));

  const workSummaries = [
    extractPlain(findProperty(properties, ["Profile Eng"])),
    extractPlain(findProperty(properties, ["Profile Swe"])),
    extractPlain(findProperty(properties, ["Sample pitch (Eng)"])),
    extractPlain(findProperty(properties, ["Sample pitch (Swe)"])),
  ].filter(Boolean);

  return {
    externalId: page.id.replace(/-/g, ""),
    externalUrl: page.url,
    name,
    email: email || undefined,
    roleText,
    area,
    jobRoles,
    workSummaries,
  };
}

export function topicsFromPerson(person: NormalizedNotionPerson): NormalizedNotionTopic[] {
  const topics: NormalizedNotionTopic[] = [];
  if (person.workSummaries.length) {
    topics.push({
      externalId: `profile:${person.externalId}`,
      externalUrl: person.externalUrl,
      title: `${person.name}'s work profile`,
      summary: person.workSummaries.slice(0, 2).join(" "),
      source: "profile",
      suggestedArea: person.area,
      suggestedRoleTitle: person.jobRoles[0] || person.roleText,
      personExternalId: person.externalId,
    });
  }
  if (person.area) {
    topics.push({
      externalId: `area:${person.area}:${person.jobRoles[0] || person.roleText || "role"}`,
      title: `How ${person.area} work is done`,
      summary: `Capture a real session showing how ${person.area} teammates (${person.jobRoles.join(", ") || person.roleText || "this role"}) get work done.`,
      source: "assignment",
      suggestedArea: person.area,
      suggestedRoleTitle: person.jobRoles[0] || person.roleText,
      personExternalId: person.externalId,
    });
  }
  return topics;
}

export function normalizeKnowledgePage(
  page: NotionPage,
  bodyLines: string[],
): NormalizedNotionTopic | null {
  const properties = propMap(page.properties);
  const title =
    extractPlain(findProperty(properties, ["Name", "Namn", "Title"])) ||
    extractPlain(Object.values(properties).find((p) => p.type === "title")) ||
    "Untitled page";
  const summary = bodyLines.slice(0, 3).join(" ").trim() || `Process knowledge: ${title}`;
  return {
    externalId: page.id.replace(/-/g, ""),
    externalUrl: page.url,
    title,
    summary,
    source: "notion_page",
  };
}

export const DEMO_NOTION_SYNC = {
  workspaceName: "Demo workspace",
  peopleDatabaseId: "demo-employees",
  knowledgeSourceIds: ["demo-playbook"] as string[],
  people: [
    {
      externalId: "demo_alice",
      name: "Alice Berg",
      email: "alice@demo.local",
      roleText: "Tech lead",
      area: "Frontend",
      jobRoles: ["Senior web developer"],
      workSummaries: [
        "Leads frontend delivery, code review standards, and client workshop facilitation.",
      ],
    },
    {
      externalId: "demo_ben",
      name: "Ben Holm",
      email: "ben@demo.local",
      roleText: "Backend developer",
      area: "Backend",
      jobRoles: ["Back end developer"],
      workSummaries: ["Owns API design, integrations, and production incident triage."],
    },
    {
      externalId: "demo_cara",
      name: "Cara Nyström",
      email: "cara@demo.local",
      roleText: "Junior consultant",
      area: "Frontend",
      jobRoles: ["Front end developer"],
      workSummaries: ["New hire focusing on React delivery and design-system usage."],
    },
  ],
  topics: [
    {
      externalId: "demo_playbook_discovery",
      title: "Client discovery workshop",
      summary: "How we run a first discovery workshop: agenda, stakeholders, and follow-up notes.",
      source: "notion_page" as const,
      suggestedArea: "Frontend",
      suggestedRoleTitle: "Senior web developer",
    },
    {
      externalId: "demo_playbook_incident",
      title: "Production incident response",
      summary: "How backend experts triage, communicate, and close production incidents.",
      source: "notion_page" as const,
      suggestedArea: "Backend",
      suggestedRoleTitle: "Back end developer",
    },
  ],
};
