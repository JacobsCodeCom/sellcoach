import type { ActionName, Draft, Load, RuleId, Truck, Violation } from "./types";

export const FALLBACK: Record<RuleId, string> = {
  "alpine-weight":
    "Equipment over €5,000 is always capex. No asset number, no capex booking.",
  "cold-chain":
    "Czech subsidiary invoices need a second approval before they post. Stop and ask the controller.",
  "friday-nordwerk":
    "Vogel double-bills every December. An open pay-this-week suggestion is still a hold.",
};

export type GuardrailCheck = {
  status: "allow" | "blocked" | "uncovered";
  violation?: Violation;
  message?: string;
};

function isVogel(load: Load) {
  return /vogel/i.test(load.customer);
}

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
  const center = trucks.find((item) => item.id === draft.truckId) ?? null;

  if (isVogel(load) && draft.action === "assign") {
    return {
      status: "blocked",
      violation: {
        ruleId: "friday-nordwerk",
        title: "Vogel December invoices stay on hold",
        expertWords: FALLBACK["friday-nordwerk"],
        because: "Suggested wants to pay this week. The December rule still says hold.",
        target: center ? `truck:${center.id}` : "action:assign",
      },
    };
  }

  if (load.cargo === "pharma" && draft.action === "assign") {
    if (intent === "select" || intent === "assign" || intent === "save") {
      return {
        status: "blocked",
        violation: {
          ruleId: "cold-chain",
          title: "Czech subsidiary needs second approval",
          expertWords: FALLBACK["cold-chain"],
          because: "Suggested posts now. Subsidiary invoices wait for a second approval.",
          target: "action:assign",
        },
      };
    }
  }

  if (
    load.alpine &&
    load.weightT > 5000 &&
    (draft.action === "assign" || intent === "assign" || intent === "save")
  ) {
    const opex = center?.type === "dry";
    const noAsset = draft.drivers < 2;
    if (opex || noAsset) {
      return {
        status: "blocked",
        violation: {
          ruleId: "alpine-weight",
          title: "Equipment over €5,000 needs capex + asset number",
          expertWords: FALLBACK["alpine-weight"],
          because: opex
            ? "Suggested coded opex. Equipment over €5,000 is always capex."
            : "Capex without an asset number is not allowed.",
          target: opex ? `truck:${center?.id ?? "CC-4711"}` : "drivers-inc",
        },
      };
    }
  }

  if (
    intent === "assign" &&
    draft.action === "escalate" &&
    load.accept === "any" &&
    !load.alpine &&
    load.cargo !== "pharma" &&
    !isVogel(load)
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
    const center = trucks.find((item) => item.id === draft.truckId);
    return Boolean(center && center.day !== "Friday");
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
  if (load.alpine && load.weightT > 5000) {
    return `${expert} would code this to capex and attach the asset number before posting.`;
  }
  if (load.cargo === "pharma") {
    return `${expert} would send this for second approval. Do not post the Czech subsidiary yet.`;
  }
  if (isVogel(load)) {
    return `${expert} would hold Vogel in December. Do not pay this week.`;
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
    `${input.expert} opens the invoice and, when Suggested is the cheap opex code, leaves it for the right cost center. ${said("lane-score")}`,
    `On equipment over €5,000, ${input.expert} codes capex and attaches an asset number even though Suggested is opex. ${said("alpine-limit")}`,
    `Czech subsidiary invoices do not post on Suggested. They get a second approval. ${said("who-releases")}`,
    `Vogel does not get paid in December on the Suggested pay-this-week path. Hold it. ${said("friday-nordwerk")}`,
    `Missing asset number, or amount exactly on the €5,000 line: ${input.debrief["alpine-edge"] || "stop and ask the controller."}`,
  ].join("\n\n");
}

export function shortTeachBack(expert: string, debrief: Record<string, string>) {
  const friday = debrief["friday-nordwerk"]
    ? ` You said: ${debrief["friday-nordwerk"]}`
    : "";
  return `${expert}, here is the close as I understand it. Leave Suggested cheap opex when the cost center is wrong. Equipment over €5,000 is always capex with an asset number. Czech subsidiary invoices need a second approval. Vogel December invoices stay on hold.${friday}`;
}

export function debriefPrompts() {
  return [
    {
      id: "friday-nordwerk",
      guardrail: true,
      prompt:
        "You held the Vogel December invoice even though Suggested said pay this week. Why? Is that for every supplier?",
      placeholder: "Vogel double-bills every December. Hold until the controller releases it.",
      because:
        "Suggested pointed at pay-this-week. You held it and never said the supplier rule out loud.",
    },
    {
      id: "who-releases",
      guardrail: true,
      prompt:
        "Czech subsidiary invoices are not always on tonight's queue, but the company still has that rule. Who is allowed to release the second approval?",
      placeholder: "The plant controller on duty.",
      because: "The rule must live on the map even when the invoice is not on the desk.",
    },
    {
      id: "alpine-edge",
      guardrail: true,
      prompt:
        "The equipment line you coded was over €5,000. What about exactly €5,000, or a missing asset number?",
      placeholder: "€5,000 still goes to capex. No asset number: stop and ask.",
      because: "The live invoice was €7,200. The edge cases were not on the screen.",
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
  if (action === "assign") return "Post";
  if (action === "hold") return "Hold";
  return "2nd approval";
}
