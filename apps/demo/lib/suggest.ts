import type { ActionName, Draft, Load, Truck } from "./types";

export type Suggestion = {
  truckId: string;
  drivers: number;
  action: ActionName;
  label: string;
};

export function suggestedFor(load: Load, trucks: Truck[]): Suggestion | null {
  if (load.bait) {
    const bait = trucks.find((item) => item.id === load.bait!.truckId && item.available);
    if (bait) {
      return {
        truckId: bait.id,
        drivers: Math.min(bait.driversAvailable, load.bait.drivers),
        action: "assign",
        label: load.bait.label,
      };
    }
  }

  if (load.cargo === "pharma") {
    const dry = trucks
      .filter((item) => item.available && item.type === "dry" && item.capacityT >= load.weightT)
      .sort((a, b) => a.rateEur - b.rateEur)[0];
    if (dry) {
      return {
        truckId: dry.id,
        drivers: 1,
        action: "assign",
        label: `${dry.name} · dry · €${dry.rateEur}`,
      };
    }
  }

  const candidates = trucks
    .filter((item) => item.available && item.capacityT >= load.weightT)
    .filter((item) => item.day === load.day || item.day === "Monday" || item.day === "Thursday")
    .sort((a, b) => a.rateEur - b.rateEur || b.laneScore - a.laneScore);

  const sameDay = candidates.filter((item) => item.day === load.day);
  const pick = sameDay[0] ?? candidates[0];
  if (!pick) return null;

  return {
    truckId: pick.id,
    drivers: 1,
    action: "assign",
    label: `${pick.name} · ${pick.day} · €${pick.rateEur}`,
  };
}

export type Departure = {
  loadId: string;
  kind: "truck" | "drivers" | "action";
  suggested: string;
  chosen: string;
  summary: string;
  priority: number;
  questionId: string;
  guardrail: boolean;
};

export function departureFrom(
  load: Load,
  draft: Draft,
  trucks: Truck[],
  suggestion: Suggestion | null,
): Departure | null {
  if (!suggestion) return null;
  const suggestedTruck = trucks.find((item) => item.id === suggestion.truckId);
  const chosenTruck = trucks.find((item) => item.id === draft.truckId);

  if (draft.action && draft.action !== suggestion.action) {
    return {
      loadId: load.id,
      kind: "action",
      suggested: suggestion.action,
      chosen: draft.action,
      summary: `Suggested ${suggestion.action}; chose ${draft.action}`,
      priority: load.cargo === "pharma" ? 1 : 3,
      questionId: load.cargo === "pharma" ? "cold-stop" : `action-${load.id}`,
      guardrail: load.cargo === "pharma",
    };
  }

  if (draft.truckId && draft.truckId !== suggestion.truckId) {
    const customerBoost = load.customer === "Nordwerk" ? 1 : 0;
    return {
      loadId: load.id,
      kind: "truck",
      suggested: suggestedTruck?.name ?? suggestion.truckId,
      chosen: chosenTruck?.name ?? draft.truckId,
      summary: `Suggested ${suggestedTruck?.name ?? "truck"}; chose ${chosenTruck?.name ?? "another"}`,
      priority: load.penaltyWindow ? 2 : load.customer === "Nordwerk" ? 2 : 3 - customerBoost,
      questionId: load.penaltyWindow
        ? "lane-score"
        : load.customer === "Nordwerk"
          ? "friday-nordwerk"
          : `truck-${load.id}`,
      guardrail: load.customer === "Nordwerk" || Boolean(load.alpine),
    };
  }

  if (
    draft.truckId === suggestion.truckId &&
    draft.drivers !== suggestion.drivers &&
    draft.drivers > suggestion.drivers
  ) {
    return {
      loadId: load.id,
      kind: "drivers",
      suggested: String(suggestion.drivers),
      chosen: String(draft.drivers),
      summary: `Suggested ${suggestion.drivers} driver; chose ${draft.drivers}`,
      priority: 1,
      questionId: "alpine-limit",
      guardrail: true,
    };
  }

  return null;
}

export function isSuggestedTruck(load: Load, trucks: Truck[], truckId: string) {
  const suggestion = suggestedFor(load, trucks);
  return suggestion?.truckId === truckId;
}
