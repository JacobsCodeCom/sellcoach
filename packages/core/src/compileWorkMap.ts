import { createId } from "./id";
import { ruleLabelFromAnswer } from "./transcript";
import type { CaptureSession, GuardrailDraft, MapStepDraft, TeachBack } from "./types";

/**
 * Build map steps from confirmed teach-backs / guardrails in a capture session.
 */
export function compileWorkMapFromTeachBacks(
  session: Pick<CaptureSession, "teachBacks" | "guardrails" | "mapSteps" | "events">,
): { guardrails: GuardrailDraft[]; mapSteps: MapStepDraft[] } {
  const confirmedTeachBacks = session.teachBacks.filter((t) => t.confirmed && t.answer.trim());

  const guardrails: GuardrailDraft[] = confirmedTeachBacks.map((tb, index) => {
    const answer = tb.answer.trim();
    const label =
      (tb.ruleLabel || ruleLabelFromAnswer(answer) || shortLabel(tb.prompt) || `Guardrail ${index + 1}`).trim();
    const existing = session.guardrails.find(
      (g) => g.id === tb.id || g.label === label || g.ruleText === answer,
    );
    if (existing?.confirmed && existing.ruleText === answer) {
      return { ...existing, label: tb.ruleLabel?.trim() || existing.label };
    }
    return {
      id: existing?.id ?? createId("gr"),
      label,
      ruleText: answer,
      sourceEventIds: [],
      confirmed: true,
    };
  });

  // Keep any already-confirmed guardrails not covered by teach-backs
  for (const g of session.guardrails) {
    if (g.confirmed && !guardrails.some((x) => x.id === g.id)) {
      guardrails.push(g);
    }
  }

  const mapSteps: MapStepDraft[] = guardrails.map((g, order) => ({
    id: createId("step"),
    title: g.label,
    summary: g.ruleText,
    order,
    guardrailIds: [g.id],
  }));

  return { guardrails, mapSteps };
}

function shortLabel(prompt: string): string {
  const cleaned = prompt.replace(/\?+$/, "").trim();
  if (cleaned.length <= 48) return cleaned;
  return `${cleaned.slice(0, 45)}…`;
}

export function appendTeachBack(
  teachBacks: TeachBack[],
  input: Omit<TeachBack, "id"> & { id?: string },
): TeachBack[] {
  const next: TeachBack = {
    id: input.id ?? createId("tb"),
    prompt: input.prompt,
    answer: input.answer,
    confirmed: input.confirmed,
    ruleLabel: input.ruleLabel,
  };
  return [...teachBacks, next];
}
