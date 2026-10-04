import { createId } from "./id";
import type { ActionIntent, ActionIntentKind, WorkMap } from "./types";

const KINDS = new Set<ActionIntentKind>(["observe", "act", "decide", "ask_human", "stop"]);

function asKind(value: unknown): ActionIntentKind | null {
  return typeof value === "string" && KINDS.has(value as ActionIntentKind)
    ? (value as ActionIntentKind)
    : null;
}

/** Normalize model output into ActionIntents, dropping junk and unknown step ids. */
export function normalizeActionIntents(raw: unknown, map: WorkMap): ActionIntent[] {
  if (!Array.isArray(raw)) return [];
  const stepIds = new Set(map.steps.map((s) => s.id));
  const guardrailIds = new Set(map.guardrails.map((g) => g.id));
  const out: ActionIntent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const kind = asKind(row.kind);
    const title = String(row.title || "").trim();
    if (!kind || !title) continue;
    const stepId =
      typeof row.workMapStepId === "string" && stepIds.has(row.workMapStepId)
        ? row.workMapStepId
        : null;
    const gIds = Array.isArray(row.guardrailIds)
      ? row.guardrailIds.filter((id): id is string => typeof id === "string" && guardrailIds.has(id))
      : [];
    out.push({
      id: typeof row.id === "string" && row.id ? row.id : createId("ai"),
      kind,
      title: title.slice(0, 160),
      detail: String(row.detail || "").trim().slice(0, 800),
      workMapStepId: stepId,
      guardrailIds: gIds,
    });
  }
  return out;
}

/**
 * Offline dry-run plan: one intent per Work Map step, plus ask_human/stop for
 * stop_and_ask guardrails. Used when the model is unavailable.
 */
export function localDryRunPlan(
  map: WorkMap,
  opts?: { notes?: string; extraGuardrails?: string[]; context?: string },
): { summary: string; intents: ActionIntent[] } {
  const intents: ActionIntent[] = [];
  for (const step of map.steps) {
    const linked = map.guardrails.filter((g) => step.guardrailIds.includes(g.id));
    const kind: ActionIntentKind = step.isJudgmentCall ? "decide" : "act";
    intents.push({
      id: createId("ai"),
      kind,
      title: step.title,
      detail: [step.decision, step.reason ? `Because: ${step.reason}` : "", step.screen ? `Screen: ${step.screen}` : ""]
        .filter(Boolean)
        .join(" "),
      workMapStepId: step.id,
      guardrailIds: linked.map((g) => g.id),
    });
    for (const g of linked) {
      if (g.type === "stop_and_ask") {
        intents.push({
          id: createId("ai"),
          kind: "ask_human",
          title: `Check before continuing: ${g.rule}`,
          detail: g.quote || g.rule,
          workMapStepId: step.id,
          guardrailIds: [g.id],
        });
      } else if (g.type === "limit") {
        intents.push({
          id: createId("ai"),
          kind: "stop",
          title: `Do not exceed: ${g.rule}`,
          detail: g.quote || g.rule,
          workMapStepId: step.id,
          guardrailIds: [g.id],
        });
      }
    }
  }

  for (const extra of opts?.extraGuardrails || []) {
    const rule = extra.trim();
    if (!rule) continue;
    intents.push({
      id: createId("ai"),
      kind: "stop",
      title: `Extra rule: ${rule}`,
      detail: rule,
      workMapStepId: null,
      guardrailIds: [],
    });
  }

  const contextBit = opts?.context?.trim() ? ` Given: ${opts.context.trim().slice(0, 120)}.` : "";
  const notesBit = opts?.notes?.trim() ? ` Notes: ${opts.notes.trim().slice(0, 80)}.` : "";
  const summary = `Dry-run of "${map.title}" (${map.steps.length} steps, ${map.guardrails.length} guardrails).${contextBit}${notesBit}`;

  return { summary, intents };
}
