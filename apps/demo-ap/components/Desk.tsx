"use client";

import { actionLabel } from "@/lib/rules";
import type { DeskState } from "@/lib/desk-state";
import { isSuggestedTruck, suggestedFor } from "@/lib/suggest";
import type { ActionName, Load } from "@/lib/types";

function euros(amount: number) {
  return `€${amount.toLocaleString("en-US")}`;
}

export function Desk({
  state,
  onOpen,
  onTruck,
  onDrivers,
  onAction,
  onNote,
  onSave,
  onAssist,
  onUndo,
}: {
  state: DeskState;
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
  const saved = load ? state.done.some((decision) => decision.loadId === load.id) : false;
  const center = state.trucks.find((item) => item.id === state.draft.truckId) ?? null;
  const suggestion = load ? suggestedFor(load, state.trucks) : null;
  const requiredDone = state.requiredIds.filter((id) =>
    state.done.some((item) => item.loadId === id),
  ).length;
  const canSave =
    !state.saveLocked &&
    !saved &&
    Boolean(state.draft.action) &&
    (state.draft.action !== "assign" || Boolean(state.draft.truckId));

  return (
    <div className="meridian-desk">
      <section className="queue">
        <header className="col-head">
          <p className="kicker">Open invoices</p>
          <h2>Month-end queue</h2>
          <p className="quiet">
            {requiredDone}/{state.requiredIds.length} posted
          </p>
        </header>
        <div className="queue-list">
          {state.loads.map((item) => (
            <InvoiceSlip
              key={item.id}
              load={item}
              done={state.done.some((decision) => decision.loadId === item.id)}
              open={item.id === state.openId}
              onOpen={onOpen}
            />
          ))}
        </div>
        {state.done.length > 0 ? (
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
            <p className="route">
              {load.origin} <span>·</span> {load.destination}
            </p>
            <div className="chips">
              <span>{euros(load.weightT)}</span>
              <span>{load.day}</span>
              <span>{load.window}</span>
              {load.cargo === "pharma" ? (
                <span>{load.tempLabel || "Czech subsidiary"}</span>
              ) : (
                <span>Supplier</span>
              )}
              {load.alpine ? <span>Equipment</span> : null}
              {load.penaltyWindow ? <span className="chip-hot">Coding check</span> : null}
            </div>
            {load.contact ? (
              <p className="contact">
                Contact <strong>{load.contact}</strong>
              </p>
            ) : (
              <p className="contact">No contact on this invoice.</p>
            )}
            {state.violation ? (
              <div className="stop-banner">
                <p>{state.violation.title}</p>
                <blockquote>{state.violation.message}</blockquote>
                <small>{state.violation.because}</small>
              </div>
            ) : null}
            {suggestion ? (
              <button type="button" className="assist" onClick={onAssist} disabled={saved}>
                <span>Suggested</span>
                {suggestion.label}
              </button>
            ) : null}
            <label className="note">
              AP note
              <textarea
                value={state.draft.note}
                placeholder="Optional"
                onChange={(event) => onNote(event.target.value)}
                disabled={saved}
              />
            </label>
            <div className="actions">
              {(["assign", "hold", "escalate"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  className={state.draft.action === action ? "is-on" : ""}
                  onClick={() => onAction(action)}
                  disabled={saved}
                >
                  {actionLabel(action)}
                </button>
              ))}
            </div>
            <div className="save-row">
              <button type="button" className="save" disabled={!canSave} onClick={onSave}>
                {saved ? "Saved" : state.saveLocked ? "Save locked · fix the conflict" : "Save invoice"}
              </button>
              {saved ? <span className="saved-flag">On the ledger</span> : null}
            </div>
          </article>
        ) : (
          <div className="empty-ticket">
            <p>Open an invoice from the queue.</p>
            <p className="quiet">Suggested coding appears when an invoice is open.</p>
          </div>
        )}
      </section>

      <section className="trucks">
        <header className="col-head">
          <p className="kicker">Coding</p>
          <h2>Cost centers</h2>
        </header>
        {load ? (
          <div className="drivers">
            <span>Asset #</span>
            <button
              type="button"
              onClick={() => onDrivers(1)}
              disabled={saved || !center || state.draft.drivers <= 1}
            >
              −
            </button>
            <strong>{state.draft.drivers >= 2 ? "On file" : "None"}</strong>
            <button
              type="button"
              onClick={() => onDrivers(2)}
              disabled={saved || !center || state.draft.drivers >= (center.driversAvailable || 1)}
            >
              +
            </button>
            <em>{center ? (center.type === "reefer" ? "Required for capex" : "Optional") : "Pick a code"}</em>
          </div>
        ) : null}
        <div className="truck-list">
          {state.trucks.map((item) => {
            const suggested = load ? isSuggestedTruck(load, state.trucks, item.id) : false;
            return (
              <button
                key={item.id}
                type="button"
                className={`truck ${state.draft.truckId === item.id ? "is-on" : ""} ${item.available ? "" : "is-off"}`}
                onClick={() => onTruck(item.id)}
                disabled={!item.available || !load || saved}
              >
                <span className="truck-name">
                  {item.name}
                  {suggested ? <em>Suggested</em> : item.closest ? <em className="meta-em">Default</em> : null}
                </span>
                <span className="truck-meta">
                  {item.type === "reefer" ? "Capex" : "Opex / ops"} · {item.base}
                </span>
                <span className="truck-score">
                  <b>{item.laneScore}</b>
                  <small>fit</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function InvoiceSlip({
  load,
  done,
  open,
  onOpen,
}: {
  load: Load;
  done: boolean;
  open: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`slip ${open ? "is-on" : ""} ${done ? "is-done" : ""}`}
      onClick={() => onOpen(load.id)}
    >
      <span className="slip-id">{load.id}</span>
      <strong>{load.customer}</strong>
      <span>{load.origin}</span>
      <span className="slip-foot">
        {euros(load.weightT)} · {load.day}
        {done ? " · saved" : ""}
      </span>
    </button>
  );
}
