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

function truckOf(trucks: Truck[], id: string | null) {
  return trucks.find((item) => item.id === id);
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

  const lyon = input.loads.find((load) => load.penaltyWindow);
  const alpine = input.loads.find((load) => load.alpine);
  const nordwerk = input.loads.find((load) => load.customer === "Nordwerk");

  if (lyon) {
    const open = keptEvents(input.events).find(
      (event) => event.kind === "opened" && event.loadId === lyon.id,
    );
    const suggestion = suggestedFor(lyon, input.trucks);
    const suggested = truckOf(input.trucks, suggestion?.truckId ?? null);
    push({
      id: "open-lyon",
      title: `Open ${lyon.customer}`,
      screenMoment: moment(shotFor(input.snapshots, lyon.id), open?.label ?? lyon.id, open?.t ?? 0),
      decision: `Read ${lyon.origin} → ${lyon.destination}, ${lyon.weightT}t, penalty window ${lyon.window}.`,
      reason: "Suggested is the cheap truck. The judgment is the departure.",
      guardrails: [],
      expertWords: answerFor(input.lines, input.debrief, "lane-score") || "Not said on the shift.",
    });
    const saved = decision(lyon.id);
    const truck = truckOf(input.trucks, saved?.truckId ?? null);
    push({
      id: "lane-score",
      title: "Leave Suggested for lane score",
      screenMoment: moment(
        shotFor(input.snapshots, lyon.id),
        truck ? `Selected ${truck.name}` : lyon.id,
        saved?.t ?? 0,
      ),
      decision: truck
        ? `Booked ${truck.name}, lane ${truck.laneScore}, €${truck.rateEur}${suggested ? `. Suggested was ${suggested.name} at €${suggested.rateEur}.` : ""}`
        : "Carrier not saved.",
      reason: "A few euros against a penalty window.",
      guardrails: ["On a penalty window, the Suggested cheap truck can still be the wrong truck."],
      expertWords: answerFor(input.lines, input.debrief, "lane-score") || "Not said on the shift.",
    });
  }

  if (alpine) {
    const saved = decision(alpine.id);
    const alpineWords = wordsFor("alpine-weight", input.lines, input.debrief);
    const suggestion = suggestedFor(alpine, input.trucks);
    push({
      id: "open-alpine",
      title: `Open the ${alpine.weightT}t Alpine ticket`,
      screenMoment: moment(
        shotFor(input.snapshots, alpine.id),
        `${alpine.id} · ${alpine.weightT}t · ${alpine.destination}`,
        saved?.t ?? 0,
      ),
      decision: `${alpine.customer}. Suggested is ${suggestion?.drivers ?? 1} driver.`,
      reason: "Weight is visible. The limit is not.",
      guardrails: [],
      expertWords: alpineWords,
    });
    push({
      id: "alpine-weight",
      title: "Second driver on the Alpine lane",
      screenMoment: moment(
        shotFor(input.snapshots, alpine.id),
        `${alpine.id} · ${alpine.weightT}t · ${alpine.destination}`,
        saved?.t ?? 0,
      ),
      decision: saved
        ? `${alpine.customer}, ${alpine.weightT}t to ${alpine.destination}, ${saved.drivers} driver${saved.drivers === 1 ? "" : "s"}.`
        : `${alpine.weightT}t Alpine lane was on the board.`,
      reason: "Suggested is one driver. The form accepts it.",
      guardrails: [
        "No second driver, no Alpine booking over 18 tonnes.",
        input.debrief["alpine-edge"]
          ? `Edge: ${input.debrief["alpine-edge"]}`
          : "18.0 exactly, or a missing weight, is still a stop.",
      ],
      expertWords: alpineWords,
    });
  }

  push({
    id: "cold-chain",
    title: "Hold cold chain off the dry van",
    screenMoment: moment(
      shotFor(input.snapshots, null),
      "Company rule · cold chain",
      0,
    ),
    decision: "Temperature cargo never rides a dry van, even when Suggested is the dry van.",
    reason: "Seeded for the roadmap when the capture board does not include pharma.",
    guardrails: [
      "Cold chain never rides dry to save the window.",
      input.debrief["who-releases"]
        ? `Release: ${input.debrief["who-releases"]}`
        : "Unknown release: stop and ask the planner.",
    ],
    expertWords: wordsFor("cold-chain", input.lines, input.debrief) || FALLBACK["cold-chain"],
  });

  if (nordwerk || input.debrief["friday-nordwerk"]) {
    const saved = decision(nordwerk?.id ?? "");
    const truck = truckOf(input.trucks, saved?.truckId ?? null);
    const suggestion = nordwerk ? suggestedFor(nordwerk, input.trucks) : null;
    const suggested = truckOf(input.trucks, suggestion?.truckId ?? null);
    const queueShot =
      [...keptShots(input.snapshots)].reverse().find((shot) => /nordwerk/i.test(shot.label)) ??
      shotFor(input.snapshots, nordwerk?.id);
    push({
      id: "friday-nordwerk",
      title: "Nordwerk does not leave on Friday",
      screenMoment: moment(
        queueShot,
        nordwerk ? `Saved ${nordwerk.customer}` : "Debrief",
        saved?.t ?? queueShot?.t ?? 0,
      ),
      decision: truck
        ? `Booked ${truck.name} (${truck.day}). Suggested was ${suggested?.name ?? "the Friday truck"} (${suggested?.day ?? "Friday"}).`
        : "Leave the Friday Nordwerk suggestion, even when it wins on rate.",
      reason: "The damage claims are not on the ticket.",
      guardrails: ["An open Friday truck is still a no for Nordwerk."],
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
      title: "Alpine weight",
      rule: "Over 18 tonnes on an Alpine lane, never one driver.",
      expertWords: alpineWords,
      stepId: "alpine-weight",
      version: corrected && input.confirmedText.includes(alpineWords) ? 2 : 1,
      previousWords: corrected ? FALLBACK["alpine-weight"] : undefined,
    },
    {
      id: "cold-chain" as const,
      title: "Cold chain",
      rule: "Temperature cargo never rides a dry van.",
      expertWords: coldWords,
      stepId: "cold-chain",
      version: 1,
    },
    {
      id: "friday-nordwerk" as const,
      title: "Customer exceptions",
      rule: "Nordwerk never ships on Friday.",
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
