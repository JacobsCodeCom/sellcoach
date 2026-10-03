"use client";

import { useEffect, useRef, useState } from "react";
import { DebriefCard } from "@/components/DebriefCard";
import { Desk } from "@/components/Desk";
import { GhostCursor, type CursorState } from "@/components/GhostCursor";
import { Moonshot } from "@/components/Moonshot";
import { Panel } from "@/components/Panel";
import { RoadmapView } from "@/components/RoadmapView";
import { Replay, WorkMapView } from "@/components/WorkMapView";
import { VoiceLayer } from "@/components/VoiceLayer";
import { boardFor, captureBoard } from "@/lib/data";
import { gateCopy, postFrame, takeSnapshot, type Gate } from "@/lib/frames";
import { scriptFor } from "@/lib/hands";
import { tipChips } from "@/lib/hints";
import { hintFor, lessonBeat, lessonTitle, quoteFor, tryBrief } from "@/lib/lessons";
import { measureTarget, playHands } from "@/lib/playHands";
import { nextCaptureQuestion, pendingDepartures } from "@/lib/questions";
import {
  checkGuardrail,
  checkViolation,
  debriefPrompts,
  isAcceptable,
  nudgeFor,
  shortTeachBack,
  teachBack,
} from "@/lib/rules";
import {
  addLine,
  answerQuestion,
  applyAssist,
  applyHandTarget,
  askQuestion,
  commitSave,
  doneCount,
  dropRecord,
  initialSession,
  loadSession,
  openLoad,
  pushActionLog,
  pushFlag,
  saveSession,
  selectTruck,
  setAction,
  setDrivers,
  setNote,
  undoLast,
  useBoard,
  type SessionState,
} from "@/lib/session";
import { cancelSpeech, enqueueSpeech, onApprenticeSpeaking } from "@/lib/speak";
import type { ActionName, HandAction, LessonId, QueuedQuestion, Seat, Violation } from "@/lib/types";
import { buildWorkMap } from "@/lib/workmap";

const PAUSE_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fillRule(actions: HandAction[], policy: string): HandAction[] {
  const text = policy.slice(0, 160);
  return actions.map((action) =>
    action.type === "type" ? { ...action, text: action.text.split("{rule}").join(text) } : action,
  );
}

function seatCaption(seat: Seat) {
  if (seat === "expert") return "Work the customer desk. Relay asks only when you leave Suggested.";
  if (seat === "hire") return "Hints on the desk. Voice when you need it. No cursor takeover.";
  return "Confirm the map. Watch competence. Agent demo stays optional.";
}

export function RelayApp() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) {
    return (
      <div className="boot">
        <em>Accounts payable example</em>
        <p>Meridian</p>
        <span>
          Demo only — fake ERP invoice desk. Not the Mira product. Relay learns departures from
          the expert seat.
        </span>
      </div>
    );
  }
  return <Session />;
}

