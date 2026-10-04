"use client";

import { useState } from "react";
import { formatClock, type GuardrailType, type ScreenMoment, type WorkMap, type WorkMapStep } from "@mira/core";

type Props = {
  map: WorkMap;
  moments: ScreenMoment[];
  expertName: string;
  /** Show edit controls in the detail panel. */
  onChange?: (map: WorkMap) => void;
};

export const GUARDRAIL_LABEL: Record<GuardrailType, string> = {
  limit: "limit",
  exception: "exception",
  stop_and_ask: "stop & ask",
};

export function WorkMapStats({ map }: { map: WorkMap }) {
  return (
    <div className="wm-stats">
      <span>
        <b>{map.steps.length}</b> steps
      </span>
      <span>
        <b>{map.steps.filter((s) => s.isJudgmentCall).length}</b> judgment calls
      </span>
      <span>
        <b>{map.guardrails.length}</b> guardrails
      </span>
    </div>
  );
}

export function WorkMapView({ map, moments, expertName, onChange }: Props) {
  const [activeId, setActiveId] = useState<string | null>(map.steps[0]?.id ?? null);
  const [editing, setEditing] = useState(false);
  const active = map.steps.find((s) => s.id === activeId) ?? map.steps[0];
  const firstName = expertName.split(/\s+/)[0] || "Expert";

  function patchStep(id: string, patch: Partial<WorkMapStep>) {
    onChange?.({ ...map, steps: map.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  function removeStep(id: string) {
    const steps = map.steps.filter((s) => s.id !== id);
    onChange?.({ ...map, steps });
    setActiveId(steps[0]?.id ?? null);
  }

  function patchGuardrail(id: string, rule: string) {
    onChange?.({ ...map, guardrails: map.guardrails.map((g) => (g.id === id ? { ...g, rule } : g)) });
  }

  function removeGuardrail(id: string) {
    onChange?.({
      ...map,
      guardrails: map.guardrails.filter((g) => g.id !== id),
      steps: map.steps.map((s) => ({ ...s, guardrailIds: s.guardrailIds.filter((g) => g !== id) })),
    });
  }

  if (!active) return <p className="muted">No steps in this Work Map.</p>;
  const moment = moments.find((m) => m.id === active.momentId);
  const guardrails = active.guardrailIds
    .map((id) => map.guardrails.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return (
    <div className="wm-grid">
      <ol className="wm-timeline">
        {map.steps.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={`wm-step${s.id === active.id ? " active" : ""}${s.isJudgmentCall ? " judgment" : ""}`}
              onClick={() => {
                setActiveId(s.id);
                setEditing(false);
              }}
            >
              <span className="wm-step-meta">
                Step {i + 1} of {map.steps.length} · {s.t != null ? formatClock(s.t) : "--:--"}
              </span>
              <span className="wm-step-title">
                {s.title}
                {s.isJudgmentCall ? <span className="tag">judgment call</span> : null}
              </span>
              {s.decision ? <span className="wm-step-decision">{s.decision}</span> : null}
            </button>
          </li>
        ))}
      </ol>

      <div className="wm-detail">
        <div className="wm-detail-head">
          <h3>{active.title}</h3>
          {onChange ? (
            <button className="btn-text" type="button" onClick={() => setEditing((v) => !v)}>
              {editing ? "Done" : "Edit"}
            </button>
          ) : null}
        </div>

        {moment ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL screen moment
          <img className="wm-moment" src={moment.image} alt={`Screen at ${formatClock(moment.t)}`} />
        ) : (
          <div className="wm-moment wm-moment--empty">No screen moment captured</div>
        )}

        {editing ? (
          <div className="stack wm-edit">
            <div className="field">
              <label htmlFor="wm-title">Step</label>
              <input id="wm-title" value={active.title} onChange={(e) => patchStep(active.id, { title: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="wm-decision">Decision</label>
              <textarea
                id="wm-decision"
                rows={2}
                value={active.decision}
                onChange={(e) => patchStep(active.id, { decision: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="wm-reason">Reason, in your words</label>
              <textarea
                id="wm-reason"
                rows={3}
                value={active.reason}
                onChange={(e) => patchStep(active.id, { reason: e.target.value, reasonSource: "edited" })}
              />
            </div>
            <label className="wm-check">
              <input
                type="checkbox"
                checked={active.isJudgmentCall}
                onChange={(e) => patchStep(active.id, { isJudgmentCall: e.target.checked })}
              />
              Judgment call
            </label>
            {guardrails.map((g) => (
              <div className="field" key={g.id}>
                <label htmlFor={`wm-g-${g.id}`}>Guardrail · {GUARDRAIL_LABEL[g.type]}</label>
                <div className="wm-edit-row">
                  <input id={`wm-g-${g.id}`} value={g.rule} onChange={(e) => patchGuardrail(g.id, e.target.value)} />
                  <button className="rule-remove" type="button" aria-label="Remove guardrail" onClick={() => removeGuardrail(g.id)}>
                    ×
                  </button>
                </div>
              </div>
            ))}
            {map.steps.length > 1 ? (
              <button className="btn-danger-text" type="button" onClick={() => removeStep(active.id)}>
                Delete this step
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {active.screen ? (
              <div className="wm-card">
                <span className="wm-card-label">Screen · {active.t != null ? formatClock(active.t) : "--:--"}</span>
                <p>{active.screen}</p>
              </div>
            ) : null}
            {active.decision ? (
              <div className="wm-card">
                <span className="wm-card-label">Decision</span>
                <p>{active.decision}</p>
              </div>
            ) : null}
            <div className="wm-card">
              <span className="wm-card-label">Reason · {active.reason ? active.reasonSource : "not yet explained"}</span>
              <p className={active.reason ? "wm-quote" : "muted"}>
                {active.reason ? `“${active.reason}” — ${firstName}` : "Not explained yet."}
              </p>
            </div>
            {guardrails.map((g) => (
              <div className="wm-card wm-card--guard" key={g.id}>
                <span className={`wm-badge wm-badge--${g.type}`}>{GUARDRAIL_LABEL[g.type]}</span>
                <p>
                  <strong>{g.rule}</strong>
                </p>
                {g.quote && g.quote !== g.rule ? (
                  <p className="wm-quote">
                    “{g.quote}” — {firstName}
                    {g.t != null ? `, ${formatClock(g.t)}` : ""}
                  </p>
                ) : null}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
