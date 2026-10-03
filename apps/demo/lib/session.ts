import { captureBoard } from "./data";
import { redact } from "./redact";
import {
  emptyDraft,
  uid,
  type ActionLogEntry,
  type ActionName,
  type Board,
  type Decision,
  type Draft,
  type ExpertFlag,
  type LessonId,
  type LessonMode,
  type LessonProgress,
  type Line,
  type OffRecordGap,
  type Phase,
  type QueuedQuestion,
  type ScreenEvent,
  type Seat,
  type Snapshot,
  type Truck,
  type Violation,
  type WorkMap,
} from "./types";

export type SessionState = {
  seat: Seat;
  phase: Phase;
  expertName: string;
  hireName: string;
  startedAt: number;
  lessonStartedAt: number;
  shiftEnded: boolean;
  boardId: string;
  loads: import("./types").Load[];
  trucks: Truck[];
  requiredIds: string[];
  openId: string | null;
  draft: Draft;
  done: Decision[];
  events: ScreenEvent[];
  snapshots: Snapshot[];
  lines: Line[];
  asked: string[];
  openQuestionId: string | null;
  questionAskedAt: number;
  questionQueue: QueuedQuestion[];
  debriefStage: 0 | 1 | 2 | "back";
  debrief: Record<string, string>;
  teachBackDraft: string;
  generatedTeachBack: string;
  workMap: WorkMap | null;
  lessonId: LessonId | null;
  lessonMode: LessonMode | null;
  tutorSpoke: boolean;
  interventions: number;
  progress: Record<LessonId, LessonProgress>;
  violation: Violation | null;
  saveLocked: boolean;
  replayStepId: string | null;
  frameLabel: string;
  frameCount: number;
  droppedFlash: boolean;
  lessonNote: string;
  handsSource: string;
  flags: ExpertFlag[];
  actionLog: ActionLogEntry[];
  offRecordGaps: OffRecordGap[];
  settingsOpen: boolean;
  replayPlaying: boolean;
};

function blankProgress(): Record<LessonId, LessonProgress> {
  return {
    alpine: { passed: false, caught: false, competent: false },
    cold: { passed: false, caught: false, competent: false },
    friday: { passed: false, caught: false, competent: false },
    combined: { passed: false, caught: false, competent: false },
  };
}

export function initialSession(): SessionState {
  return {
    seat: "expert",
    phase: "capture",
    expertName: "Sabine",
    hireName: "Lena",
    startedAt: Date.now(),
    lessonStartedAt: 0,
    shiftEnded: false,
    boardId: captureBoard.id,
    loads: captureBoard.loads,
    trucks: captureBoard.trucks,
    requiredIds: captureBoard.requiredIds,
    openId: null,
    draft: emptyDraft(),
    done: [],
    events: [],
    snapshots: [],
    lines: [],
    asked: [],
    openQuestionId: null,
    questionAskedAt: 0,
    questionQueue: [],
    debriefStage: 0,
    debrief: {},
    teachBackDraft: "",
    generatedTeachBack: "",
    workMap: null,
    lessonId: null,
    lessonMode: null,
    tutorSpoke: false,
    interventions: 0,
    progress: blankProgress(),
    violation: null,
    saveLocked: false,
    replayStepId: null,
    frameLabel: "Waiting for the first frame",
    frameCount: 0,
    droppedFlash: false,
    lessonNote: "",
    handsSource: "",
    flags: [],
    actionLog: [],
    offRecordGaps: [],
    settingsOpen: false,
    replayPlaying: false,
  };
}

function elapsed(state: SessionState) {
  return Date.now() - state.startedAt;
}

function stamp(
  state: SessionState,
  kind: ScreenEvent["kind"],
  label: string,
  loadId?: string,
): SessionState {
  const event: ScreenEvent = {
    id: uid("e"),
    t: elapsed(state),
    kind,
    label,
    loadId,
  };
  return {
    ...state,
    events: [...state.events, event].slice(-120),
    frameLabel: label,
    frameCount: state.frameCount + 1,
  };
}

export function openLoad(state: SessionState, id: string): SessionState {
  const load = state.loads.find((item) => item.id === id);
  if (!load) return state;
  return stamp(
    { ...state, openId: id, draft: emptyDraft(), violation: null, saveLocked: false },
    "opened",
    `Opened ${load.customer} ${load.id}`,
    id,
  );
}