function Session() {
  const [state, setState] = useState<SessionState>(() => loadSession() ?? initialSession());
  const stateRef = useRef(state);
  stateRef.current = state;
  const [gate, setGate] = useState<Gate>("idle");
  const [locked, setLocked] = useState(false);
  const [hot, setHot] = useState<string | null>(null);
  const [shaking, setShaking] = useState<string | null>(null);
  const [frameTick, setFrameTick] = useState(1);
  const [ear, setEar] = useState("off");
  const [voice, setVoice] = useState("Browser voice");
  const [cursor, setCursor] = useState<CursorState>({
    x: -80,
    y: -80,
    visible: false,
    pressing: false,
    label: "",
  });

  const lockedRef = useRef(false);
  const armedRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const pointerRef = useRef(false);
  const focusRef = useRef(false);
  const userSpeakingRef = useRef(false);
  const lastSpeechRef = useRef(0);
  const apprenticeRef = useRef(false);
  const lastApprenticeRef = useRef(0);
  const runRef = useRef(0);
  const spokenDebrief = useRef<string | null>(null);
  const capsRef = useRef({ eleven: false, openai: false });
  const mapGateOffRef = useRef(false);

  function commit(next: SessionState) {
    stateRef.current = next;
    setState(next);
  }

  function setBusy(value: boolean) {
    lockedRef.current = value;
    setLocked(value);
  }

  function expertLabel(mode: string) {
    return `${stateRef.current.expertName}`;
  }

  function syncQueue(value: SessionState): SessionState {
    const pending = pendingDepartures(value);
    const seen = new Set<string>();
    const unique = pending.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    const byId = new Map<string, QueuedQuestion>();
    for (const row of value.questionQueue) {
      if (row.status === "answered") byId.set(row.id, row);
    }
    for (const item of unique) {
      const prior = byId.get(item.id) ?? value.questionQueue.find((row) => row.id === item.id);
      const holding =
        pointerRef.current || focusRef.current || userSpeakingRef.current || apprenticeRef.current;
      let status: QueuedQuestion["status"] = prior?.status === "answered" ? "answered" : "waiting";
      if (prior?.status === "answered") {
        /* keep answered */
      } else if (item.deferred) status = "deferred";
      else if (value.openQuestionId === item.id) status = "asking";
      else if (value.asked.includes(item.id)) status = "answered";
      else if (holding && armedRef.current) status = "holding";
      else if (armedRef.current) status = "waiting";
      byId.set(item.id, {
        id: item.id,
        text: item.text,
        because: item.because,
        departure: item.departure,
        guardrail: item.guardrail,
        status,
      });
    }
    return { ...value, questionQueue: [...byId.values()] };
  }

  function mutate(next: SessionState, arm: boolean) {
    const previous = stateRef.current;
    let value = next;
    if (next.frameCount !== previous.frameCount) {
      const snap = takeSnapshot({
        t: Math.max(0, Date.now() - next.startedAt),
        label: next.frameLabel,
        loadId: next.openId,
        loads: next.loads,
        trucks: next.trucks,
        draft: next.draft,
      });
      value = { ...next, snapshots: [...next.snapshots, snap].slice(-36) };
      postFrame(previous.frameLabel, value.frameLabel, capsRef.current.openai ? snap.image : undefined);
    }
    if (arm && value.phase === "capture" && !value.shiftEnded) armedRef.current = true;
    lastActivityRef.current = Date.now();
    commit(syncQueue(value));
  }

  function readGate(): Gate {
    if (apprenticeRef.current && Date.now() - lastApprenticeRef.current > 8000) {
      apprenticeRef.current = false;
    }
    if (apprenticeRef.current) return "speaking";
    if (pointerRef.current) return "pointer";
    if (focusRef.current) return "typing";
    if (userSpeakingRef.current && Date.now() - lastSpeechRef.current > 2200) {
      userSpeakingRef.current = false;
    }
    if (userSpeakingRef.current) return "speech";
    const current = stateRef.current;
    if (
      current.phase === "capture" &&
      current.openQuestionId &&
      Date.now() - current.questionAskedAt < 6000
    ) {
      return "waiting";
    }
    if (armedRef.current && Date.now() - lastActivityRef.current < PAUSE_MS) return "watching";
    if (armedRef.current) return "armed";
    return "idle";
  }

  function withWords(violation: Violation) {
    const words = stateRef.current.workMap?.guardrails.find((item) => item.id === violation.ruleId)
      ?.expertWords;
    return { ...violation, expertWords: words || violation.expertWords };
  }

  async function moveTo(target: string, label: string) {
    setHot(target);
    setCursor((current) => ({ ...current, visible: true, pressing: false, label }));
    let point: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 12 && !point; attempt += 1) {
      await sleep(50);
      point = measureTarget(target);
    }
    if (!point) return;
    setCursor({ x: point.x, y: point.y, visible: true, pressing: false, label });
    await sleep(420);
  }

  async function recoilTo(target: string) {
    await moveTo(target, expertLabel("stop"));
    setShaking(target);
    setCursor((current) => ({
      ...current,
      x: Math.max(16, current.x - 76),
      y: Math.max(16, current.y - 34),
      label: expertLabel("stop"),
    }));
    await sleep(680);
    setShaking(null);
  }

  async function refuse(violation: Violation, logText?: string) {
    const current = stateRef.current;
    const words = withWords(violation);
    const progress = { ...current.progress };
    if (current.phase === "teach" && current.lessonId) {
      progress[current.lessonId] = { ...progress[current.lessonId], caught: true };
    }
    let next: SessionState = {
      ...current,
      violation: words,
      progress,
      saveLocked: true,
      tutorSpoke: current.lessonId === "combined" ? true : current.tutorSpoke,
      interventions: current.interventions + 1,
      lessonNote: `${current.expertName} would stop here.`,
    };
    if (logText) next = pushActionLog(next, logText);
    commit(next);
    await recoilTo(words.target);
    await enqueueSpeech(`${current.expertName} would stop here. ${words.expertWords}`);
  }

  function gateAfterDraft(next: SessionState, intent: "select" | "assign"): SessionState {
    if (mapGateOffRef.current) return next;
    const graded =
      (next.phase === "teach" && next.lessonMode === "try") || next.phase === "agent";
    if (!graded) return next;
    const load = next.loads.find((item) => item.id === next.openId);
    if (!load) return next;
    const result = checkGuardrail({
      load,
      draft: next.draft,
      trucks: next.trucks,
      intent,
    });
    if (result.status === "blocked" && result.violation) {
      const words = withWords(result.violation);
      const progress = { ...next.progress };
      if (next.phase === "teach" && next.lessonId) {
        progress[next.lessonId] = { ...progress[next.lessonId], caught: true };
      }
      const log = `blocked by ${words.ruleId} · ${next.expertName}${
        next.workMap?.corrected ? " · corrected in debrief" : ""
      }`;
      void (async () => {
        await recoilTo(words.target);
        await enqueueSpeech(`${next.expertName} would stop here. ${words.expertWords}`);
      })();
      return pushActionLog(
        {
          ...next,
          violation: words,
          progress,
          saveLocked: true,
          tutorSpoke: next.lessonId === "combined" ? true : next.tutorSpoke,
          interventions: next.interventions + 1,
          lessonNote: `${next.expertName} would stop here.`,
        },
        log,
      );
    }
    if (result.status === "uncovered" && result.message) {
      void enqueueSpeech(result.message);
      return pushFlag(
        {
          ...next,
          lessonNote: result.message,
          tutorSpoke: next.lessonId === "combined" ? true : next.tutorSpoke,
        },
        result.message,
        load.id,
      );
    }
    return next;
  }

  async function saveDesk() {
    const current = stateRef.current;
    const load = current.loads.find((item) => item.id === current.openId);
    if (!load || !current.draft.action) return false;
    if (current.saveLocked && !mapGateOffRef.current) return false;
    if (current.draft.action === "assign" && !current.draft.truckId) return false;
    if (current.done.some((item) => item.loadId === load.id)) return false;
    const graded =
      (current.phase === "teach" && current.lessonMode !== "show") || current.phase === "agent";
    if (graded && !mapGateOffRef.current) {
      const violation = checkViolation(load, current.draft, current.trucks);
      if (violation) {
        await refuse(
          violation,
          `blocked by ${violation.ruleId} · ${current.expertName}${
            current.workMap?.corrected ? " · corrected in debrief" : ""
          }`,
        );
        return false;
      }
    }
    if (
      current.phase === "teach" &&
      current.lessonMode === "try" &&
      !isAcceptable(load, current.draft, current.trucks)
    ) {
      if (current.lessonId === "combined") commit({ ...stateRef.current, tutorSpoke: true });
      await enqueueSpeech(nudgeFor(load, current.expertName));
      return false;
    }
    const stamped = commitSave(stateRef.current);
    if (stamped === stateRef.current) return false;
    let next = stamped;
    if (current.phase === "teach" && current.lessonMode === "try" && current.lessonId) {
      const exam = current.lessonId === "combined";
      const competent = exam && !current.tutorSpoke && !stateRef.current.tutorSpoke;
      const endedNote = exam
        ? competent
          ? `${current.hireName} ran it clean. The tutor stayed quiet.`
          : "Saved, after the tutor stepped in. Reset the case for a clean run."
        : `${current.hireName} saved it the way ${current.expertName} described.`;
      next = addLine(
        {
          ...stamped,
          lessonMode: "done",
          progress: {
            ...stamped.progress,
            [current.lessonId]: {
              passed: true,
              caught: stamped.progress[current.lessonId].caught,
              competent,
              evidence: exam
                ? {
                    caseId: load.id,
                    interventions: stamped.interventions,
                    elapsedMs: Date.now() - (stamped.lessonStartedAt || stamped.startedAt),
                  }
                : stamped.progress[current.lessonId].evidence,
            },
          },
          lessonNote: endedNote,
        },
        {
          role: "system",
          text: `${lessonBeat("done").kicker} · ${lessonTitle(current.lessonId)}. ${endedNote}`,
        },
      );
    }
    mutate(next, current.phase === "capture");
    if (current.phase === "teach" && current.lessonMode === "try" && current.lessonId !== "combined") {
      void enqueueSpeech(next.lessonNote);
    }
    return true;
  }

  function applyTarget(target: string) {
    let next = applyHandTarget(stateRef.current, target);
    if (next === stateRef.current) return;
    if (target.startsWith("truck:") || target === "assist") {
      next = gateAfterDraft(next, "select");
    }
    if (target.startsWith("action:")) {
      next = gateAfterDraft(next, "assign");
    }
    setCursor((current) => ({ ...current, pressing: true }));
    mutate(next, stateRef.current.phase === "capture");
    window.setTimeout(() => setCursor((current) => ({ ...current, pressing: false })), 140);
  }

  async function fetchPlan(task: string, policy: string) {
    const fallback = fillRule(scriptFor(task), policy);
    try {
      const response = await fetch("/api/computer-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, policy }),
      });
      if (!response.ok) return { source: "script", actions: fallback };
      const data = (await response.json()) as { source?: string; actions?: HandAction[] };
      const actions = fillRule(data.actions?.length ? data.actions : fallback, policy);
      return { source: data.source || "script", actions };
    } catch {
      return { source: "script", actions: fallback };
    }
  }

  async function startPractice(id: LessonId) {
    ++runRef.current;
    cancelSpeech();
    setCursor((current) => ({ ...current, visible: false }));
    setHot(null);
    mapGateOffRef.current = false;
    const practice = boardFor(id === "combined" ? "combined" : id, "try");
    if (!practice) return;
    const expert = stateRef.current.expertName;
    const note = id === "combined" ? tryBrief("combined") : hintFor(id, expert);
    commit(
      addLine(
        useBoard(stateRef.current, practice, {
          phase: "teach",
          seat: "hire",
          lessonId: id,
          lessonMode: "try",
          tutorSpoke: false,
          handsSource: "",
          lessonNote: note,
        }),
        {
          role: "system",
          text: `${lessonBeat("try").kicker} · ${lessonTitle(id)}. ${note}`,
        },
      ),
    );
    setBusy(false);
    if (note) void enqueueSpeech(note);
  }

  async function startShowOnce(id: LessonId) {
    if (id === "combined") {
      await startPractice(id);
      return;
    }
    const token = ++runRef.current;
    const cancelled = () => token !== runRef.current;
    cancelSpeech();
    setCursor((current) => ({ ...current, visible: false }));
    setHot(null);
    mapGateOffRef.current = false;
    const show = boardFor(id, "show");
    if (!show) return;
    const quote = quoteFor(stateRef.current.workMap, id);
    commit(
      addLine(
        useBoard(stateRef.current, show, {
          phase: "teach",
          seat: "hire",
          lessonId: id,
          lessonMode: "show",
          tutorSpoke: false,
          handsSource: "script",
          lessonNote: quote,
        }),
        {
          role: "system",
          text: `${lessonBeat("show").kicker} · ${lessonTitle(id)}. Watch ${stateRef.current.expertName} once.`,
        },
      ),
    );
    setBusy(true);
    const actions = fillRule(scriptFor(`show:${id}`), quote);
    void enqueueSpeech(quote);
    await sleep(400);
    if (cancelled()) return;
    await playHands(actions, {
      cancelled,
      apply: applyTarget,
      save: saveDesk,
      move: (target) => moveTo(target, expertLabel("show")),
      recoil: recoilTo,
      typeNote: (text) => commit(setNote(stateRef.current, text)),
      onRecoil: async () => undefined,
    });
    if (cancelled()) return;
    await startPractice(id);
  }

  async function startBlindAgent() {
    const token = ++runRef.current;
    const cancelled = () => token !== runRef.current;
    cancelSpeech();
    const board = boardFor("friday", "agent");
    if (!board) return;
    mapGateOffRef.current = true;
    commit(
      useBoard(
        pushActionLog(stateRef.current, "agent without map · follows Suggested"),
        board,
        {
          phase: "agent",
          seat: "owner",
          lessonId: null,
          lessonMode: null,
          tutorSpoke: false,
          handsSource: "script",
          lessonNote: "No Work Map. The agent takes Suggested.",
          actionLog: pushActionLog(stateRef.current, "agent without map · follows Suggested").actionLog,
        },
      ),
    );
    setBusy(true);
    await playHands(scriptFor("agent-blind"), {
      cancelled,
      apply: applyTarget,
      save: saveDesk,
      move: (target) => moveTo(target, "Agent"),
      recoil: recoilTo,
      typeNote: (text) => commit(setNote(stateRef.current, text)),
      onRecoil: async () => undefined,
    });
    mapGateOffRef.current = false;
    if (!cancelled()) {
      commit(
        pushActionLog(
          {
            ...stateRef.current,
            lessonNote: "Without the map, Suggested won. Load the map next.",
          },
          "posted Vogel December · no gate",
        ),
      );
      setBusy(false);
    }
  }

  async function startAgent() {
    const token = ++runRef.current;
    const cancelled = () => token !== runRef.current;
    cancelSpeech();
    mapGateOffRef.current = false;
    const board = boardFor("friday", "agent");
    if (!board) return;
    const policy =
      stateRef.current.workMap?.guardrails.map((item) => item.expertWords).join(" ") || "";
    commit(
      useBoard(stateRef.current, board, {
        phase: "agent",
        seat: "owner",
        lessonId: null,
        lessonMode: null,
        tutorSpoke: false,
        handsSource: "",
        lessonNote: "Routine tickets first. The gate stops where the rule starts.",
      }),
    );
    setBusy(true);
    const plan = await fetchPlan("agent", policy);
    if (cancelled()) return;
    commit(pushActionLog({ ...stateRef.current, handsSource: plan.source }, "agent with map · check_guardrail armed"));
    await playHands(plan.actions, {
      cancelled,
      apply: applyTarget,
      save: saveDesk,
      move: (target) => moveTo(target, "Agent"),
      recoil: recoilTo,
      typeNote: (text) => commit(setNote(stateRef.current, text)),
      onRecoil: async () => {
        const current = stateRef.current;
        const load = current.loads.find((item) => item.id === current.openId);
        const violation = load ? checkViolation(load, current.draft, current.trucks) : null;
        const words = violation ? withWords(violation) : null;
        const log = words
          ? `blocked by ${words.ruleId} · ${current.expertName}${
              current.workMap?.corrected ? " · corrected in debrief" : ""
            }`
          : "blocked by gate";
        commit(
          pushActionLog(
            {
              ...current,
              violation: words,
              tutorSpoke: true,
              saveLocked: true,
              lessonNote: `${current.expertName} would stop here.`,
            },
            log,
          ),
        );
        await enqueueSpeech(
          `${current.expertName} would stop here. ${words?.expertWords || "That coding breaks the rule."}`,
        );
      },
    });
    if (!cancelled()) setBusy(false);
  }

  async function playCaptureReplay() {
    const token = ++runRef.current;
    const cancelled = () => token !== runRef.current;
    cancelSpeech();
    mapGateOffRef.current = true;
    commit({
      ...initialSession(),
      seat: "owner",
      phase: "capture",
      expertName: stateRef.current.expertName,
      hireName: stateRef.current.hireName,
      workMap: stateRef.current.workMap,
      progress: stateRef.current.progress,
      replayPlaying: true,
      lessonNote: "Capture replay at 2×. Questions at real speed.",
    });
    setBusy(true);
    const steps: Array<() => Promise<void>> = [
      async () => {
        mutate(openLoad(stateRef.current, "INV-441"), false);
        await sleep(350);
        mutate(selectTruck(stateRef.current, "CC-2200"), false);
        await sleep(250);
        mutate(setAction(stateRef.current, "assign"), false);
        await sleep(200);
        mutate(commitSave(stateRef.current), false);
      },
      async () => {
        await enqueueSpeech(
          "You left Suggested (4711 · Opex) for 2200 · Maintenance on Keller & Sohn. What made you do that?",
        );
        if (cancelled()) return;
        commit(
          answerQuestion(
            askQuestion(stateRef.current, {
              id: "lane-score",
              text: "You left Suggested for 2200 · Maintenance on Keller & Sohn. What made you do that?",
              because: "Departure from Suggested",
              guardrail: false,
              departure: "Suggested 4711; chose 2200",
            }),
            "lane-score",
            "Filters belong on maintenance, not the default opex bucket.",
          ),
        );
      },
      async () => {
        mutate(openLoad(stateRef.current, "INV-448"), false);
        await sleep(300);
        mutate(selectTruck(stateRef.current, "CC-0400"), false);
        await sleep(200);
        mutate(setDrivers(stateRef.current, 2), false);
        await sleep(200);
        mutate(setAction(stateRef.current, "assign"), false);
        await sleep(200);
        mutate(commitSave(stateRef.current), false);
      },
      async () => {
        await enqueueSpeech(
          "You moved the €7,200 equipment invoice toward capex and an asset number. Suggested was opex. What made you do that?",
        );
        if (cancelled()) return;
        commit(
          answerQuestion(
            askQuestion(stateRef.current, {
              id: "alpine-limit",
              text: "You moved the €7,200 equipment invoice toward capex. Suggested was opex. What made you do that?",
              because: "Departure from Suggested coding",
              guardrail: true,
              departure: "Suggested opex; chose capex + asset",
            }),
            "alpine-limit",
            "Equipment over €5,000 is always capex. No asset number, no booking.",
          ),
        );
      },
      async () => {
        mutate(openLoad(stateRef.current, "INV-477"), false);
        await sleep(300);
        mutate(setAction(stateRef.current, "hold"), false);
        await sleep(200);
        mutate(commitSave(stateRef.current), false);
        {
          const current = stateRef.current;
          const hasFriday = current.questionQueue.some((item) => item.id === "friday-nordwerk");
          commit(
            syncQueue({
              ...current,
              questionQueue: hasFriday
                ? current.questionQueue
                : [
                    ...current.questionQueue,
                    {
                      id: "friday-nordwerk",
                      text: "You held Vogel instead of paying this week, even though Suggested said pay. Why?",
                      because: "Held for debrief",
                      departure: "Suggested pay this week; chose hold",
                      guardrail: true,
                      status: "deferred",
                    },
                  ],
              lessonNote: "Vogel departure held in the queue for debrief.",
              replayPlaying: false,
              shiftEnded: true,
            }),
          );
        }
      },
    ];
    for (const step of steps) {
      if (cancelled()) return;
      await step();
    }
    mapGateOffRef.current = false;
    setBusy(false);
  }

  function endShift() {
    const current = stateRef.current;
    if (doneCount(current) < current.requiredIds.length) return;
    spokenDebrief.current = null;
    commit(
      addLine(
        { ...current, phase: "debrief", shiftEnded: true, debriefStage: 0 },
        { role: "system", text: "Shift ended. Debrief open." },
      ),
    );
    armedRef.current = false;
  }

  function submitDebrief() {
    const current = stateRef.current;
    if (current.debriefStage === "back") return;
    const prompt = debriefPrompts()[current.debriefStage];
    const text = (current.debrief[prompt.id] || "").trim();
    if (!text) return;
    let next: SessionState = { ...current, debrief: { ...current.debrief, [prompt.id]: text } };
    next = addLine(next, {
      role: "apprentice",
      text: prompt.prompt,
      questionId: prompt.id,
      because: prompt.because,
      guardrail: true,
    });
    next = addLine(next, { role: "expert", text, questionId: prompt.id });
    const stage = current.debriefStage;
    if (stage === 0) next = { ...next, debriefStage: 1 };
    else if (stage === 1) next = { ...next, debriefStage: 2 };
    else {
      const generated = teachBack({
        expert: next.expertName,
        debrief: next.debrief,
        lines: next.lines,
      });
      next = {
        ...next,
        debriefStage: "back",
        generatedTeachBack: generated,
        teachBackDraft: generated,
      };
    }
    commit(next);
  }

  function confirmMap() {
    const current = stateRef.current;
    const captureLoads =
      current.boardId === captureBoard.id ? current.loads : captureBoard.loads;
    const captureTrucks =
      current.boardId === captureBoard.id ? current.trucks : captureBoard.trucks;
    const workMap = buildWorkMap({
      expert: current.expertName,
      hire: current.hireName,
      loads: current.loads.some((load) => load.id.startsWith("INV-"))
        ? current.loads
        : captureLoads,
      trucks: current.loads.some((load) => load.id.startsWith("INV-"))
        ? current.trucks
        : captureTrucks,
      done: current.done,
      events: current.events,
      snapshots: current.snapshots,
      lines: current.lines,
      debrief: current.debrief,
      confirmedText: current.teachBackDraft,
      generatedText: current.generatedTeachBack,
      offRecordGaps: current.offRecordGaps,
    });
    commit({ ...current, workMap, phase: "map", seat: "owner" });
  }

  function switchSeat(seat: Seat) {
    const current = stateRef.current;
    let phase = current.phase;
    if (seat === "expert") {
      phase = current.workMap ? "map" : current.shiftEnded ? "debrief" : "capture";
      if (current.workMap && phase === "map") {
        /* owner already confirmed; expert can still view map */
      } else if (!current.workMap && current.shiftEnded) phase = "debrief";
      else if (!current.workMap) phase = "capture";
    } else if (seat === "hire") {
      phase = current.workMap ? "roadmap" : current.phase;
    } else {
      phase = current.workMap
        ? current.phase === "agent" || current.phase === "moonshot"
          ? current.phase
          : "map"
        : "capture";
    }
    commit({ ...current, seat, phase });
  }

  function newShift() {
    runRef.current += 1;
    cancelSpeech();
    armedRef.current = false;
    mapGateOffRef.current = false;
    commit(initialSession());
    setBusy(false);
    setCursor({ x: -80, y: -80, visible: false, pressing: false, label: "" });
  }

  function onTruck(id: string) {
    let next = selectTruck(stateRef.current, id);
    next = gateAfterDraft(next, "select");
    mutate(next, true);
  }

  function onAction(action: ActionName) {
    let next = setAction(stateRef.current, action);
    next = gateAfterDraft(next, "assign");
    mutate(next, true);
  }

  function onAssist() {
    let next = applyAssist(stateRef.current);
    next = gateAfterDraft(next, "select");
    mutate(next, true);
  }

  useEffect(() => {
    saveSession(state);
  }, [state]);

  useEffect(() => {
    void fetch("/api/status")
      .then((response) => response.json())
      .then((data: { eleven?: boolean; openai?: boolean; agent?: boolean }) => {
        capsRef.current = { eleven: Boolean(data.eleven), openai: Boolean(data.openai) };
        if (data.eleven) setVoice(data.agent ? "ElevenLabs agent" : "ElevenLabs voice");
      })
      .catch(() => undefined);
  }, []);

  useEffect(
    () =>
      onApprenticeSpeaking((value) => {
        apprenticeRef.current = value;
        if (value) lastApprenticeRef.current = Date.now();
      }),
    [],
  );

  useEffect(() => {
    const id = window.setInterval(() => setFrameTick((value) => value + 1), 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const current = stateRef.current;
      if (current.phase !== "capture" || current.shiftEnded) return;
      const snap = takeSnapshot({
        t: Date.now() - current.startedAt,
        label: current.frameLabel,
        loadId: current.openId,
        loads: current.loads,
        trucks: current.trucks,
        draft: current.draft,
      });
      commit({ ...current, snapshots: [...current.snapshots, snap].slice(-36) });
      postFrame(current.frameLabel, current.frameLabel, capsRef.current.openai ? snap.image : undefined);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const currentGate = readGate();
      setGate(currentGate);
      commit(syncQueue(stateRef.current));
      const current = stateRef.current;
      if (current.phase !== "capture" || current.shiftEnded) return;
      if (currentGate !== "armed") return;
      if (current.openQuestionId) return;
      const question = nextCaptureQuestion(current);
      if (!question || question.deferred) return;
      armedRef.current = false;
      const asked = askQuestion(current, question);
      commit(syncQueue(asked));
      void enqueueSpeech(question.text);
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onPointerDown = () => {
      pointerRef.current = true;
      lastActivityRef.current = Date.now();
    };
    const onPointerUp = () => {
      pointerRef.current = false;
      lastActivityRef.current = Date.now();
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".desk")) {
        focusRef.current = true;
        lastActivityRef.current = Date.now();
      }
    };
    const onFocusOut = () => {
      focusRef.current = false;
      lastActivityRef.current = Date.now();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("focusout", onFocusOut, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("focusout", onFocusOut, true);
    };
  }, []);

  useEffect(() => {
    if (state.phase !== "debrief") return;
    const current = stateRef.current;
    if (current.debriefStage === "back") {
      if (spokenDebrief.current === "back") return;
      spokenDebrief.current = "back";
      void enqueueSpeech(shortTeachBack(current.expertName, current.debrief));
      return;
    }
    const prompt = debriefPrompts()[current.debriefStage];
    if (spokenDebrief.current === prompt.id) return;
    spokenDebrief.current = prompt.id;
    void enqueueSpeech(prompt.prompt);
  }, [state.phase, state.debriefStage]);

  useEffect(() => {
    if (!state.droppedFlash) return;
    const id = window.setTimeout(() => commit({ ...stateRef.current, droppedFlash: false }), 1600);
    return () => window.clearTimeout(id);
  }, [state.droppedFlash]);

  const asking = state.phase === "debrief" && state.debriefStage !== "back";
  const backing = state.phase === "debrief" && state.debriefStage === "back";
  const showDesk =
    ((state.seat === "expert" || state.seat === "hire" || state.seat === "owner") &&
      (state.phase === "capture" ||
        state.phase === "teach" ||
        state.phase === "agent" ||
        asking)) ||
    state.replayPlaying;
  const showRelayRail = state.phase !== "moonshot";
  const context = state.events
    .filter((event) => !event.dropped)
    .slice(-4)
    .map((event) => event.label)
    .join(". ");

  const expertNav = state.seat === "expert";
  const hireNav = state.seat === "hire";
  const ownerNav = state.seat === "owner";

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span>Product</span>
          <strong>Relay</strong>
        </div>
        <div className="seat-switch" role="tablist" aria-label="Seat">
          <button
            type="button"
            className={state.seat === "expert" ? "is-on" : ""}
            onClick={() => switchSeat("expert")}
          >
            Expert
          </button>
          <button
            type="button"
            className={state.seat === "hire" ? "is-on" : ""}
            onClick={() => switchSeat("hire")}
          >
            New hire
          </button>
          <button
            type="button"
            className={state.seat === "owner" ? "is-on" : ""}
            onClick={() => switchSeat("owner")}
          >
            Owner
          </button>
        </div>
        <p className="seat-caption">{seatCaption(state.seat)}</p>
        <nav>
          {expertNav ? (
            <>
              <PhaseButton
                label="Capture"
                on={state.phase === "capture"}
                disabled={Boolean(state.workMap)}
                onClick={() => commit({ ...stateRef.current, phase: "capture" })}
              />
              <PhaseButton
                label="Debrief"
                on={state.phase === "debrief"}
                disabled={!state.shiftEnded || Boolean(state.workMap)}
                onClick={() => commit({ ...stateRef.current, phase: "debrief" })}
              />
              <PhaseButton
                label="Work map"
                on={state.phase === "map"}
                disabled={!state.workMap}
                onClick={() => commit({ ...stateRef.current, phase: "map" })}
              />
            </>
          ) : null}
          {hireNav ? (
            <>
              <PhaseButton
                label="Roadmap"
                on={state.phase === "roadmap"}
                disabled={!state.workMap}
                onClick={() => commit({ ...stateRef.current, phase: "roadmap" })}
              />
              <PhaseButton
                label={
                  state.phase === "teach" && state.lessonId && state.lessonMode
                    ? `${lessonBeat(state.lessonMode).mark} · ${lessonTitle(state.lessonId)}`
                    : "Lesson"
                }
                on={state.phase === "teach"}
                disabled={state.phase !== "teach"}
                onClick={() => undefined}
              />
            </>
          ) : null}
          {ownerNav ? (
            <>
              <PhaseButton
                label="Work map"
                on={state.phase === "map"}
                disabled={!state.workMap}
                onClick={() => commit({ ...stateRef.current, phase: "map" })}
              />
              <PhaseButton
                label="Roadmap"
                on={state.phase === "roadmap" || state.phase === "moonshot"}
                disabled={!state.workMap}
                onClick={() => commit({ ...stateRef.current, phase: "roadmap" })}
              />
            </>
          ) : null}
        </nav>
        <div className="top-actions">
          <button
            type="button"
            className="text-btn"
            onClick={() =>
              commit({ ...stateRef.current, settingsOpen: !stateRef.current.settingsOpen })
            }
          >
            Names
          </button>
          {state.phase === "capture" && state.seat === "expert" ? (
            <button
              type="button"
              className="solid"
              disabled={doneCount(state) < state.requiredIds.length}
              onClick={endShift}
            >
              End shift
            </button>
          ) : null}
          {asking ? (
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                spokenDebrief.current = null;
                commit({ ...stateRef.current, phase: "capture", shiftEnded: false });
              }}
            >
              Return to the desk
            </button>
          ) : null}
          <button type="button" className="text-btn" onClick={newShift}>
            New shift
          </button>
        </div>
        {state.settingsOpen ? (
          <div className="settings-pop">
            <label>
              Expert
              <input
                value={state.expertName}
                onChange={(event) =>
                  commit({ ...stateRef.current, expertName: event.target.value })
                }
              />
            </label>
            <label>
              Hire
              <input
                value={state.hireName}
                onChange={(event) => commit({ ...stateRef.current, hireName: event.target.value })}
              />
            </label>
          </div>
        ) : null}
      </header>

      <div className={`workspace is-${state.phase}${backing ? " is-back" : ""}`}>
        {showDesk ? (
          <Desk
            state={state}
            locked={locked || asking}
            hot={hot}
            shaking={shaking}
            showAssist={state.phase === "teach" || state.phase === "agent" || state.phase === "capture"}
            showCue={state.phase === "capture" && state.seat === "expert"}
            tips={
              state.seat === "hire" && state.phase === "teach" && state.lessonMode === "try"
                ? tipChips(state.lessonId, state.expertName)
                : []
            }
            onOpen={(id) => mutate(openLoad(stateRef.current, id), true)}
            onTruck={onTruck}
            onDrivers={(count) => mutate(setDrivers(stateRef.current, count), true)}
            onAction={onAction}
            onNote={(note) => {
              lastActivityRef.current = Date.now();
              commit(setNote(stateRef.current, note));
            }}
            onSave={() => void saveDesk()}
            onAssist={onAssist}
            onUndo={() => commit(undoLast(stateRef.current))}
          />
        ) : null}
        {backing ? (
          <DebriefCard
            state={state}
            onChange={() => undefined}
            onSubmit={() => undefined}
            onEdit={(text) => commit({ ...stateRef.current, teachBackDraft: text })}
            onConfirm={confirmMap}
          />
        ) : null}
        {state.phase === "map" && state.workMap ? <WorkMapView map={state.workMap} /> : null}
        {state.phase === "roadmap" ? (
          <RoadmapView
            state={state}
            hireMode={state.seat === "hire"}
            onRun={(id) => void startPractice(id)}
            onShowOnce={(id) => void startShowOnce(id)}
            onAgent={() => void startAgent()}
            onMoonshot={() => commit({ ...stateRef.current, phase: "moonshot" })}
          />
        ) : null}
        {state.phase === "moonshot" ? (
          <Moonshot
            state={state}
            onBack={() => commit({ ...stateRef.current, phase: "roadmap" })}
          />
        ) : null}
        {showRelayRail ? (
          <div className="rail relay-frame">
            <header className="product-frame-head">
              <div>
                <p className="kicker">Relay · product</p>
                <strong>
                  {state.phase === "capture"
                    ? "Interviewer"
                    : state.phase === "teach" && state.lessonId && state.lessonMode
                      ? `${lessonBeat(state.lessonMode).kicker} · ${lessonTitle(state.lessonId)}`
                      : state.phase === "teach" || state.phase === "agent"
                        ? "Tutor · hints"
                        : "Company memory"}
                </strong>
              </div>
              <span className="frame-pill">{voice}</span>
            </header>
            {asking ? (
              <DebriefCard
                state={state}
                onChange={(text) => {
                  const prompt = debriefPrompts()[stateRef.current.debriefStage as 0 | 1 | 2];
                  commit({
                    ...stateRef.current,
                    debrief: { ...stateRef.current.debrief, [prompt.id]: text },
                  });
                }}
                onSubmit={submitDebrief}
                onEdit={() => undefined}
                onConfirm={() => undefined}
              />
            ) : null}
            <Panel
              state={state}
              gate={gate}
              ear={ear}
              voice={voice}
              frameTick={frameTick}
              onAnswer={(text) => {
                if (!stateRef.current.openQuestionId) return;
                commit(answerQuestion(stateRef.current, stateRef.current.openQuestionId, text));
                lastActivityRef.current = Date.now();
              }}
              onDrop={() => commit(dropRecord(stateRef.current))}
              onReplay={() => {
                const id = stateRef.current.violation?.ruleId;
                if (id) commit({ ...stateRef.current, replayStepId: id });
              }}
              onAgent={() => void startAgent()}
              onBlindAgent={() => void startBlindAgent()}
              onCaptureReplay={() => void playCaptureReplay()}
              onRoadmap={() => commit({ ...stateRef.current, phase: "roadmap", seat: "hire" })}
              onMoonshot={() => commit({ ...stateRef.current, phase: "moonshot" })}
              onResetExam={() => {
                const board = boardFor("combined", "try");
                if (!board) return;
                commit(
                  useBoard(stateRef.current, board, {
                    phase: "teach",
                    seat: "hire",
                    lessonId: "combined",
                    lessonMode: "try",
                    tutorSpoke: false,
                    lessonNote: tryBrief("combined"),
                  }),
                );
              }}
            />
          </div>
        ) : null}
      </div>

      <GhostCursor cursor={cursor} />
      {state.replayStepId && state.workMap ? (
        <Replay
          map={state.workMap}
          stepId={state.replayStepId}
          onClose={() => commit({ ...stateRef.current, replayStepId: null })}
        />
      ) : null}
      <VoiceLayer
        context={context}
        tool={() => {
          const current = stateRef.current;
          return JSON.stringify({
            open: current.openId,
            draft: current.draft,
            queue: current.questionQueue.map((item) => ({
              id: item.id,
              status: item.status,
              departure: item.departure,
            })),
            recent: current.events
              .filter((event) => !event.dropped)
              .slice(-6)
              .map((event) => event.label),
          });
        }}
        onSpeaking={(value) => {
          const wasSpeaking = userSpeakingRef.current;
          userSpeakingRef.current = value;
          if (value) lastSpeechRef.current = Date.now();
          if (value || wasSpeaking) lastActivityRef.current = Date.now();
        }}
        onUtterance={(text) => {
          const current = stateRef.current;
          lastActivityRef.current = Date.now();
          if (current.phase === "capture" && current.openQuestionId) {
            commit(answerQuestion(current, current.openQuestionId, text));
            return;
          }
          if (current.phase === "debrief" && current.debriefStage !== "back") {
            const prompt = debriefPrompts()[current.debriefStage];
            const existing = current.debrief[prompt.id] || "";
            if (existing.includes(text)) return;
            commit({
              ...current,
              debrief: { ...current.debrief, [prompt.id]: `${existing} ${text}`.trim() },
            });
          }
        }}
        onEar={setEar}
      />
      <p className="sr-only" aria-live="polite">
        {gateCopy(gate)}
      </p>
    </div>
  );
}

function PhaseButton({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={on ? "is-on" : ""} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}
