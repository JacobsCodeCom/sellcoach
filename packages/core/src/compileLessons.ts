import { createId } from "./id";
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
    };
  });
}

/** Merge new lessons into a company pool, replacing prior lessons from the same capture. */
export function mergeLessonPool(existing: Lesson[], incoming: Lesson[]): Lesson[] {
  const captureIds = new Set(incoming.map((l) => l.sourceCaptureId));
  const kept = existing.filter((l) => !captureIds.has(l.sourceCaptureId));
  return [...kept, ...incoming].sort((a, b) => a.orderHint - b.orderHint || a.createdAt - b.createdAt);
}
