"use client";

import { isFundamental, ledgerProgress, type Ledger } from "@mira/core";

/**
 * "What Mira knows": the five levels of the knowledge ledger filling up live.
 * Amber-ringed dots are the scripted fundamentals (Phase A); the rest fill from probes about what the expert did.
 */
export function KnowledgeLedger({ ledger }: { ledger: Ledger }) {
  const levels = ledgerProgress(ledger);
  return (
    <div className="ledger" aria-label="What Mira knows so far">
      {levels.map((lvl) => (
        <div key={lvl.level} className="ledger-level" title={lvl.slots.map((s) => `${ledger[s.id] ? (String(ledger[s.id]).startsWith("[seen]") ? "👁" : "✓") : "○"} ${s.name}${ledger[s.id] ? ": " + String(ledger[s.id]).replace(/^\[seen\]\s*/, "") : ""}`).join("\n")}>
          <div className="ledger-name">{lvl.name}</div>
          <div className="ledger-dots">
            {lvl.slots.map((s) => (
              <span
                key={s.id}
                className={`ledger-dot${ledger[s.id] ? " on" : ""}${String(ledger[s.id] ?? "").startsWith("[seen]") ? " seen" : ""}${isFundamental(s.id) ? " script" : ""}`}
                title={s.name}
              />
            ))}
          </div>
          <div className="ledger-n">
            {lvl.filled}/{lvl.slots.length}
          </div>
        </div>
      ))}
      <style jsx>{`
        .ledger { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 10px 0 14px; }
        .ledger-level { background: rgba(0, 0, 0, 0.04); border-radius: 8px; padding: 7px 8px; }
        .ledger-name { font-size: 10.5px; font-weight: 600; opacity: 0.7; margin-bottom: 5px; }
        .ledger-dots { display: flex; flex-wrap: wrap; gap: 4px; }
        .ledger-dot { width: 9px; height: 9px; border-radius: 50%; background: rgba(0, 0, 0, 0.08); border: 1px solid rgba(0, 0, 0, 0.15); display: inline-block; }
        .ledger-dot.on { background: #2ec4b6; border-color: #2ec4b6; }
        /* Filled by watching, not yet confirmed by the expert. */
        .ledger-dot.on.seen { background: transparent; border: 2px solid #2ec4b6; }
        .ledger-dot.script { box-shadow: 0 0 0 2px rgba(242, 177, 52, 0.4); }
        .ledger-n { font-size: 11px; font-weight: 600; margin-top: 5px; font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}
