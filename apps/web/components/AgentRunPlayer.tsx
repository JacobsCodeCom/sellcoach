"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionIntent, ActionIntentKind, ScreenMoment, WorkMap, WorkMapStep } from "@mira/core";
import { PixelAgent } from "@/components/OnboardingChat";
import { cancelSpeech, enqueueSpeech, onAgentSpeaking, speechBrief } from "@/lib/speak";

type Props = {
  summary: string;
  intents: ActionIntent[];
  source: string;
  workMap: WorkMap;
  moments: ScreenMoment[];
  /** Restart playback when this changes (e.g. new dry-run). */
  runKey: string;
};

type StepStatus = "pending" | "running" | "done" | "blocked";

const KIND_VERB: Record<ActionIntentKind, string> = {
  observe: "Looking",
  act: "Acting",
  decide: "Deciding",
  ask_human: "Asking a human",
  stop: "Hard stop",
};

const MUTE_KEY = "mira-agent-run-muted";

function stepForIntent(intent: ActionIntent, map: WorkMap): WorkMapStep | undefined {
  return intent.workMapStepId ? map.steps.find((s) => s.id === intent.workMapStepId) : undefined;
}

function momentForIntent(
  intent: ActionIntent,
  map: WorkMap,
  moments: ScreenMoment[],
): ScreenMoment | undefined {
  const step = stepForIntent(intent, map);
  if (step?.momentId) {
    const hit = moments.find((m) => m.id === step.momentId);
    if (hit) return hit;
  }
  for (const gid of intent.guardrailIds) {
    const g = map.guardrails.find((x) => x.id === gid);
    if (g?.momentId) {
      const hit = moments.find((m) => m.id === g.momentId);
      if (hit) return hit;
    }
  }
  if (moments.length) {
    const idx = map.steps.findIndex((s) => s.id === intent.workMapStepId);
    return moments[Math.min(Math.max(idx, 0), moments.length - 1)];
  }
  return undefined;
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^.+?[.!?](?=\s|$)/);
  return (match?.[0] || trimmed).trim();
}

function addsNewInfo(title: string, extra: string): boolean {
  const a = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const b = extra.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!b) return false;
  if (b === a || a.includes(b) || b.includes(a)) return false;
  const titleWords = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const extraWords = b.split(/\s+/).filter((w) => w.length > 2);
  if (!extraWords.length) return false;
  const novel = extraWords.filter((w) => !titleWords.has(w));
  return novel.length / extraWords.length >= 0.35;
}

function narrateLine(intent: ActionIntent, map: WorkMap): string {
  const title = intent.title.trim();
  const step = stepForIntent(intent, map);

  if (intent.kind === "ask_human" || intent.kind === "stop") {
    const g = intent.guardrailIds
      .map((id) => map.guardrails.find((x) => x.id === id))
      .find(Boolean);
    const why = (g?.quote || g?.rule || intent.detail || "").trim();
    if (why && addsNewInfo(title, why)) {
      return speechBrief(`${title}. ${firstSentence(why)}`, 220);
    }
    return speechBrief(title, 160);
  }

  if (intent.kind === "decide") {
    const why = (step?.reason || intent.detail || "").trim();
    if (why && addsNewInfo(title, why)) {
      return speechBrief(`${title}. ${firstSentence(why)}`, 220);
    }
    return speechBrief(title, 160);
  }

  const detail = intent.detail.trim();
  if (detail && addsNewInfo(title, detail)) {
    return speechBrief(`${title}. ${firstSentence(detail)}`, 200);
  }
  return speechBrief(title, 160);
}

function thoughtForIntent(intent: ActionIntent, map: WorkMap): string {
  return narrateLine(intent, map);
}

