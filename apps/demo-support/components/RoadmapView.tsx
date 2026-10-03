"use client";

import { compileRoadmap } from "@/lib/lessons";
import type { SessionState } from "@/lib/session";
import type { LessonId } from "@/lib/types";
import { clock } from "@/lib/types";

export function RoadmapView({
  state,
  onRun,
  onShowOnce,
  onAgent,
  onMoonshot,
  hireMode,
}: {
  state: SessionState;
  onRun: (id: LessonId) => void;
  onShowOnce?: (id: LessonId) => void;
  onAgent: () => void;
  onMoonshot: () => void;
  hireMode?: boolean;
}) {
  if (!state.workMap) return null;
  const cards = compileRoadmap(state.workMap);
  return (
    <section className="roadmap">
      <header>
        <p className="kicker">
          Relay · {hireMode ? `${state.hireName}'s practice` : "Owner overview"}
        </p>
        <h2>
          {hireMode
            ? "Hints on the desk. Voice when you need it."
            : "Four rules. Competence is a clean save."}
        </h2>
        <p className="quiet">
          {hireMode
            ? "No cursor takeover by default. Practice against the expert’s map."
            : "Confirmed expert words become hire practice — then, optionally, an agent with the map."}
        </p>
      </header>
      <div className="cards">
        {cards.map((card) => {
          const progress = state.progress[card.id];
          return (
            <article key={card.id} className={card.locked ? "is-locked" : ""}>
              <p className="kicker">{card.kicker}</p>
              <h3>{card.title}</h3>
              <blockquote>{card.quote}</blockquote>
              <p>{card.bait}</p>
              <div className="card-meta">
                {progress.competent ? <span className="stamp">Competent</span> : null}
                {progress.passed && !progress.competent ? <span className="stamp">Passed</span> : null}
                {progress.caught ? <span className="stamp stamp-stop">Guardrail caught</span> : null}
              </div>
              {progress.evidence ? (
                <p className="evidence">
                  {progress.evidence.caseId} · interventions {progress.evidence.interventions} ·{" "}
                  {clock(progress.evidence.elapsedMs)}
                </p>
              ) : null}
              {hireMode ? (
                <div className="card-actions">
                  <button
                    type="button"
                    className="solid"
                    disabled={card.locked}
                    onClick={() => onRun(card.id)}
                  >
                    {card.locked
                      ? "Locked until the rules are confirmed"
                      : card.exam
                        ? "Sit the shift"
                        : "Practice with hints"}
                  </button>
                  {!card.exam && !card.locked && onShowOnce ? (
                    <button type="button" className="text-btn" onClick={() => onShowOnce(card.id)}>
                      Show once ({state.expertName}&apos;s cursor)
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="quiet">
                  {card.locked ? "Waiting on confirmed rules" : "Ready for the hire"}
                </p>
              )}
            </article>
          );
        })}
      </div>
      {!hireMode ? (
        <div className="roadmap-actions">
          <button type="button" className="text-btn" onClick={onMoonshot}>
            Where this goes
          </button>
          <button
            type="button"
            className="text-btn"
            disabled={!state.progress.friday.passed}
            onClick={onAgent}
          >
            Agent with the map (demo)
          </button>
        </div>
      ) : null}
    </section>
  );
}
