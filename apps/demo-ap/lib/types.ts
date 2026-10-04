export type Cargo = "general" | "pharma";

export type Weekday = "Monday" | "Wednesday" | "Thursday" | "Friday";

export type Accept = "any" | "hold-or-escalate" | "no-friday" | "assign";

export type Load = {
  id: string;
  customer: string;
  origin: string;
  destination: string;
  weightT: number;
  cargo: Cargo;
  tempLabel?: string;
  day: Weekday;
  window: string;
  penaltyWindow: boolean;
  alpine: boolean;
  contact?: string;
  accept: Accept;
  correctTruckId?: string;
  correctDrivers?: number;
  bait?: { truckId: string; drivers: number; label: string };
};

export type Truck = {
  id: string;
  name: string;
  type: "reefer" | "dry";
  capacityT: number;
  base: string;
  rateEur: number;
  laneScore: number;
  day: Weekday;
  driversAvailable: number;
  available: boolean;
  unavailableReason?: string;
  closest?: boolean;
};

export type ActionName = "assign" | "hold" | "escalate";

export type Draft = {
  truckId: string | null;
  drivers: number;
  action: ActionName | null;
  note: string;
};

export type Decision = {
  loadId: string;
  truckId: string | null;
  drivers: number;
  action: ActionName;
  note: string;
  t: number;
};

export type RuleId = "alpine-weight" | "cold-chain" | "friday-nordwerk";

export type Violation = {
  ruleId: RuleId;
  title: string;
  message: string;
  because: string;
};

export type Board = {
  id: string;
  loads: Load[];
  trucks: Truck[];
  requiredIds: string[];
};

export function emptyDraft(): Draft {
  return { truckId: null, drivers: 1, action: null, note: "" };
}
