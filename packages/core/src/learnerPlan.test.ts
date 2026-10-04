import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLearnerPlan,
  estimateLessonMinutes,
  estimateWorkMapMinutes,
  formatRemainingMinutes,
  RULE_LESSON_MINUTES,
  whyAssigned,
} from "./learnerPlan";
import type { Lesson, Roadmap, WorkRole } from "./types";

const companyId = "co_1";

const expertRole: WorkRole = {
  id: "wr_exp",
  companyId,
  title: "Customer success",
  seniority: 4,
  competence: "expert",
  createdAt: 1,
};

const hireRole: WorkRole = {
  id: "wr_hire",
  companyId,
  title: "Customer success",
  seniority: 1,
  competence: "junior",
  createdAt: 2,
};

function lesson(partial: Partial<Lesson> & Pick<Lesson, "id" | "title">): Lesson {
  return {
    companyId,
    sourceCaptureId: "cap_1",
    sourceMemberId: "mem_exp",
    sourceWorkRoleId: expertRole.id,
    summary: "3 steps",
    prompt: "Walk through",
    passCriteria: "rules",
    orderHint: 0,
    status: "active",
    createdAt: 10,
    kind: "workmap",
    estimateMinutes: 15,
    ...partial,
  };
}

describe("estimateWorkMapMinutes", () => {
  it("uses steps and judgment calls with a floor", () => {
    assert.equal(estimateWorkMapMinutes(1, 0), 5);
    assert.equal(estimateWorkMapMinutes(5, 2), 19);
  });
});

describe("estimateLessonMinutes", () => {
  it("prefers stored estimate and falls back for legacy lessons", () => {
    assert.equal(estimateLessonMinutes(lesson({ id: "a", title: "A", estimateMinutes: 12 })), 12);
    assert.equal(
      estimateLessonMinutes(lesson({ id: "b", title: "B", estimateMinutes: undefined })),
      RULE_LESSON_MINUTES,
    );
  });
});

describe("whyAssigned", () => {
  it("explains same-role higher-level match", () => {
    assert.equal(
      whyAssigned({ expertName: "Anna", expertRole, learnerRole: hireRole }),
      "From Anna · expert Customer success — same role, higher level than you",
    );
  });

  it("falls back when roles are missing", () => {
    assert.equal(whyAssigned({ expertName: "Anna" }), "From Anna");
  });
});

describe("buildLearnerPlan", () => {
  it("orders rows, totals time, and picks the next lesson", () => {
    const lessons = [
      lesson({ id: "les_1", title: "Intake", orderHint: 1, estimateMinutes: 10 }),
      lesson({ id: "les_2", title: "Escalation", orderHint: 2, estimateMinutes: 20 }),
    ];
    const roadmap: Roadmap = {
      id: "rm_1",
      companyId,
      membershipId: "mem_hire",
      workRoleId: hireRole.id,
      updatedAt: 1,
      items: [
        { lessonId: "les_1", order: 0, status: "done" },
        { lessonId: "les_2", order: 1, status: "available" },
      ],
    };

    const plan = buildLearnerPlan({
      roadmap,
      lessons,
      learnerRole: hireRole,
      memberships: [{ id: "mem_exp", userId: "u_anna" }],
      users: [{ id: "u_anna", name: "Anna" }],
      workRoles: [expertRole, hireRole],
    });

    assert.equal(plan.totalCount, 2);
    assert.equal(plan.doneCount, 1);
    assert.equal(plan.totalMinutes, 30);
    assert.equal(plan.remainingMinutes, 20);
    assert.equal(plan.next?.lessonId, "les_2");
    assert.match(plan.rows[1].why, /same role, higher level/);
    assert.equal(formatRemainingMinutes(plan.remainingMinutes), "About 20 min left");
  });
});
