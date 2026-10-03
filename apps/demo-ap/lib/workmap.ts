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

function centerOf(trucks: Truck[], id: string | null) {
  return trucks.find((item) => item.id === id);
}

function euros(amount: number) {
  return `€${amount.toLocaleString("en-US")}`;
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
  const capex = input.loads.find((load) => load.alpine);
  const vogel = input.loads.find((load) => /vogel/i.test(load.customer));

  if (soft) {
    const open = keptEvents(input.events).find(
      (event) => event.kind === "opened" && event.loadId === soft.id,
    );
    const suggestion = suggestedFor(soft, input.trucks);
    const suggested = centerOf(input.trucks, suggestion?.truckId ?? null);
    push({
      id: "open-soft",
      title: `Open ${soft.customer}`,
      screenMoment: moment(shotFor(input.snapshots, soft.id), open?.label ?? soft.id, open?.t ?? 0),
      decision: `Read ${soft.origin}, ${euros(soft.weightT)}, ${soft.window}.`,
      reason: "Suggested is the cheap opex code. The judgment is the departure.",
      guardrails: [],
      expertWords: answerFor(input.lines, input.debrief, "lane-score") || "Not said on the shift.",
    });
    const saved = decision(soft.id);
    const center = centerOf(input.trucks, saved?.truckId ?? null);
    push({
      id: "lane-score",
      title: "Leave Suggested for the right cost center",
      screenMoment: moment(
        shotFor(input.snapshots, soft.id),
        center ? `Selected ${center.name}` : soft.id,
        saved?.t ?? 0,
      ),
      decision: center
        ? `Coded ${center.name}${suggested ? `. Suggested was ${suggested.name}.` : ""}`
        : "Coding not saved.",
      reason: "Suggested is not always the correct plant cost center.",
      guardrails: ["On a routine invoice, the Suggested opex code can still be wrong."],
      expertWords: answerFor(input.lines, input.debrief, "lane-score") || "Not said on the shift.",
    });
  }

  if (capex) {
    const saved = decision(capex.id);
    const alpineWords = wordsFor("alpine-weight", input.lines, input.debrief);
    const suggestion = suggestedFor(capex, input.trucks);
    push({
      id: "open-capex",
      title: `Open the ${euros(capex.weightT)} equipment invoice`,
      screenMoment: moment(
        shotFor(input.snapshots, capex.id),
        `${capex.id} · ${euros(capex.weightT)} · equipment`,
        saved?.t ?? 0,
      ),
      decision: `${capex.customer}. Suggested is ${suggestion?.label ?? "opex"}.`,
      reason: "Amount is visible. The capex limit is not.",
      guardrails: [],
      expertWords: alpineWords,
    });
    push({
      id: "alpine-weight",
      title: "Code equipment over €5,000 to capex",
      screenMoment: moment(
        shotFor(input.snapshots, capex.id),
        `${capex.id} · ${euros(capex.weightT)}`,
        saved?.t ?? 0,
      ),
      decision: saved
        ? `${capex.customer}, ${euros(capex.weightT)}, asset ${saved.drivers >= 2 ? "on file" : "missing"}.`
        : `${euros(capex.weightT)} equipment was on the board.`,
      reason: "Suggested is opex with no asset number. The form accepts it.",
      guardrails: [
        "No asset number, no capex booking. Equipment over €5,000 is always capex.",
        input.debrief["alpine-edge"]
          ? `Edge: ${input.debrief["alpine-edge"]}`
          : "€5,000 exactly, or a missing asset number, is still a stop.",
      ],
      expertWords: alpineWords,
    });
  }

  push({
    id: "cold-chain",
    title: "Czech subsidiary needs second approval",
    screenMoment: moment(shotFor(input.snapshots, null), "Company rule · Czech subsidiary", 0),
    decision: "Subsidiary invoices never post on Suggested. Send for second approval.",
    reason: "Seeded for the roadmap when the capture board does not include a Czech invoice.",
    guardrails: [
      "Czech subsidiary: stop and ask before posting.",
      input.debrief["who-releases"]
        ? `Release: ${input.debrief["who-releases"]}`
        : "Unknown release: stop and ask the controller.",
    ],
    expertWords: wordsFor("cold-chain", input.lines, input.debrief) || FALLBACK["cold-chain"],
  });

  if (vogel || input.debrief["friday-nordwerk"]) {
    const saved = decision(vogel?.id ?? "");
    const center = centerOf(input.trucks, saved?.truckId ?? null);
    const suggestion = vogel ? suggestedFor(vogel, input.trucks) : null;
    const suggested = centerOf(input.trucks, suggestion?.truckId ?? null);
    const queueShot =
      [...keptShots(input.snapshots)].reverse().find((shot) => /vogel/i.test(shot.label)) ??
      shotFor(input.snapshots, vogel?.id);
    push({
      id: "friday-nordwerk",
      title: "Vogel December invoices stay on hold",
      screenMoment: moment(
        queueShot,
        vogel ? `Saved ${vogel.customer}` : "Debrief",
        saved?.t ?? queueShot?.t ?? 0,
      ),
      decision: saved?.action === "hold"
        ? `Held ${vogel?.customer ?? "Vogel"}. Suggested was ${suggested?.name ?? "pay this week"}.`
        : "Leave the pay-this-week suggestion for Vogel in December.",
      reason: "The double-bill pattern is not written on the invoice.",
      guardrails: ["An open pay-this-week suggestion is still a hold for Vogel in December."],
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
      title: "Capex vs opex",
      rule: "Equipment over €5,000 is always capex. No asset number, no booking.",
      expertWords: alpineWords,
      stepId: "alpine-weight",
      version: corrected && input.confirmedText.includes(alpineWords) ? 2 : 1,
      previousWords: corrected ? FALLBACK["alpine-weight"] : undefined,
    },
    {
      id: "cold-chain" as const,
      title: "Czech subsidiary",
      rule: "Czech subsidiary invoices need a second approval before posting.",
      expertWords: coldWords,
      stepId: "cold-chain",
      version: 1,
    },
    {
      id: "friday-nordwerk" as const,
      title: "December holds",
      rule: "Vogel never gets paid on the December double-bill pattern without a hold.",
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