function mutedDwellMs(line: string, kind: ActionIntentKind): number {
  const base = Math.min(7000, Math.max(1100, line.length * 55));
  if (kind === "ask_human" || kind === "stop") return base + 400;
  return base;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function labelForStatus(status: StepStatus): string {
  if (status === "running") return "now";
  if (status === "done") return "done";
  if (status === "blocked") return "gate";
  return "";
}

function readMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AgentRunPlayer({ summary, intents, source, workMap, moments, runKey }: Props) {
  const [cursor, setCursor] = useState(-1);
  const [statuses, setStatuses] = useState<StepStatus[]>(() => intents.map(() => "pending"));
  const [playing, setPlaying] = useState(true);
  const [playToken, setPlayToken] = useState(0);
  const [finished, setFinished] = useState(false);
  const [spokenLine, setSpokenLine] = useState("");
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const lowResMoments = useMemo(() => {
    const withImage = moments.filter((m) => m.image);
    if (!withImage.length) return false;
    // Legacy captures stored ~480px JPEGs; those data URLs stay small.
    const avg = withImage.reduce((n, m) => n + m.image.length, 0) / withImage.length;
    return avg < 120_000;
  }, [moments]);

  const active = cursor >= 0 && cursor < intents.length ? intents[cursor] : null;
  const activeMoment = useMemo(
    () => (active ? momentForIntent(active, workMap, moments) : undefined),
    [active, workMap, moments],
  );
  const progress = intents.length ? `${Math.max(cursor + 1, 0)} / ${intents.length}` : "0 / 0";

  useEffect(() => {
    setMuted(readMuted());
  }, []);

  useEffect(() => onAgentSpeaking(setSpeaking), []);

  useEffect(() => {
    setCursor(-1);
    setStatuses(intents.map(() => "pending"));
    setPlaying(true);
    setFinished(false);
    setSpokenLine("");
    setPlayToken((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  useEffect(() => {
    if (!playing || !intents.length) return undefined;

    let cancelled = false;

    setCursor(-1);
    setStatuses(intents.map(() => "pending"));
    setFinished(false);
    setSpokenLine("");
    cancelSpeech();

    async function run() {
      for (let i = 0; i < intents.length; i++) {
        if (cancelled) return;
        const intent = intents[i];
        const line = narrateLine(intent, workMap);
        setCursor(i);
        setSpokenLine(line);
        setStatuses((prev) => prev.map((s, idx) => (idx === i ? "running" : s)));

        const started = Date.now();
        if (mutedRef.current) {
          await wait(mutedDwellMs(line, intent.kind));
        } else {
          await enqueueSpeech(line);
          const minDwell = intent.kind === "ask_human" || intent.kind === "stop" ? 900 : 650;
          const elapsed = Date.now() - started;
          if (elapsed < minDwell) await wait(minDwell - elapsed);
        }
        if (cancelled) return;

        const blocks = intent.kind === "ask_human" || intent.kind === "stop";
        setStatuses((prev) => prev.map((s, idx) => (idx === i ? (blocks ? "blocked" : "done") : s)));
        await wait(blocks ? 280 : 120);
      }
      if (!cancelled) {
        setFinished(true);
        setPlaying(false);
        setSpokenLine("");
      }
    }

    void run();
    return () => {
      cancelled = true;
      cancelSpeech();
    };
  }, [playToken, playing, intents, workMap]);

  useEffect(() => () => cancelSpeech(), []);

  function toggleMute() {
    setMuted((prev) => {
      const next = !prev;
      try {
        window.sessionStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (next) cancelSpeech();
      return next;
    });
  }

  function replay() {
    setFinished(false);
    setPlaying(true);
    setPlayToken((n) => n + 1);
  }

  function skipToEnd() {
    cancelSpeech();
    setPlaying(false);
    setFinished(true);
    setSpokenLine("");
    setCursor(intents.length - 1);
    setStatuses(
      intents.map((intent) =>
        intent.kind === "ask_human" || intent.kind === "stop" ? "blocked" : "done",
      ),
    );
  }

  const agentState = !muted && speaking ? "speaking" : active?.kind === "decide" && playing ? "thinking" : "waiting";

  return (
    <div className="stack agent-run">
      <div className="agent-stage">
        <div className="agent-stage-bar">
          <div>
            <strong>Simulated run</strong>
            <span className="muted"> · {source}</span>
            <span className="muted"> · {progress}</span>
            {playing && !muted ? <span className="muted"> · narrating</span> : null}
            {muted ? <span className="muted"> · muted</span> : null}
          </div>
          <div className="member-actions">
            <button className="btn" type="button" onClick={toggleMute} aria-pressed={muted}>
              {muted ? "Unmute" : "Mute"}
            </button>
            {playing ? (
              <button className="btn" type="button" onClick={skipToEnd}>
                Skip to end
              </button>
            ) : (
              <button className="btn btn-primary" type="button" onClick={replay}>
                Replay
              </button>
            )}
          </div>
        </div>

        <div className="agent-stage-screen">
          {activeMoment?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={activeMoment.image} alt="" />
          ) : (
            <div className="agent-stage-empty">
              <p className="muted">
                {active
                  ? "No screen moment for this step."
                  : playing
                    ? "Starting…"
                    : finished
                      ? "Run finished."
                      : "Ready."}
              </p>
            </div>
          )}

          {!muted ? (
            <div className="agent-stage-face" aria-hidden>
              <PixelAgent state={agentState} />
            </div>
          ) : null}

          <div
            className={`agent-subs${active ? ` agent-subs--${active.kind}` : ""}${active || finished ? " agent-subs--on" : ""}`}
          >
            {active ? (
              <>
                <p className="agent-subs-kicker">
                  <span className="tag">{active.kind}</span>
                  <span>{KIND_VERB[active.kind]}</span>
                </p>
                <p className="agent-subs-title">{active.title}</p>
                <p className="agent-subs-thought">{spokenLine || thoughtForIntent(active, workMap)}</p>
              </>
            ) : (
              <p className="agent-subs-thought">{finished ? summary : "Preparing the run…"}</p>
            )}
          </div>
        </div>
      </div>

      {lowResMoments ? (
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          These screen stills were captured at low resolution. Re-record the Work Map for sharper
          replay.
        </p>
      ) : null}

      <p>
        <strong>Run</strong>{" "}
        <span className="muted">
          ({source} · simulated{muted ? " · muted" : " · narrated"})
        </span>
      </p>
      <p className="muted">{summary}</p>

      <ol className="agent-plan-list agent-run-list">
        {intents.map((intent, i) => {
          const status = statuses[i] ?? "pending";
          const line = thoughtForIntent(intent, workMap);
          return (
            <li key={intent.id} className={`agent-run-step agent-run-step--${status}`}>
              <div className="agent-run-step-head">
                <span className="tag">{intent.kind}</span>
                <strong>{intent.title}</strong>
                <span className="agent-run-status">{labelForStatus(status)}</span>
              </div>
              <div className="muted">{line}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
