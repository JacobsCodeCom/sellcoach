import {
  localDryRunPlan,
  normalizeActionIntents,
  redactDeep,
  type WorkMap,
} from "@mira/core";
import { askJson } from "@/lib/llm";

export const runtime = "nodejs";

const SYSTEM = `You are planning how a digital worker would perform a task captured as a Work Map.
Produce a dry-run ActionPlan: ordered semantic intents (not mouse coordinates).
Kinds:
- observe: read/check something on screen
- act: do a concrete UI/workflow action
- decide: judgment call using the expert's reason
- ask_human: stop and ask a person (use for stop_and_ask guardrails or uncertain judgment)
- stop: hard limit — do not proceed past this rule

Rules:
- Follow Work Map step order. Reference real step ids and guardrail ids when relevant.
- Honor every guardrail. Prefer ask_human over guessing when the map says stop_and_ask.
- Include ability notes and extraGuardrails as stop/ask_human intents when they apply.
- If run context is given, tailor titles/details to that situation without inventing facts outside the map.
- Keep titles short; details 1–2 sentences.

Return JSON: {"summary": string, "intents": [{"kind": "observe"|"act"|"decide"|"ask_human"|"stop", "title": string, "detail": string, "workMapStepId": string|null, "guardrailIds": string[]}]}`;

type Body = {
  workMap?: WorkMap;
  abilityName?: string;
  notes?: string;
  extraGuardrails?: string[];
  trigger?: string;
  triggerDescription?: string;
  context?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const map = body.workMap;
  if (!map?.steps?.length) return Response.json({ error: "workMap required" }, { status: 400 });

  const notes = String(body.notes || "").slice(0, 1000);
  const extraGuardrails = (body.extraGuardrails || [])
    .map((g) => String(g).trim())
    .filter(Boolean)
    .slice(0, 12);
  const context = String(body.context || "").slice(0, 1500);
  const fallback = localDryRunPlan(map, { notes, extraGuardrails, context });

  const lean = {
    title: map.title,
    steps: map.steps.map(({ momentId: _m, t: _t, ...s }) => s),
    guardrails: map.guardrails.map(({ momentId: _m, t: _t, ...g }) => g),
  };

  const out = (await askJson({
    system: SYSTEM,
    user: redactDeep({
      abilityName: body.abilityName || map.title,
      notes,
      extraGuardrails,
      trigger: body.trigger || "manual",
      triggerDescription: body.triggerDescription || "",
      context,
      workMap: lean,
    }),
    maxTokens: 1600,
    timeoutMs: 35_000,
  })) as { summary?: unknown; intents?: unknown } | null;

  const intents = normalizeActionIntents(out?.intents, map);
  if (!intents.length) {
    return Response.json({ ...fallback, source: "local" });
  }

  const summary =
    typeof out?.summary === "string" && out.summary.trim()
      ? out.summary.trim().slice(0, 500)
      : fallback.summary;

  return Response.json({ summary, intents, source: "model" });
}
