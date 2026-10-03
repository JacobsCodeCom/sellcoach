"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  { id: "capture", title: "Record", line: "Anyone talks through how they work." },
  { id: "lessons", title: "Compare", line: "The fastest method becomes the lesson." },
  { id: "roadmap", title: "Match", line: "Lessons reach the right role and level." },
  { id: "guide", title: "Guide", line: "Hints on the real job." },
] as const;

function CaptureVisual() {
  return (
    <div className="hv hv-capture">
      <span className="hv-ring" />
      <span className="hv-ring hv-ring-2" />
      <div className="hv-mic">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
        </svg>
      </div>
      <div className="hv-wave">
        {[0.45, 0.8, 0.6, 1, 0.7, 0.9, 0.5, 0.75, 0.4].map((h, i) => (
          <i key={i} style={{ ["--h" as string]: h, ["--d" as string]: `${i * 90}ms` }} />
        ))}
      </div>
    </div>
  );
}

function LessonsVisual() {
  return (
    <div className="hv hv-lessons">
      <div className="hv-bubble">
        <i />
        <i />
        <i />
      </div>
      <div className="hv-stack">
        {[0, 1, 2].map((i) => (
          <div className="hv-card" key={i} style={{ ["--i" as string]: i }}>
            <b />
            <s />
          </div>
        ))}
        <span className="hv-check">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 12.5l4 4 8-9" />
          </svg>
        </span>
      </div>
    </div>
  );
}

function RoadmapVisual() {
  const nodes = [
    [28, 128],
    [104, 92],
    [150, 58],
    [214, 34],
  ];
  return (
    <div className="hv hv-roadmap">
      <svg viewBox="0 0 240 160" aria-hidden="true">
        <path
          className="hv-road-base"
          d="M28 128 C 70 128, 70 92, 104 92 S 130 58, 150 58 S 190 34, 214 34"
        />
        <path
          className="hv-road"
          pathLength={1}
          d="M28 128 C 70 128, 70 92, 104 92 S 130 58, 150 58 S 190 34, 214 34"
        />
        {nodes.map(([cx, cy], i) => (
          <circle
            key={i}
            className="hv-node"
            cx={cx}
            cy={cy}
            r={i === nodes.length - 1 ? 9 : 7}
            style={{ ["--i" as string]: i }}
          />
        ))}
        <g className="hv-flag">
          <path d="M214 34 V 8" />
          <path className="hv-flag-cloth" d="M214 8 h18 l-5 6 l5 6 h-18 z" />
        </g>
      </svg>
    </div>
  );
}

function GuideVisual() {
  return (
    <div className="hv hv-guide">
      <div className="hv-window">
        <div className="hv-window-bar">
          <span />
          <span />
          <span />
        </div>
        <div className="hv-row" />
        <div className="hv-row hv-row-target" />
        <div className="hv-row hv-row-short" />
      </div>
      <div className="hv-hint">
        <span className="hv-hint-dot" />
        <b />
      </div>
      <svg className="hv-cursor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3l14 8-6 1.5L10 19z" />
      </svg>
    </div>
  );
}

const VISUALS = {
  capture: CaptureVisual,
  lessons: LessonsVisual,
  roadmap: RoadmapVisual,
  guide: GuideVisual,
};

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) setRevealed(true);
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`how${visible ? " is-visible" : ""}${revealed ? " is-revealed" : ""}`}
    >
      <ol className="how-grid">
        {STEPS.map((step, index) => {
          const Visual = VISUALS[step.id];
          const isActive = index === active;
          return (
            <li key={step.id} style={{ ["--stagger" as string]: `${index * 110}ms` }}>
              <button
                type="button"
                className="how-step"
                data-active={isActive}
                aria-pressed={isActive}
                onClick={() => setActive(index)}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
              >
                <div className="how-visual">
                  <Visual />
                </div>
                <div className="how-progress">
                  <span
                    className="how-fill"
                    onAnimationEnd={() => setActive((index + 1) % STEPS.length)}
                  />
                </div>
                <div className="how-caption">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{step.title}</strong>
                </div>
                <p>{step.line}</p>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
