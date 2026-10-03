import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileLessonsFromCapture, mergeLessonPool } from "./compileLessons";
import { compileRoadmapForMember, advanceRoadmapItem } from "./compileRoadmap";
import type { CaptureSession, Lesson, Membership, WorkRole } from "./types";

const companyId = "co_1";

const expertRole: WorkRole = {
  id: "wr_exp",
  companyId,
  title: "Dispatcher",
  seniority: 5,
  competence: "expert",
  createdAt: 1,
};

const hireRole: WorkRole = {
  id: "wr_hire",
  companyId,
  title: "Dispatcher",
  seniority: 1,
  competence: "junior",
  createdAt: 2,
};

const hireMembership: Membership = {
  id: "mem_hire",
  userId: "u_hire",
  companyId,
  platformRole: "member",
  workRoleId: hireRole.id,
  createdAt: 3,
};

function sampleSession(): CaptureSession {
  return {
    id: "cap_1",
    companyId,
    memberId: "mem_exp",
    workRoleId: expertRole.id,
    startedAt: 10,
    endedAt: 20,
    events: [],
    teachBacks: [],
    guardrails: [
      {
        id: "gr_1",
        label: "Cold chain hold",
        ruleText: "Pharma dry vans must be held or escalated.",
        sourceEventIds: [],
        confirmed: true,
      },
      {
        id: "gr_2",
        label: "Friday Nordwerk",
        ruleText: "No Friday Nordwerk assign without a note.",
        sourceEventIds: [],
        confirmed: true,
      },
    ],
    mapSteps: [
      {
        id: "s1",
        title: "Cold chain",
        summary: "Watch pharma.",
        order: 0,
        guardrailIds: ["gr_1"],
      },
      {
        id: "s2",
        title: "Friday rule",
        summary: "Nordwerk Fridays.",
        order: 1,
        guardrailIds: ["gr_2"],
      },
    ],
  };
}

describe("compileLessonsFromCapture", () => {
  it("builds lessons from confirmed guardrails", () => {
    const lessons = compileLessonsFromCapture(sampleSession(), 100);
    assert.equal(lessons.length, 2);
    assert.equal(lessons[0].title, "Cold chain hold");
    assert.match(lessons[0].prompt, /Cold chain hold/);
    assert.equal(lessons[0].sourceWorkRoleId, expertRole.id);
  });
});

describe("compileRoadmapForMember", () => {
  it("attaches expert lessons to a junior with the same title", () => {
    const lessons = compileLessonsFromCapture(sampleSession(), 100);
    const roadmap = compileRoadmapForMember({
      membership: hireMembership,
      memberWorkRole: hireRole,
      companyRoles: [expertRole, hireRole],
      lessons,
      now: 200,
    });
    assert.equal(roadmap.items.length, 2);
    assert.equal(roadmap.items[0].status, "available");
    assert.equal(roadmap.items[1].status, "locked");
  });

  it("preserves done progress when recompiling", () => {
    const lessons = compileLessonsFromCapture(sampleSession(), 100);
    let roadmap = compileRoadmapForMember({
      membership: hireMembership,
      memberWorkRole: hireRole,
      companyRoles: [expertRole, hireRole],
      lessons,
    });
    roadmap = advanceRoadmapItem(roadmap, roadmap.items[0].lessonId, "done");
    const again = compileRoadmapForMember({
      membership: hireMembership,
      memberWorkRole: hireRole,
      companyRoles: [expertRole, hireRole],
      lessons,
      previous: roadmap,
    });
    assert.equal(again.items[0].status, "done");
    assert.equal(again.items[1].status, "available");
  });

  it("ignores lessons from a different job title", () => {
    const lessons: Lesson[] = compileLessonsFromCapture(sampleSession(), 100);
    const warehouse: WorkRole = {
      ...expertRole,
      id: "wr_wh",
      title: "Warehouse lead",
    };
    const warehouseLessons = lessons.map((l) => ({ ...l, sourceWorkRoleId: warehouse.id }));
    const roadmap = compileRoadmapForMember({
      membership: hireMembership,
      memberWorkRole: hireRole,
      companyRoles: [warehouse, hireRole],
      lessons: mergeLessonPool([], warehouseLessons),
    });
    assert.equal(roadmap.items.length, 0);
  });
});
