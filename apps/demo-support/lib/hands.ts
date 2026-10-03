import type { HandAction } from "./types";

export type HandSpec = {
  mustClick: string[];
  forbidClick: string[];
  mustRecoil?: boolean;
  badLoad?: string;
};

const showFriday: HandAction[] = [
  { type: "click", target: "load:CP-1" },
  { type: "move", target: "assist" },
  { type: "wait", ms: 700 },
  { type: "click", target: "action:escalate" },
  { type: "type", target: "note", text: "{rule}" },
  { type: "move", target: "save" },
  { type: "click", target: "save" },
];

const showAlpine: HandAction[] = [
  { type: "click", target: "load:CH-1" },
  { type: "move", target: "assist" },
  { type: "wait", ms: 700 },
  { type: "click", target: "action:escalate" },
  { type: "type", target: "note", text: "{rule}" },
  { type: "move", target: "save" },
  { type: "click", target: "save" },
];

const showCold: HandAction[] = [
  { type: "click", target: "load:RN-1" },
  { type: "move", target: "assist" },
  { type: "wait", ms: 800 },
  { type: "click", target: "truck:RN-RENEW" },
  { type: "click", target: "drivers-inc" },
  { type: "click", target: "action:assign" },
  { type: "type", target: "note", text: "{rule}" },
  { type: "move", target: "save" },
  { type: "click", target: "save" },
];

const agentPlan: HandAction[] = [
  { type: "click", target: "load:AG-1" },
  { type: "click", target: "truck:AG-OK" },
  { type: "click", target: "action:assign" },
  { type: "click", target: "save" },
  { type: "click", target: "load:AG-3" },
  { type: "wait", ms: 350 },
  { type: "click", target: "truck:AG-CLOSE" },
  { type: "wait", ms: 500 },
  { type: "recoil", target: "action:assign" },
];

const agentBlind: HandAction[] = [
  { type: "click", target: "load:AG-3" },
  { type: "click", target: "assist" },
  { type: "click", target: "action:assign" },
  { type: "click", target: "save" },
  { type: "wait", ms: 900 },
];

const scripts: Record<string, HandAction[]> = {
  "show:friday": showFriday,
  "show:alpine": showAlpine,
  "show:cold": showCold,
  agent: agentPlan,
  "agent-blind": agentBlind,
};

const specs: Record<string, HandSpec> = {
  "show:friday": {
    mustClick: ["load:CP-1", "action:escalate", "save"],
    forbidClick: ["assist", "action:assign"],
  },
  "show:alpine": {
    mustClick: ["load:CH-1", "action:escalate", "save"],
    forbidClick: ["action:assign"],
  },
  "show:cold": {
    mustClick: ["load:RN-1", "truck:RN-RENEW", "drivers-inc", "action:assign", "save"],
    forbidClick: ["assist"],
  },
  agent: {
    mustClick: ["load:AG-1", "truck:AG-OK", "save", "load:AG-3", "truck:AG-CLOSE"],
    forbidClick: [],
    mustRecoil: true,
    badLoad: "load:AG-3",
  },
  "agent-blind": {
    mustClick: ["load:AG-3", "assist", "action:assign", "save"],
    forbidClick: [],
  },
};

export function scriptFor(task: string): HandAction[] {
  return scripts[task] ? scripts[task].map((action) => ({ ...action })) : [];
}

export function allowedTargets(task: string) {
  const set = new Set<string>([
    "save",
    "assist",
    "drivers-inc",
    "drivers-dec",
    "note",
    "action:assign",
    "action:hold",
    "action:escalate",
  ]);
  for (const action of scriptFor(task)) {
    if ("target" in action) set.add(action.target);
  }
  return [...set];
}

export function planIsSafe(task: string, actions: HandAction[]) {
  const spec = specs[task];
  if (!spec) return false;
  const clicks = actions.filter((action) => action.type === "click").map((action) => action.target);
  if (spec.mustClick.some((target) => !clicks.includes(target))) return false;
  if (spec.forbidClick.some((target) => clicks.includes(target))) return false;
  if (spec.mustRecoil) {
    const recoilAt = actions.findIndex((action) => action.type === "recoil");
    if (recoilAt < 0) return false;
    if (actions.slice(recoilAt + 1).length > 0) return false;
    const before = actions.slice(0, recoilAt);
    const lastSave = before.findLastIndex(
      (action) => action.type === "click" && action.target === "save",
    );
    const badOpen = before.findLastIndex(
      (action) => action.type === "click" && action.target === spec.badLoad,
    );
    if (spec.badLoad && badOpen >= 0 && lastSave > badOpen) return false;
  }
  return true;
}

export function sanitizeActions(raw: unknown, task: string): HandAction[] {
  const fallback = scriptFor(task);
  const allowed = new Set(allowedTargets(task));
  if (!Array.isArray(raw)) return fallback;
  const actions: HandAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return fallback;
    const record = item as { type?: string; target?: string; text?: string; ms?: number };
    if (record.type === "wait") {
      const ms = Math.min(2000, Math.max(100, Number(record.ms) || 400));
      actions.push({ type: "wait", ms });
      continue;
    }
    const target = String(record.target || "");
    if (!allowed.has(target)) return fallback;
    if (record.type === "type") {
      actions.push({ type: "type", target, text: String(record.text || "").slice(0, 90) });
      continue;
    }
    if (record.type === "move" || record.type === "click" || record.type === "recoil") {
      actions.push({ type: record.type, target });
      continue;
    }
    return fallback;
  }
  if (!planIsSafe(task, actions)) return fallback;
  return actions;
}
