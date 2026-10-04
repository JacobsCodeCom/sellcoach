"use client";

import { useCallback, useState } from "react";
import { Desk } from "@/components/Desk";
import {
  applySuggested,
  initialDesk,
  saveInvoice,
  selectInvoice,
  selectTruck,
  setAction,
  setDrivers,
  setNote,
  undoLast,
  type DeskState,
} from "@/lib/desk-state";
import type { ActionName } from "@/lib/types";

export function MeridianApp() {
  const [state, setState] = useState<DeskState>(() => initialDesk());

  const patch = useCallback((fn: (current: DeskState) => DeskState) => {
    setState((current) => fn(current));
  }, []);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span>Meridian ERP</span>
          <strong>Accounts payable</strong>
        </div>
        <p className="seat-caption">Stuttgart plant · month-end invoice desk</p>
        <div className="top-actions">
          <button type="button" className="text-btn" onClick={() => setState(initialDesk())}>
            Reset queue
          </button>
        </div>
      </header>
      <main className="workspace">
        <Desk
          state={state}
          onOpen={(id) => patch((current) => selectInvoice(current, id))}
          onTruck={(id) => patch((current) => selectTruck(current, id))}
          onDrivers={(count) => patch((current) => setDrivers(current, count))}
          onAction={(action: ActionName) => patch((current) => setAction(current, action))}
          onNote={(note) => patch((current) => setNote(current, note))}
          onSave={() => patch((current) => saveInvoice(current))}
          onAssist={() => patch((current) => applySuggested(current))}
          onUndo={() => patch((current) => undoLast(current))}
        />
      </main>
    </div>
  );
}
