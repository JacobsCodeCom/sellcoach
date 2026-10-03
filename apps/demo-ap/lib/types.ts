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

export type Seat = "expert" | "hire" | "owner";

export type QueuedQuestion = {
  id: string;
  text: string;
  because: string;
  departure: string;
  guardrail: boolean;
  status: "waiting" | "holding" | "asking" | "answered" | "deferred";
};

export type ExpertFlag = {
  id: string;
  t: number;
  text: string;
  loadId?: string;
};

export type ActionLogEntry = {
  id: string;
  t: number;
  text: string;
};

export type OffRecordGap = {
  id: string;
  t: number;
  label: string;
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
  expertWords: string;
  because: string;
  target: string;
};

export type HandAction =
  | { type: "move"; target: string }
  | { type: "click"; target: string }
  | { type: "type"; target: string; text: string }
  | { type: "wait"; ms: number }
  | { type: "recoil"; target: string };

export type Phase =
  | "capture"
  | "debrief"
  | "map"
  | "roadmap"
  | "teach"
  | "agent"
  | "moonshot";

export type LessonId = "alpine" | "cold" | "friday" | "combined";

export type LessonMode = "show" | "hint" | "try" | "done";

export type ScreenEvent = {
  id: string;
  t: number;
  kind: "opened" | "truck" | "drivers" | "action" | "saved" | "frame";
  loadId?: string;
  label: string;
  dropped?: boolean;
};

export type Snapshot = {
  id: string;
  t: number;
  label: string;
  loadId: string | null;
  image?: string;
  dropped?: boolean;
};

export type Line = {
  id: string;
  role: "apprentice" | "expert" | "system";
  text: string;
  t: number;
  questionId?: string;
  because?: string;
  guardrail?: boolean;
  dropped?: boolean;
};

export type MapStep = {
  id: string;
  index: number;
  title: string;
  screenMoment: { t: number; label: string; snapshotId: string; image?: string };
  decision: string;
  reason: string;
  guardrails: string[];
  expertWords: string;
};

export type Guardrail = {
  id: RuleId;
  title: string;
  rule: string;
  expertWords: string;
  stepId: string;
  version: number;
  previousWords?: string;
};

export type WorkMap = {
  id: string;
  expert: string;
  hire: string;
  confirmedText: string;
  corrected: boolean;
  steps: MapStep[];
  guardrails: Guardrail[];
  createdAt: number;
  completeness: number;
  offRecordGaps: OffRecordGap[];
};

export type LessonProgress = {
  passed: boolean;
  caught: boolean;
  competent: boolean;
  evidence?: {
    caseId: string;
    interventions: number;
    elapsedMs: number;
  };
};

export type RoadmapCard = {
  id: LessonId;
  kicker: string;
  title: string;
  quote: string;
  bait: string;
  locked: boolean;
  exam: boolean;
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

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
