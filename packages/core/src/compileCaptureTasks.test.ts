import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileCaptureTasks, suggestRoleFromNotion } from "./compileCaptureTasks";
import type { ExternalPerson, KnowledgeTopic, Membership, WorkRole } from "./types";

describe("suggestRoleFromNotion", () => {
  it("maps senior titles to expert", () => {
    const s = suggestRoleFromNotion({ jobRoles: ["Senior web developer"], area: "Frontend" });
    assert.equal(s.competence, "expert");
    assert.ok(s.seniority >= 3);
  });

  it("maps junior titles to junior", () => {
    const s = suggestRoleFromNotion({ roleText: "Junior consultant", jobRoles: ["Front end developer"] });
    assert.equal(s.competence, "junior");
  });
});

describe("compileCaptureTasks", () => {
  const companyId = "co1";
  const expertRole: WorkRole = {
    id: "wr1",
    companyId,
    title: "Senior web developer",
    seniority: 4,
    competence: "expert",
    createdAt: 1,
  };
  const membership: Membership = {
    id: "mem1",
    userId: "u1",
    companyId,
    platformRole: "member",
    workRoleId: expertRole.id,
    createdAt: 1,
  };
  const person: ExternalPerson = {
    id: "exp1",
    companyId,
    connectionId: "int1",
    provider: "notion",
    externalId: "n1",
    name: "Alice",
    area: "Frontend",
    jobRoles: ["Senior web developer"],
    workSummaries: ["Leads workshops"],
    membershipId: membership.id,
    adminStatus: "linked",
    updatedAt: 1,
  };
  const topic: KnowledgeTopic = {
    id: "topic1",
    companyId,
    connectionId: "int1",
    provider: "notion",
    externalId: "p1",
    title: "Client discovery workshop",
    summary: "How we run discovery",
    source: "notion_page",
    suggestedArea: "Frontend",
    suggestedRoleTitle: "Senior web developer",
    updatedAt: 1,
  };

  it("creates todo tasks for uncovered topics", () => {
    const tasks = compileCaptureTasks({
      companyId,
      memberships: [membership],
      workRoles: [expertRole],
      people: [person],
      topics: [topic],
      lessons: [],
      captures: [],
      previous: [],
    });
    assert.ok(tasks.some((t) => t.title === topic.title && t.status === "todo"));
  });

  it("skips topics covered by active lessons", () => {
    const tasks = compileCaptureTasks({
      companyId,
      memberships: [membership],
      workRoles: [expertRole],
      people: [person],
      topics: [topic],
      lessons: [
        {
          id: "les1",
          companyId,
          sourceCaptureId: "cap1",
          sourceMemberId: membership.id,
          sourceWorkRoleId: expertRole.id,
          title: "Client discovery workshop",
          summary: "Covered",
          prompt: "x",
          passCriteria: "y",
          orderHint: 0,
          status: "active",
          createdAt: 1,
          kind: "workmap",
        },
      ],
      captures: [],
      previous: [],
    });
    assert.equal(tasks.some((t) => t.title === topic.title), false);
  });
});
