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
    const quick = trucks
      .filter((item) => item.available && item.type === "dry")
      .sort((a, b) => b.laneScore - a.laneScore)[0];
    if (quick) {
      return {
        truckId: quick.id,
        drivers: 1,
        action: "assign",
        label: `${quick.name} · post now`,
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
  const suggestedCenter = trucks.find((item) => item.id === suggestion.truckId);
  const chosenCenter = trucks.find((item) => item.id === draft.truckId);

  if (draft.action && draft.action !== suggestion.action) {
    return {
      loadId: load.id,
      kind: "action",
      suggested: suggestion.action,
      chosen: draft.action,
      summary: `Suggested ${suggestion.action}; chose ${draft.action}`,
      priority: load.cargo === "pharma" || /vogel/i.test(load.customer) ? 1 : 3,
      questionId:
        load.cargo === "pharma"
          ? "cold-stop"
          : /vogel/i.test(load.customer)
            ? "friday-nordwerk"
            : `action-${load.id}`,
      guardrail: load.cargo === "pharma" || /vogel/i.test(load.customer),
    };
  }

  if (draft.truckId && draft.truckId !== suggestion.truckId) {
    return {
      loadId: load.id,
      kind: "truck",
      suggested: suggestedCenter?.name ?? suggestion.truckId,
      chosen: chosenCenter?.name ?? draft.truckId,
      summary: `Suggested ${suggestedCenter?.name ?? "coding"}; chose ${chosenCenter?.name ?? "another"}`,
      priority: load.penaltyWindow ? 2 : /vogel/i.test(load.customer) ? 2 : 3,
      questionId: load.penaltyWindow
        ? "lane-score"
        : /vogel/i.test(load.customer)
          ? "friday-nordwerk"
          : load.alpine
            ? "alpine-limit"
            : `truck-${load.id}`,
      guardrail: /vogel/i.test(load.customer) || Boolean(load.alpine),
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
      summary: `Suggested no asset number; attached asset number`,
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
