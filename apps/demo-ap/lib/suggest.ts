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

export function isSuggestedTruck(load: Load, trucks: Truck[], truckId: string) {
  return suggestedFor(load, trucks)?.truckId === truckId;
}

export function applySuggestion(load: Load, trucks: Truck[]): Draft | null {
  const suggestion = suggestedFor(load, trucks);
  if (!suggestion) return null;
  return {
    truckId: suggestion.truckId,
    drivers: suggestion.drivers,
    action: suggestion.action,
    note: "",
  };
}
