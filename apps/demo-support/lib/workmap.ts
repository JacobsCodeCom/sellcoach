import { redact } from "./redact";
import { FALLBACK, answerFor, wordsFor } from "./rules";
import { suggestedFor } from "./suggest";
import type {
  Decision,
  Line,
  Load,
  MapStep,
  OffRecordGap,
  ScreenEvent,
  Snapshot,
  Truck,
  WorkMap,
} from "./types";
import { uid } from "./types";

function keptEvents(events: ScreenEvent[]) {
  return events.filter((event) => !event.dropped);
}

function keptShots(shots: Snapshot[]) {
  return shots.filter((shot) => !shot.dropped);
}

function shotFor(shots: Snapshot[], loadId?: string | null): Snapshot | undefined {
  const pool = keptShots(shots);
  if (loadId) {
    const match = [...pool].reverse().find((shot) => shot.loadId === loadId);
    if (match) return match;
  }
  return pool[pool.length - 1];
}

function moment(shot: Snapshot | undefined, fallback: string, t: number) {
  return {
    t: shot?.t ?? t,
    label: shot?.label ?? fallback,
    snapshotId: shot?.id ?? "none",
    image: shot?.image,
  };
}

function pathOf(trucks: Truck[], id: string | null) {
  return trucks.find((item) => item.id === id);
}

function isCompetitor(load: Load) {
  return /rival|competitor/i.test(load.customer) || /competitor/i.test(load.origin);
}