export function selectTruck(state: SessionState, id: string): SessionState {
  const truck = state.trucks.find((item) => item.id === id);
  if (!truck?.available) return state;
  if (state.draft.truckId === id) return state;
  return stamp(
    {
      ...state,
      draft: { ...state.draft, truckId: id, drivers: 1 },
      violation: null,
      saveLocked: false,
    },
    "truck",
    `Selected ${truck.name}`,
    state.openId ?? undefined,
  );
}

export function setDrivers(state: SessionState, count: number): SessionState {
  const truck = state.trucks.find((item) => item.id === state.draft.truckId);
  if (!truck) return state;
  const drivers = Math.min(truck.driversAvailable, Math.max(1, count));
  if (drivers === state.draft.drivers) return state;
  return stamp(
    {
      ...state,
      draft: { ...state.draft, drivers },
      violation: null,
      saveLocked: false,
    },
    "drivers",
    `Drivers ${state.draft.drivers} → ${drivers}`,
    state.openId ?? undefined,
  );
}

export function setAction(state: SessionState, action: ActionName): SessionState {
  if (state.draft.action === action) return state;
  return stamp(
    {
      ...state,
      draft: { ...state.draft, action },
      violation: null,
      saveLocked: false,
    },
    "action",
    `Marked ${action}`,
    state.openId ?? undefined,
  );
}

export function setNote(state: SessionState, note: string): SessionState {
  return { ...state, draft: { ...state.draft, note } };
}

export function applyAssist(state: SessionState): SessionState {
  const load = state.loads.find((item) => item.id === state.openId);
  if (!load?.bait) return state;
  const truck = state.trucks.find((item) => item.id === load.bait?.truckId);
  if (!truck?.available) return state;
  const drivers = Math.min(truck.driversAvailable, load.bait.drivers);
  return stamp(
    {
      ...state,
      draft: { ...state.draft, truckId: truck.id, drivers, action: null },
      violation: null,
      saveLocked: false,
    },
    "truck",
    `Suggested ${truck.name}`,
    load.id,
  );
}

export function commitSave(state: SessionState): SessionState {
  if (!state.openId || !state.draft.action) return state;
  if (state.saveLocked) return state;
  if (state.draft.action === "assign" && !state.draft.truckId) return state;
  if (state.done.some((item) => item.loadId === state.openId)) return state;
  const load = state.loads.find((item) => item.id === state.openId);
  const decision: Decision = {
    loadId: state.openId,
    truckId: state.draft.truckId,
    drivers: state.draft.drivers,
    action: state.draft.action,
    note: state.draft.note,
    t: elapsed(state),
  };
  return stamp(
    {
      ...state,
      done: [...state.done, decision],
      draft: { ...state.draft, action: null },
      violation: null,
      saveLocked: false,
    },
    "saved",
    `Saved ${load?.customer ?? state.openId}`,
    state.openId,
  );
}

export function applyHandTarget(state: SessionState, target: string): SessionState {
  if (target.startsWith("load:")) return openLoad(state, target.slice(5));
  if (target.startsWith("truck:")) return selectTruck(state, target.slice(6));
  if (target.startsWith("action:")) return setAction(state, target.slice(7) as ActionName);
  if (target === "drivers-inc") return setDrivers(state, state.draft.drivers + 1);
  if (target === "drivers-dec") return setDrivers(state, state.draft.drivers - 1);
  if (target === "assist") return applyAssist(state);
  return state;
}

export function undoLast(state: SessionState): SessionState {
  if (state.phase !== "capture" || state.done.length === 0 || state.shiftEnded) return state;
  const last = state.done[state.done.length - 1];
  return {
    ...state,
    done: state.done.slice(0, -1),
    openId: last.loadId,
    draft: {
      truckId: last.truckId,
      drivers: last.drivers,
      action: last.action,
      note: last.note,
    },
    violation: null,
    saveLocked: false,
  };
}

export function addLine(state: SessionState, line: Omit<Line, "id" | "t" | "text"> & { text: string }) {
  return {
    ...state,
    lines: [
      ...state.lines,
      { ...line, text: redact(line.text), id: uid("ln"), t: elapsed(state) },
    ].slice(-100),
  };
}

