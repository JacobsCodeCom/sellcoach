import type { ActionName, Draft, Load, RuleId, Truck, Violation } from "./types";

export const FALLBACK: Record<RuleId, string> = {
  "alpine-weight": "Alpine lanes over 18 tonnes never go out with one driver.",
  "cold-chain":
    "Cold chain never rides a dry van just to save the window. Hold it and ask the planner.",
  "friday-nordwerk":
    "Nordwerk claims damage on every Friday delivery. An open Friday truck is still a no.",
};

export type GuardrailCheck = {
  status: "allow" | "blocked" | "uncovered";
  violation?: Violation;
  message?: string;
};

export function checkViolation(
  load: Load,
  draft: Draft,
  trucks: Truck[],
): Violation | null {
  const result = checkGuardrail({ load, draft, trucks, intent: "save" });
  return result.status === "blocked" ? result.violation ?? null : null;
}

export function checkGuardrail(input: {
  load: Load;
  draft: Draft;
  trucks: Truck[];
  intent?: "select" | "assign" | "save";
}): GuardrailCheck {
  const { load, draft, trucks } = input;
  const intent = input.intent ?? "save";
  const truck = trucks.find((item) => item.id === draft.truckId) ?? null;

  if (truck && load.customer === "Nordwerk" && truck.day === "Friday") {
    return {
      status: "blocked",
      violation: {
        ruleId: "friday-nordwerk",
        title: "Nordwerk does not leave on Friday",
        expertWords: FALLBACK["friday-nordwerk"],
        because: "The Friday truck wins the board. The rule still says no.",
        target: `truck:${truck.id}`,
      },
    };
  }

  if (truck && load.cargo === "pharma" && truck.type === "dry") {
    if (intent === "select" || draft.action === "assign" || intent === "save") {
      return {
        status: "blocked",
        violation: {
          ruleId: "cold-chain",
          title: "Cold chain never rides a dry van",
          expertWords: FALLBACK["cold-chain"],
          because: "The dry van makes the window. The temperature does not survive it.",
          target: `truck:${truck.id}`,
        },
      };
    }
  }

  if (
    load.alpine &&
    load.weightT > 18 &&
    draft.drivers < 2 &&
    (draft.action === "assign" || intent === "assign" || intent === "save")
  ) {
    return {
      status: "blocked",
      violation: {
        ruleId: "alpine-weight",
        title: "Alpine lanes over 18t need a second driver",
        expertWords: FALLBACK["alpine-weight"],
        because: "The form accepts one driver. The lane does not.",
        target: "drivers-inc",
      },
    };
  }

  if (
    intent === "assign" &&
    draft.action === "escalate" &&
    load.accept === "any" &&
    !load.alpine &&
    load.cargo !== "pharma" &&
    load.customer !== "Nordwerk"
  ) {
    return {
      status: "uncovered",
      message: "Sabine never covered this. I've flagged it for her.",
    };
  }

  return { status: "allow" };
}

export function isAcceptable(load: Load, draft: Draft, trucks: Truck[]) {
  if (!draft.action) return false;
  if (checkViolation(load, draft, trucks)) return false;
  if (load.accept === "any") return true;
  if (load.accept === "hold-or-escalate") {
    return draft.action === "hold" || draft.action === "escalate";
  }
  if (load.accept === "no-friday") {
    if (draft.action === "hold" || draft.action === "escalate") return true;
    const truck = trucks.find((item) => item.id === draft.truckId);
    return Boolean(truck && truck.day !== "Friday");
  }
  if (load.accept === "assign") {
    return (
      draft.action === "assign" &&
      draft.truckId === load.correctTruckId &&
      draft.drivers >= (load.correctDrivers ?? 1)
    );
  }
  return false;
}

