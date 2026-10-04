import { createId } from "./id";
import { estimateWorkMapMinutes, RULE_LESSON_MINUTES } from "./learnerPlan";
import { ruleLabelFromAnswer } from "./transcript";
import type { CaptureSession, Lesson } from "./types";

/**
 * Turn confirmed guardrails (and map steps that reference them) into active lessons.
 * Domain-agnostic: titles/prompts come from capture text, not vertical hard-codes.
 */
export function compileLessonsFromCapture(session: CaptureSession, now = Date.now()): Lesson[] {
  const confirmed = session.guardrails.filter((g) => g.confirmed && g.ruleText.trim());
  if (confirmed.length === 0) return [];

  const stepByGuardrail = new Map<string, { title: string; summary: string; order: number }>();
  for (const step of session.mapSteps) {
    for (const gid of step.guardrailIds) {
      if (!stepByGuardrail.has(gid)) {
        stepByGuardrail.set(gid, {
          title: step.title,
          summary: step.summary,
          order: step.order,
        });
      }
    }
  }

  return confirmed.map((g, index) => {
    const step = stepByGuardrail.get(g.id);
    const rule = g.ruleText.trim();
    const title =
      g.label.trim() ||
      step?.title?.trim() ||
      ruleLabelFromAnswer(rule) ||
      `Rule ${index + 1}`;
    const summary = step?.summary?.trim() || rule;
    return {
      id: createId("les"),
      companyId: session.companyId,
      sourceCaptureId: session.id,
      sourceMemberId: session.memberId,
      sourceWorkRoleId: session.workRoleId,
      title,
      summary,
      prompt: `Explain the rule: ${title}. When does it apply, and what do you do?`,
      passCriteria: rule,
      orderHint: step?.order ?? index,
      status: "active" as const,
      createdAt: now,
      kind: "rule" as const,
      estimateMinutes: RULE_LESSON_MINUTES,
    };
  });
}

/** One lesson for a whole confirmed Work Map: the learner walks the steps, then practises its guardrails. */
export function compileLessonFromWorkMap(session: CaptureSession, now = Date.now()): Lesson | null {
  const map = session.workMap;
  if (!map || !map.steps.length) return null;
  const judgment = map.steps.filter((s) => s.isJudgmentCall).length;
  const parts = [
    `${map.steps.length} ${map.steps.length === 1 ? "step" : "steps"}`,
    judgment ? `${judgment} judgment ${judgment === 1 ? "call" : "calls"}` : "",
    map.guardrails.length ? `${map.guardrails.length} ${map.guardrails.length === 1 ? "rule" : "rules"}` : "",
  ].filter(Boolean);
  return {
    id: createId("les"),
    companyId: session.companyId,
    sourceCaptureId: session.id,
    sourceMemberId: session.memberId,
    sourceWorkRoleId: session.workRoleId,
    title: map.title,
    summary: parts.join(" · "),
    prompt: `Walk through ${map.title}, then handle cases you haven't seen.`,
    passCriteria: map.guardrails.map((g) => g.rule).join(" ") || map.steps.map((s) => s.title).join(", "),
    orderHint: session.startedAt,
    status: "active",
    createdAt: now,
    kind: "workmap",
    estimateMinutes: estimateWorkMapMinutes(map.steps.length, judgment),
  };
}

/** Merge new lessons into a company pool, replacing prior lessons from the same capture. */
export function mergeLessonPool(existing: Lesson[], incoming: Lesson[]): Lesson[] {
  const captureIds = new Set(incoming.map((l) => l.sourceCaptureId));
  const kept = existing.filter((l) => !captureIds.has(l.sourceCaptureId));
  return [...kept, ...incoming].sort((a, b) => a.orderHint - b.orderHint || a.createdAt - b.createdAt);
}