export function askQuestion(
  state: SessionState,
  question: {
    id: string;
    text: string;
    because: string;
    guardrail: boolean;
    departure?: string;
  },
): SessionState {
  const next = addLine(state, {
    role: "apprentice",
    text: question.text,
    questionId: question.id,
    because: question.because,
    guardrail: question.guardrail,
  });
  const queue = state.questionQueue.map((item) =>
    item.id === question.id ? { ...item, status: "asking" as const } : item,
  );
  if (!queue.some((item) => item.id === question.id) && question.departure) {
    queue.push({
      id: question.id,
      text: question.text,
      because: question.because,
      departure: question.departure,
      guardrail: question.guardrail,
      status: "asking",
    });
  }
  return {
    ...next,
    asked: state.asked.includes(question.id) ? state.asked : [...state.asked, question.id],
    openQuestionId: question.id,
    questionAskedAt: Date.now(),
    questionQueue: queue,
  };
}

export function answerQuestion(state: SessionState, id: string, text: string): SessionState {
  const clean = redact(text).trim();
  if (!clean) return state;
  if (state.lines.some((line) => line.role === "expert" && line.questionId === id && !line.dropped)) {
    return state;
  }
  const next = addLine(state, { role: "expert", text: clean, questionId: id });
  return {
    ...next,
    openQuestionId: next.openQuestionId === id ? null : next.openQuestionId,
    questionQueue: next.questionQueue.map((item) =>
      item.id === id ? { ...item, status: "answered" as const } : item,
    ),
  };
}

export function dropRecord(state: SessionState): SessionState {
  const cutoff = elapsed(state) - 30_000;
  const lines = state.lines.map((line) =>
    !line.dropped && line.t >= cutoff ? { ...line, dropped: true } : line,
  );
  const snapshots = state.snapshots.map((shot) =>
    !shot.dropped && shot.t >= cutoff ? { ...shot, dropped: true } : shot,
  );
  const events = state.events.map((event) =>
    !event.dropped && event.t >= cutoff ? { ...event, dropped: true } : event,
  );
  const gap: OffRecordGap = {
    id: uid("gap"),
    t: elapsed(state),
    label: "Off the record",
  };
  let asked = state.asked;
  let openQuestionId = state.openQuestionId;
  for (const line of lines) {
    if (line.dropped && line.role === "apprentice" && line.questionId) {
      asked = asked.filter((id) => id !== line.questionId);
      if (openQuestionId === line.questionId) openQuestionId = null;
    }
  }
  return {
    ...state,
    lines,
    snapshots,
    events,
    asked,
    openQuestionId,
    droppedFlash: true,
    offRecordGaps: [...state.offRecordGaps, gap],
  };
}

export function useBoard(
  state: SessionState,
  board: Board,
  patch: Partial<SessionState> = {},
): SessionState {
  return {
    ...state,
    boardId: board.id,
    loads: board.loads,
    trucks: board.trucks,
    requiredIds: board.requiredIds,
    openId: board.loads[0]?.id ?? null,
    draft: emptyDraft(),
    done: [],
    violation: null,
    saveLocked: false,
    lessonNote: "",
    replayStepId: null,
    lessonStartedAt: Date.now(),
    interventions: 0,
    ...patch,
  };
}

export function doneCount(state: SessionState) {
  return state.requiredIds.filter((id) => state.done.some((item) => item.loadId === id)).length;
}

export function pushActionLog(state: SessionState, text: string): SessionState {
  return {
    ...state,
    actionLog: [...state.actionLog, { id: uid("log"), t: elapsed(state), text }].slice(-40),
  };
}

export function pushFlag(state: SessionState, text: string, loadId?: string): SessionState {
  return {
    ...state,
    flags: [...state.flags, { id: uid("flag"), t: elapsed(state), text, loadId }].slice(-20),
  };
}

export const STORAGE_KEY = "relay-northlane-v2";

export function loadSession(): SessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SessionState;
    if (!saved || saved.phase === undefined || !Array.isArray(saved.loads)) return null;
    return {
      ...initialSession(),
      ...saved,
      progress: { ...blankProgress(), ...saved.progress },
      draft: { ...emptyDraft(), ...saved.draft },
      questionQueue: saved.questionQueue ?? [],
      flags: saved.flags ?? [],
      actionLog: saved.actionLog ?? [],
      offRecordGaps: saved.offRecordGaps ?? [],
      seat: saved.seat ?? "expert",
      lessonMode: saved.lessonMode === "show" || saved.lessonMode === "hint" ? "try" : saved.lessonMode,
    };
  } catch {
    return null;
  }
}

export function saveSession(state: SessionState) {
  const persist = (value: SessionState) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  };
  try {
    persist(state);
  } catch {
    try {
      persist({
        ...state,
        snapshots: state.snapshots.map((shot) => ({ ...shot, image: undefined })),
      });
    } catch {
      /* the desk still runs in memory */
    }
  }
}