export function nudgeFor(load: Load, expert: string) {
  if (load.alpine && load.weightT > 18) {
    return `${expert} would still send this. Add the second driver, then assign.`;
  }
  if (load.cargo === "pharma") {
    return `${expert} would hold this and escalate. The dry van is not a save.`;
  }
  if (load.customer === "Nordwerk") {
    return `${expert} would keep Nordwerk off a Friday truck. Hold it, or take a later day.`;
  }
  return `${expert} would not save it like that.`;
}

export function answerFor(
  lines: { questionId?: string; text: string; role: string; dropped?: boolean }[],
  debrief: Record<string, string>,
  id: string,
) {
  const live = [...lines]
    .reverse()
    .find((line) => line.role === "expert" && line.questionId === id && !line.dropped);
  const text = (live?.text || debrief[id] || "").trim();
  return text;
}

export function teachBack(input: {
  expert: string;
  debrief: Record<string, string>;
  lines: { questionId?: string; text: string; role: string; dropped?: boolean }[];
}) {
  const said = (id: string) => {
    const text = answerFor(input.lines, input.debrief, id);
    return text ? `In your words: “${text}”` : "That reason is not on the record yet.";
  };
  return [
    `${input.expert} opens the ticket and, on a penalty window, leaves the Suggested cheap truck for the higher lane score. ${said("lane-score")}`,
    `On an Alpine lane over 18 tonnes, ${input.expert} adds a second driver even though Suggested is one. ${said("alpine-limit")}`,
    `Cold chain does not go on a dry van to save the window. Hold and escalate. ${said("who-releases")}`,
    `Nordwerk does not leave on Friday, even when Suggested is the cheapest open slot. ${said("friday-nordwerk")}`,
    `At 18.0 exactly, or if the weight is missing: ${input.debrief["alpine-edge"] || "stop and ask."}`,
  ].join("\n\n");
}

export function shortTeachBack(expert: string, debrief: Record<string, string>) {
  const friday = debrief["friday-nordwerk"]
    ? ` You said: ${debrief["friday-nordwerk"]}`
    : "";
  return `${expert}, here is the shift as I understand it. On a penalty window, leave the Suggested cheap truck for lane score. Alpine loads over 18 tonnes get a second driver. Cold chain does not ride a dry van. Nordwerk does not leave on Friday.${friday}`;
}

export function debriefPrompts() {
  return [
    {
      id: "friday-nordwerk",
      guardrail: true,
      prompt:
        "You skipped the Friday slot for Nordwerk, even though it was cheaper and Suggested. Why?",
      placeholder: "Every Friday. Dispatch lead is the only exception.",
      because:
        "The Suggested badge pointed at the Friday truck. You took Thursday instead and never said why.",
    },
    {
      id: "who-releases",
      guardrail: true,
      prompt:
        "Cold chain is not on tonight's board, but the company still has that rule. Who is allowed to release a held cold-chain load?",
      placeholder: "The planner on duty.",
      because: "The rule must live on the map even when the load is not on the desk.",
    },
    {
      id: "alpine-edge",
      guardrail: true,
      prompt:
        "The Alpine line you used was over 18 tonnes. What about 18.0 exactly, or a ticket with no weight?",
      placeholder: "18.0 still gets a second driver. No weight on the ticket: stop and ask.",
      because: "The live load was 19.4t. The edge cases were not on the screen.",
    },
  ] as const;
}

export function wordsFor(
  ruleId: RuleId,
  lines: { questionId?: string; text: string; role: string; dropped?: boolean }[],
  debrief: Record<string, string>,
) {
  if (ruleId === "friday-nordwerk") {
    return answerFor(lines, debrief, "friday-nordwerk") || FALLBACK[ruleId];
  }
  if (ruleId === "alpine-weight") {
    return (
      answerFor(lines, debrief, "alpine-limit") ||
      answerFor(lines, debrief, "alpine-edge") ||
      FALLBACK[ruleId]
    );
  }
  return answerFor(lines, debrief, "cold-stop") || FALLBACK[ruleId];
}

export function actionLabel(action: ActionName) {
  if (action === "assign") return "Assign";
  if (action === "hold") return "Hold";
  return "Escalate";
}
