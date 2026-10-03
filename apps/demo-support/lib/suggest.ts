import type { ActionName, Draft, Load, Truck } from "./types";

export type Suggestion = {
  truckId: string;
  drivers: number;
  action: ActionName;
  label: string;
};

function isCompetitor(load: Load) {
  return /rival|competitor/i.test(load.customer) || /competitor/i.test(load.origin);
}

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

  const candidates = trucks
    .filter((item) => item.available)
    .sort((a, b) => a.laneScore - b.laneScore);

  const pick = candidates[0];
  if (!pick) return null;

  return {
    truckId: pick.id,
    drivers: 1,
    action: "assign",
    label: `${pick.name} · Suggested`,
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
  const suggestedPath = trucks.find((item) => item.id === suggestion.truckId);
  const chosenPath = trucks.find((item) => item.id === draft.truckId);

  if (draft.action && draft.action !== suggestion.action) {
    return {
      loadId: load.id,
      kind: "action",
      suggested: suggestion.action,
      chosen: draft.action,
      summary: `Suggested ${suggestion.action}; chose ${draft.action}`,
      priority: load.alpine || isCompetitor(load) || load.cargo === "pharma" ? 1 : 3,
      questionId: load.alpine
        ? "alpine-limit"
        : isCompetitor(load)
          ? "friday-nordwerk"
          : load.cargo === "pharma"
            ? "cold-stop"
            : `action-${load.id}`,
      guardrail: load.alpine || isCompetitor(load) || load.cargo === "pharma",
    };
  }

  if (draft.truckId && draft.truckId !== suggestion.truckId) {
    return {
      loadId: load.id,
      kind: "truck",
      suggested: suggestedPath?.name ?? suggestion.truckId,
      chosen: chosenPath?.name ?? draft.truckId,
      summary: `Suggested ${suggestedPath?.name ?? "path"}; chose ${chosenPath?.name ?? "another"}`,
      priority: load.penaltyWindow ? 2 : isCompetitor(load) ? 2 : 3,
      questionId: load.penaltyWindow
        ? "lane-score"
        : isCompetitor(load)
          ? "friday-nordwerk"
          : load.alpine
            ? "alpine-limit"
            : `truck-${load.id}`,
      guardrail: isCompetitor(load) || Boolean(load.alpine),
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
      summary: `Suggested closed timeline; opened renewal timeline`,
      priority: 1,
      questionId: "cold-stop",
      guardrail: true,
    };
  }

  return null;
}

export function isSuggestedTruck(load: Load, trucks: Truck[], truckId: string) {
  const suggestion = suggestedFor(load, trucks);
  return suggestion?.truckId === truckId;
}
