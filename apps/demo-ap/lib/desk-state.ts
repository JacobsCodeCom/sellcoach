import { captureBoard } from "./data";
import { checkViolation } from "./rules";
import { applySuggestion } from "./suggest";
import {
  emptyDraft,
  type ActionName,
  type Decision,
  type Draft,
  type Load,
  type Truck,
  type Violation,
} from "./types";

export type DeskState = {
  loads: Load[];
  trucks: Truck[];
  requiredIds: string[];
  openId: string | null;
  draft: Draft;
  done: Decision[];
  violation: Violation | null;
  saveLocked: boolean;
};

export function initialDesk(): DeskState {
  return {
    loads: captureBoard.loads,
    trucks: captureBoard.trucks,
    requiredIds: captureBoard.requiredIds,
    openId: null,
    draft: emptyDraft(),
    done: [],
    violation: null,
    saveLocked: false,
  };
}

function openLoad(state: DeskState, id: string): DeskState {
  const saved = state.done.find((item) => item.loadId === id);
  return {
    ...state,
    openId: id,
    draft: saved
      ? {
          truckId: saved.truckId,
          drivers: saved.drivers,
          action: saved.action,
          note: saved.note,
        }
      : emptyDraft(),
    violation: null,
    saveLocked: false,
  };
}

export function selectInvoice(state: DeskState, id: string): DeskState {
  return openLoad(state, id);
}

export function selectTruck(state: DeskState, truckId: string): DeskState {
  if (!state.openId) return state;
  const truck = state.trucks.find((item) => item.id === truckId);
  if (!truck?.available) return state;
  const draft: Draft = {
    ...state.draft,
    truckId,
    drivers: Math.min(state.draft.drivers, truck.driversAvailable),
  };
  return { ...state, draft, violation: null, saveLocked: false };
}

export function setDrivers(state: DeskState, drivers: number): DeskState {
  if (!state.openId) return state;
  const truck = state.trucks.find((item) => item.id === state.draft.truckId);
  const max = truck?.driversAvailable ?? 1;
  return {
    ...state,
    draft: { ...state.draft, drivers: Math.max(1, Math.min(max, drivers)) },
    violation: null,
    saveLocked: false,
  };
}

export function setAction(state: DeskState, action: ActionName): DeskState {
  if (!state.openId) return state;
  return {
    ...state,
    draft: { ...state.draft, action },
    violation: null,
    saveLocked: false,
  };
}

export function setNote(state: DeskState, note: string): DeskState {
  return { ...state, draft: { ...state.draft, note } };
}

export function applySuggested(state: DeskState): DeskState {
  const load = state.loads.find((item) => item.id === state.openId);
  if (!load) return state;
  const draft = applySuggestion(load, state.trucks);
  if (!draft) return state;
  return { ...state, draft, violation: null, saveLocked: false };
}

export function saveInvoice(state: DeskState): DeskState {
  const load = state.loads.find((item) => item.id === state.openId);
  if (!load || !state.draft.action) return state;
  if (state.done.some((item) => item.loadId === load.id)) return state;
  if (state.draft.action === "assign" && !state.draft.truckId) return state;

  const violation = checkViolation(load, state.draft, state.trucks);
  if (violation) {
    return { ...state, violation, saveLocked: true };
  }

  const decision: Decision = {
    loadId: load.id,
    truckId: state.draft.truckId,
    drivers: state.draft.drivers,
    action: state.draft.action,
    note: state.draft.note,
    t: Date.now(),
  };

  return {
    ...state,
    done: [...state.done, decision],
    violation: null,
    saveLocked: false,
  };
}

export function undoLast(state: DeskState): DeskState {
  if (state.done.length === 0) return state;
  const last = state.done[state.done.length - 1];
  const next = state.done.slice(0, -1);
  if (state.openId === last.loadId) {
    return {
      ...state,
      done: next,
      draft: emptyDraft(),
      violation: null,
      saveLocked: false,
    };
  }
  return { ...state, done: next };
}
