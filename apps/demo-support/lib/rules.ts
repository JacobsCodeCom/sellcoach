import type { ActionName, Draft, Load, RuleId, Truck, Violation } from "./types";

export const FALLBACK: Record<RuleId, string> = {
  "alpine-weight":
    "Escalate if they mention cancellation twice in one week. Do not close it with a macro.",
  "cold-chain":
    "Always open the renewal timeline before you reply when renewal is within 30 days.",
  "friday-nordwerk":
    "Document the competitor name in the health note. Do not close a CompetitorX thread with a macro.",
};

export type GuardrailCheck = {
  status: "allow" | "blocked" | "uncovered";
  violation?: Violation;
  message?: string;
};

function isCompetitor(load: Load) {
  return /rival|competitor/i.test(load.customer) || /competitor/i.test(load.origin);
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
  const path = trucks.find((item) => item.id === draft.truckId) ?? null;

  if (isCompetitor(load) && draft.action === "assign") {
    return {
      status: "blocked",
      violation: {
        ruleId: "friday-nordwerk",
        title: "Competitor threads need a health note",
        expertWords: FALLBACK["friday-nordwerk"],
        because: "Suggested wants to close with a macro. Competitor names stay in the health record.",
        target: path ? `truck:${path.id}` : "action:assign",
      },
    };
  }

  if (load.cargo === "pharma" && (draft.action === "assign" || intent === "save")) {
    const closedTimeline = draft.drivers < 2;
    const standardPath = path?.type === "dry";
    if (closedTimeline || standardPath) {
      return {
        status: "blocked",
        violation: {
          ruleId: "cold-chain",
          title: "Open the renewal timeline first",
          expertWords: FALLBACK["cold-chain"],
          because: "Suggested closes without the renewal timeline. Renewal is inside 30 days.",
          target: closedTimeline ? "drivers-inc" : `truck:${path?.id ?? "RP-STD"}`,
        },
      };
    }
  }

  if (
    load.alpine &&
    draft.action === "assign" &&
    (intent === "assign" || intent === "save" || intent === "select")
  ) {
    return {
      status: "blocked",
      violation: {
        ruleId: "alpine-weight",
        title: "Second cancel mention means escalate",
        expertWords: FALLBACK["alpine-weight"],
        because: "Suggested is a standard close. Two cancel cues in one week is an escalation.",
        target: "action:assign",
      },
    };
  }

  if (
    intent === "assign" &&
    draft.action === "escalate" &&
    load.accept === "any" &&
    !load.alpine &&
    load.cargo !== "pharma" &&
    !isCompetitor(load)
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
    const path = trucks.find((item) => item.id === draft.truckId);
    return Boolean(path && path.day !== "Friday");
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
  if (load.alpine) {
    return `${expert} would escalate this. Two cancel mentions in one week is not a macro close.`;
  }
  if (load.cargo === "pharma") {
    return `${expert} would open the renewal timeline before replying.`;
  }
  if (isCompetitor(load)) {
    return `${expert} would escalate or document the competitor — not close with a macro.`;
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
    `${input.expert} opens the ticket and leaves the Suggested standard close when a health-check reply fits better. ${said("lane-score")}`,
    `On a second cancellation mention in one week, ${input.expert} escalates instead of closing. ${said("alpine-limit")}`,
    `When renewal is inside 30 days, open the renewal timeline before you reply. ${said("who-releases")}`,
    `If a competitor is named, document it — do not close with a macro. ${said("friday-nordwerk")}`,
    `Edge cases: ${input.debrief["alpine-edge"] || "one cancel mention can wait; two this week cannot."}`,
  ].join("\n\n");
}

export function shortTeachBack(expert: string, debrief: Record<string, string>) {
  const friday = debrief["friday-nordwerk"]
    ? ` You said: ${debrief["friday-nordwerk"]}`
    : "";
  return `${expert}, here is the queue as I understand it. Leave Suggested macros when the health-check path is better. Escalate on a second cancel mention. Open the renewal timeline inside 30 days. Document competitor names before you close.${friday}`;
}

export function debriefPrompts() {
  return [
    {
      id: "friday-nordwerk",
      guardrail: true,
      prompt:
        "You refused to close the CompetitorX thread with a macro. Why? Where does the name have to land?",
      placeholder: "Always put the competitor in the health note, then escalate to the AM.",
      because: "Suggested pointed at close-with-macro. You left that path without saying the rule.",
    },
    {
      id: "who-releases",
      guardrail: true,
      prompt:
        "Renewal-within-30-days tickets are not always in the queue. Who decides when a reply can go out without opening the timeline?",
      placeholder: "Only the AM on the account. Everyone else opens the timeline first.",
      because: "The rule must live on the map even when the ticket is not on the desk.",
    },
    {
      id: "alpine-edge",
      guardrail: true,
      prompt:
        "You escalated on a second cancel mention. What about one mention, or two mentions across different weeks?",
      placeholder: "One mention: watch and note. Two in seven days: escalate. Across weeks: reset the count.",
      because: "The live ticket was the second mention. The edge cases were not on the screen.",
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
  if (action === "assign") return "Close";
  if (action === "hold") return "Snooze";
  return "Escalate";
}
