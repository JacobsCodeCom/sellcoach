"use client";

import { useState } from "react";
import type { WorkMap } from "@/lib/types";
import { clock } from "@/lib/types";

export function WorkMapView({ map }: { map: WorkMap }) {
  const [selected, setSelected] = useState(map.steps[0]?.id ?? "");
  const step = map.steps.find((item) => item.id === selected) ?? map.steps[0];
  if (!step) return null;
  const timeline = [
    ...map.steps.map((item) => ({
      id: item.id,
      t: item.screenMoment.t,
      title: item.title,
      kind: "step" as const,
    })),
    ...map.offRecordGaps.map((gap) => ({
      id: gap.id,
      t: gap.t,
      title: gap.label,
      kind: "gap" as const,
    })),
  ].sort((a, b) => a.t - b.t);

  return (
    <section className="map">
      <header className="map-head">
        <div>
          <p className="kicker">Relay · memory bank</p>
          <h2>{map.expert}&apos;s shift</h2>
        </div>
        <div className="map-meters">
          <span className="stamp">{map.corrected ? "Corrected · v2" : "Confirmed"}</span>
          <div className="meter" aria-label="Completeness">
            <span style={{ width: `${map.completeness}%` }} />
            <em>{map.completeness}% complete</em>
          </div>
        </div>
      </header>
      <p className="map-prose">{map.confirmedText}</p>
      <div className="map-grid">
        <ol>
          {timeline.map((item) =>
            item.kind === "gap" ? (
              <li key={item.id} className="gap-item">
                <span>
                  {clock(item.t)} · off the record
                </span>
                {item.title}
              </li>
            ) : (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.id === step.id ? "is-on" : ""}
                  onClick={() => setSelected(item.id)}
                >
                  <span>
                    {clock(item.t)}
                  </span>
                  {item.title}
                </button>
              </li>
            ),
          )}
        </ol>
        <article className="step-card">
          <p className="kicker">
            Step {step.index} of {map.steps.length}
          </p>
          <h3>{step.title}</h3>
          {step.screenMoment.image ? (
            <img src={step.screenMoment.image} alt={step.screenMoment.label} />
          ) : null}
          <p className="quiet">
            {clock(step.screenMoment.t)} · {step.screenMoment.label}
          </p>
          <h4>Decision</h4>
          <p>{step.decision}</p>
          <h4>Reason</h4>
          <p>{step.reason}</p>
          {step.expertWords ? (
            <>
              <h4>In {map.expert}&apos;s words</h4>
              <blockquote>{step.expertWords}</blockquote>
            </>
          ) : null}
          {map.guardrails
            .filter((item) => item.stepId === step.id)
            .map((rule) => (
              <div key={rule.id} className="rule-version">
                <h4>
                  Guardrail · {rule.title} · v{rule.version}
                </h4>
                {rule.previousWords ? <p className="struck">{rule.previousWords}</p> : null}
                <blockquote>{rule.expertWords}</blockquote>
              </div>
            ))}
          {step.guardrails.length > 0 ? (
            <>
              <h4>Limits</h4>
              <ul>
                {step.guardrails.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
        </article>
      </div>
    </section>
  );
}

export function Replay({
  map,
  stepId,
  onClose,
}: {
  map: WorkMap;
  stepId: string;
  onClose: () => void;
}) {
  const step =
    map.steps.find((item) => item.id === stepId) ??
    map.steps.find((item) => item.guardrails.length);
  if (!step) return null;
  return (
    <div className="replay" role="dialog" aria-label="Screen moment">
      <article>
        <p className="kicker">
          {map.expert} · {clock(step.screenMoment.t)}
        </p>
        <h3>{step.title}</h3>
        {step.screenMoment.image ? <img src={step.screenMoment.image} alt="" /> : null}
        <blockquote>{step.expertWords}</blockquote>
        <button type="button" className="solid" onClick={onClose}>
          Close
        </button>
      </article>
    </div>
  );
}