export function buildWorkMap(input: {
  expert: string;
  hire: string;
  loads: Load[];
  trucks: Truck[];
  done: Decision[];
  events: ScreenEvent[];
  snapshots: Snapshot[];
  lines: Line[];
  debrief: Record<string, string>;
  confirmedText: string;
  generatedText: string;
  offRecordGaps?: OffRecordGap[];
}): WorkMap {
  const decision = (id: string) => input.done.find((item) => item.loadId === id);
  const steps: MapStep[] = [];

  const push = (step: Omit<MapStep, "index">) => {
    steps.push({ ...step, index: steps.length + 1 });
  };

  const soft = input.loads.find((load) => load.penaltyWindow);
  const churn = input.loads.find((load) => load.alpine);
  const competitor = input.loads.find((load) => isCompetitor(load));

  if (soft) {
    const open = keptEvents(input.events).find(
      (event) => event.kind === "opened" && event.loadId === soft.id,
    );
    const suggestion = suggestedFor(soft, input.trucks);
    const suggested = pathOf(input.trucks, suggestion?.truckId ?? null);
    push({
      id: "open-soft",
      title: `Open ${soft.customer}`,
      screenMoment: moment(shotFor(input.snapshots, soft.id), open?.label ?? soft.id, open?.t ?? 0),
      decision: `Read ${soft.origin}, ${soft.window}.`,
      reason: "Suggested is the standard close. The judgment is the departure.",
      guardrails: [],
      expertWords: answerFor(input.lines, input.debrief, "lane-score") || "Not said on the shift.",
    });
    const saved = decision(soft.id);
    const path = pathOf(input.trucks, saved?.truckId ?? null);
    push({
      id: "lane-score",
      title: "Leave Suggested for a better reply path",
      screenMoment: moment(
        shotFor(input.snapshots, soft.id),
        path ? `Selected ${path.name}` : soft.id,
        saved?.t ?? 0,
      ),
      decision: path
        ? `Chose ${path.name}${suggested ? `. Suggested was ${suggested.name}.` : ""}`
        : "Path not saved.",
      reason: "Suggested macros are not always the right customer conversation.",
      guardrails: ["On a billing question, the Suggested close can still be the wrong path."],
      expertWords: answerFor(input.lines, input.debrief, "lane-score") || "Not said on the shift.",
    });
  }

  if (churn) {
    const saved = decision(churn.id);
    const alpineWords = wordsFor("alpine-weight", input.lines, input.debrief);
    push({
      id: "open-churn",
      title: "Open the second cancel mention",
      screenMoment: moment(
        shotFor(input.snapshots, churn.id),
        `${churn.id} · ${churn.origin}`,
        saved?.t ?? 0,
      ),
      decision: `${churn.customer}. Suggested is a standard close.`,
      reason: "The second cancel cue is easy to miss in a calm thread.",
      guardrails: [],
      expertWords: alpineWords,
    });
    push({
      id: "alpine-weight",
      title: "Escalate on a second cancel mention",
      screenMoment: moment(
        shotFor(input.snapshots, churn.id),
        `${churn.id} · escalate`,
        saved?.t ?? 0,
      ),
      decision: saved
        ? `${churn.customer}: ${saved.action}.`
        : "Second cancel mention was on the board.",
      reason: "Suggested is Close. The form accepts it.",
      guardrails: [
        "Two cancel mentions in seven days: escalate. Do not close with a macro.",
        input.debrief["alpine-edge"]
          ? `Edge: ${input.debrief["alpine-edge"]}`
          : "One mention: watch. Two this week: escalate.",
      ],
      expertWords: alpineWords,
    });
  }

  push({
    id: "cold-chain",
    title: "Open the renewal timeline inside 30 days",
    screenMoment: moment(shotFor(input.snapshots, null), "Company rule · renewal ritual", 0),
    decision: "Renewal-soon tickets never close on Suggested without the timeline open.",
    reason: "Seeded for the roadmap when the capture board does not include a renewal ticket.",
    guardrails: [
      "Always open the renewal timeline before you reply inside 30 days.",
      input.debrief["who-releases"]
        ? `Exception: ${input.debrief["who-releases"]}`
        : "Unknown exception: stop and ask the AM.",
    ],
    expertWords: wordsFor("cold-chain", input.lines, input.debrief) || FALLBACK["cold-chain"],
  });

  if (competitor || input.debrief["friday-nordwerk"]) {
    const saved = decision(competitor?.id ?? "");
    const suggestion = competitor ? suggestedFor(competitor, input.trucks) : null;
    const suggested = pathOf(input.trucks, suggestion?.truckId ?? null);
    const queueShot =
      [...keptShots(input.snapshots)].reverse().find((shot) => /rival|competitor/i.test(shot.label)) ??
      shotFor(input.snapshots, competitor?.id);
    push({
      id: "friday-nordwerk",
      title: "Document competitor names before close",
      screenMoment: moment(
        queueShot,
        competitor ? `Saved ${competitor.customer}` : "Debrief",
        saved?.t ?? queueShot?.t ?? 0,
      ),
      decision: saved?.action === "escalate" || saved?.action === "hold"
        ? `${saved.action} on ${competitor?.customer ?? "competitor thread"}. Suggested was ${suggested?.name ?? "close with macro"}.`
        : "Leave the close-with-macro suggestion when a competitor is named.",
      reason: "The competitor name is not forced into the health record by the console.",
      guardrails: ["A named competitor still blocks a macro close."],
      expertWords: wordsFor("friday-nordwerk", input.lines, input.debrief),
    });
  }

  const fridayWords = wordsFor("friday-nordwerk", input.lines, input.debrief);
  const alpineWords = wordsFor("alpine-weight", input.lines, input.debrief);
  const coldWords = wordsFor("cold-chain", input.lines, input.debrief) || FALLBACK["cold-chain"];
  const corrected = input.confirmedText.trim() !== input.generatedText.trim();

  const guardrails = [
    {
      id: "alpine-weight" as const,
      title: "Churn-risk escalation",
      rule: "Escalate if they mention cancellation twice in one week.",
      expertWords: alpineWords,
      stepId: "alpine-weight",
      version: corrected && input.confirmedText.includes(alpineWords) ? 2 : 1,
      previousWords: corrected ? FALLBACK["alpine-weight"] : undefined,
    },
    {
      id: "cold-chain" as const,
      title: "Renewal prep ritual",
      rule: "Open the renewal timeline before you reply inside 30 days.",
      expertWords: coldWords,
      stepId: "cold-chain",
      version: 1,
    },
    {
      id: "friday-nordwerk" as const,
      title: "Competitor notes",
      rule: "Document the competitor name in the health note before closing.",
      expertWords: fridayWords,
      stepId: "friday-nordwerk",
      version: corrected ? 2 : 1,
      previousWords: corrected ? FALLBACK["friday-nordwerk"] : undefined,
    },
  ];

  const filled = steps.filter(
    (step) => step.decision && step.reason && (step.guardrails.length > 0 || step.id.startsWith("open")),
  ).length;

  return {
    id: uid("map"),
    expert: input.expert,
    hire: input.hire,
    confirmedText: redact(input.confirmedText),
    corrected,
    steps,
    guardrails,
    createdAt: Date.now(),
    completeness: Math.round((filled / Math.max(1, steps.length)) * 100),
    offRecordGaps: input.offRecordGaps ?? [],
  };
}
