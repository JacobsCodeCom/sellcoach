"use client";

import { lessonBeat, lessonTitle } from "@/lib/lessons";
import type { SessionState } from "@/lib/session";
import { actionLabel } from "@/lib/rules";
import { isSuggestedTruck, suggestedFor } from "@/lib/suggest";
import type { ActionName, LessonId, LessonMode, Load, Truck } from "@/lib/types";

function pathById(trucks: Truck[], id: string | null) {
  return trucks.find((item) => item.id === id) ?? null;
}

export function Desk({
  state,
  locked,
  hot,
  shaking,
  showAssist,
  showCue,
  tips = [],
  onOpen,
  onTruck,
  onDrivers,
  onAction,
  onNote,
  onSave,
  onAssist,
  onUndo,
}: {
  state: SessionState;
  locked: boolean;
  hot: string | null;
  shaking: string | null;
  showAssist: boolean;
  showCue: boolean;
  tips?: string[];
  onOpen: (id: string) => void;
  onTruck: (id: string) => void;
  onDrivers: (count: number) => void;
  onAction: (action: ActionName) => void;
  onNote: (note: string) => void;
  onSave: () => void;
  onAssist: () => void;
  onUndo: () => void;
}) {
  const load = state.loads.find((item) => item.id === state.openId) ?? null;
  const saved = load ? state.done.some((item) => item.loadId === load.id) : false;
  const path = pathById(state.trucks, state.draft.truckId);
  const suggestion = load ? suggestedFor(load, state.trucks) : null;
  const requiredDone = state.requiredIds.filter((id) =>
    state.done.some((item) => item.loadId === id),
  ).length;
  const canSave =
    !locked &&
    !state.saveLocked &&
    !saved &&
    Boolean(state.draft.action) &&
    (state.draft.action !== "assign" || Boolean(state.draft.truckId));

  const teaching = state.phase === "teach" && state.lessonId && state.lessonMode;
  const lessonMode = teaching ? state.lessonMode : null;

  return (
    <div
      className={`northlane-frame ${locked ? "is-locked-frame" : ""}${
        lessonMode ? ` is-lesson is-lesson-${lessonMode}` : ""
      }`}
    >
      <header className="product-frame-head">
        <div>
          <p className="kicker">Acme Ops · support</p>
          <strong>Customer software · not Relay</strong>
        </div>
        <span className="frame-pill">Their desk</span>
      </header>
      {teaching && state.lessonId && state.lessonMode ? (
        <Banner mode={state.lessonMode} lessonId={state.lessonId} expertName={state.expertName} />
      ) : null}
      {tips.length > 0 ? (
        <div className="tip-stack" aria-live="polite">
          {tips.map((tip, index) => (
            <div key={`${index}-${tip.slice(0, 24)}`} className="tip-chip">
              {index === 0 ? <strong>Relay hint</strong> : null}
              {tip}
            </div>
          ))}
        </div>
      ) : null}
      <div className={`desk ${locked ? "is-locked" : ""}`}>
        <section className="queue">
          <header className="col-head">
            <p className="kicker">Open tickets</p>
            <h2>Today&apos;s queue</h2>
            {state.requiredIds.length > 0 ? (
              <p className="quiet">
                {requiredDone}/{state.requiredIds.length} required
              </p>
            ) : null}
          </header>
          <div className="queue-list">
            {state.loads.map((item) => (
              <TicketSlip
                key={item.id}
                load={item}
                done={state.done.some((decision) => decision.loadId === item.id)}
                open={item.id === state.openId}
                hot={hot === `load:${item.id}`}
                onOpen={onOpen}
              />
            ))}
          </div>
          {showCue ? <ExpertCard /> : null}
          {state.phase === "capture" && state.done.length > 0 && !state.shiftEnded ? (
            <button type="button" className="text-btn" onClick={onUndo}>
              Undo last save
            </button>
          ) : null}
        </section>

        <section className="ticket-wrap">
          {load ? (
            <article className="ticket">
              <p className="ticket-id">{load.id}</p>
              <h2>{load.customer}</h2>
              <p className="route">{load.origin}</p>
              <div className="chips">
                <span>{load.window}</span>
                <span>{load.day}</span>
                {load.cargo === "pharma" ? (
                  <span>{load.tempLabel || "Renewal <30d"}</span>
                ) : (
                  <span>General</span>
                )}
                {load.alpine ? <span className="chip-hot">Cancel cue ×2</span> : null}
                {load.penaltyWindow ? <span>Reply check</span> : null}
              </div>
              {load.contact ? (
                <p className="contact">
                  From <strong>{load.contact}</strong>
                </p>
              ) : (
                <p className="contact">No contact on this ticket.</p>
              )}
              {state.violation ? (
                <div className="stop-banner">
                  <p>{state.expertName} would stop here.</p>
                  <blockquote>{state.violation.expertWords}</blockquote>
                </div>
              ) : null}
              {suggestion ? (
                <button
                  type="button"
                  className={`assist ${hot === "assist" ? "is-hot" : ""}`}
                  data-hand="assist"
                  onClick={onAssist}
                  disabled={!showAssist && state.phase !== "capture"}
                >
                  <span>Suggested</span>
                  {suggestion.label}
                </button>
              ) : null}
              {showAssist && !suggestion && load.bait ? (
                <button
                  type="button"
                  className={`assist ${hot === "assist" ? "is-hot" : ""}`}
                  data-hand="assist"
                  onClick={onAssist}
                >
                  <span>Suggested</span>
                  {load.bait.label}
                </button>
              ) : null}
              <label className="note">
                Health note
                <textarea
                  data-hand="note"
                  value={state.draft.note}
                  placeholder="Competitor names, cancel cues…"
                  onChange={(event) => onNote(event.target.value)}
                />
              </label>
              <div className="actions">
                {(["assign", "hold", "escalate"] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    data-hand={`action:${action}`}
                    className={`${state.draft.action === action ? "is-on" : ""} ${hot === `action:${action}` ? "is-hot" : ""} ${shaking === `action:${action}` ? "is-shaking" : ""}`}
                    onClick={() => onAction(action)}
                  >
                    {actionLabel(action)}
                  </button>
                ))}
              </div>
              <div className="save-row">
                <button
                  type="button"
                  className={`save ${hot === "save" ? "is-hot" : ""} ${shaking === "save" ? "is-shaking" : ""}`}
                  data-hand="save"
                  disabled={!canSave}
                  onClick={onSave}
                >
                  {saved ? "Saved" : state.saveLocked ? "Save locked · fix the conflict" : "Save ticket"}
                </button>
                {saved ? <span className="saved-flag">On the queue</span> : null}
              </div>
            </article>
          ) : (
            <div className="empty-ticket">
              <p>Open a ticket.</p>
              <p className="quiet">Relay stays quiet until you leave Suggested.</p>
            </div>
          )}
        </section>

        <section className="trucks">
          <header className="col-head">
            <p className="kicker">Reply paths</p>
            <h2>Playbooks</h2>
          </header>
          {load ? (
            <div className={`drivers ${shaking === "drivers-inc" ? "is-shaking" : ""}`}>
              <span>Renewal timeline</span>
              <button
                type="button"
                data-hand="drivers-dec"
                onClick={() => onDrivers(1)}
                disabled={!path || state.draft.drivers <= 1}
              >
                −
              </button>
              <strong className={hot === "drivers-inc" ? "is-hot" : ""}>
                {state.draft.drivers >= 2 ? "Open" : "Closed"}
              </strong>
              <button
                type="button"
                data-hand="drivers-inc"
                className={hot === "drivers-inc" ? "is-hot" : ""}
                onClick={() => onDrivers(2)}
                disabled={!path || state.draft.drivers >= (path.driversAvailable || 1)}
              >
                +
              </button>
              <em>{load.cargo === "pharma" ? "Required inside 30 days" : "Optional"}</em>
            </div>
          ) : null}
          <div className="truck-list">
            {state.trucks.map((item) => {
              const suggested = load ? isSuggestedTruck(load, state.trucks, item.id) : false;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-hand={`truck:${item.id}`}
                  className={`truck ${state.draft.truckId === item.id ? "is-on" : ""} ${hot === `truck:${item.id}` ? "is-hot" : ""} ${shaking === `truck:${item.id}` ? "is-shaking" : ""} ${item.available ? "" : "is-off"}`}
                  onClick={() => onTruck(item.id)}
                  disabled={!item.available || !load}
                >
                  <span className="truck-name">
                    {item.name}
                    {suggested ? <em>Suggested</em> : item.closest ? <em className="meta-em">Default</em> : null}
                  </span>
                  <span className="truck-meta">
                    {item.type === "reefer" ? "Renewal-aware" : "Standard"} · {item.base}
                  </span>
                  <span className="truck-score">
                    <b>{item.laneScore}</b>
                    <small>fit</small>
                  </span>
                  {!item.available ? <span className="truck-wait">{item.unavailableReason}</span> : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function TicketSlip({
  load,
  done,
  open,
  hot,
  onOpen,
}: {
  load: Load;
  done: boolean;
  open: boolean;
  hot: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-hand={`load:${load.id}`}
      className={`slip ${open ? "is-on" : ""} ${done ? "is-done" : ""} ${hot ? "is-hot" : ""}`}
      onClick={() => onOpen(load.id)}
    >
      <span className="slip-id">{load.id}</span>
      <strong>{load.customer}</strong>
      <span>{load.origin}</span>
      <span className="slip-foot">
        {load.window}
        {done ? " · saved" : ""}
      </span>
    </button>
  );
}

function ExpertCard() {
  return (
    <details className="cue" open>
      <summary>Expert card · for the judge</summary>
      <p>1. Brightfield: leave Suggested standard close. Take Health-check reply.</p>
      <p>2. Northwind: second cancel mention. Escalate — do not Close.</p>
      <p>3. RivalSoft / CompetitorX: Suggested is close-with-macro. Escalate and note the name. Debrief will ask.</p>
    </details>
  );
}

export function Banner({
  mode,
  lessonId,
  expertName,
}: {
  mode: LessonMode;
  lessonId: LessonId;
  expertName: string;
}) {
  const beat = lessonBeat(mode);
  const title = lessonTitle(lessonId);
  const detail =
    mode === "show"
      ? `${expertName} on the glass · watch once, then the mouse is yours`
      : mode === "try"
        ? "Tip chips on the desk · voice when you need it"
        : mode === "done"
          ? "Beat closed · back to the roadmap when ready"
          : beat.lead;

  return (
    <div className={`lesson-banner is-${mode}`} role="status">
      <div className="lesson-banner-mark">{beat.mark}</div>
      <div className="lesson-banner-copy">
        <p className="kicker">{beat.kicker}</p>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}
