"use client";

import type { SessionState } from "@/lib/session";

export function Moonshot({ state, onBack }: { state: SessionState; onBack: () => void }) {
  return (
    <section className="moon">
      <p className="kicker">Where this goes</p>
      <h2>Voice in. Sparse hints. The map is the permission.</h2>
      <p className="moon-lead">
        Relay stays on top of software people already use — like Northlane. It listens for departures
        from Suggested, asks in voice, and leaves tip chips for the hire. No continuous screen
        record. Hands and agents only move with a confirmed Work Map.
      </p>
      <div className="moon-grid">
        <article>
          <h3>Learn from real work</h3>
          <p>
            {state.expertName}&apos;s departures become the playbook — one rule at a time, not a LMS
            course.
          </p>
        </article>
        <article>
          <h3>Coach without takeover</h3>
          <p>
            {state.hireName} gets hints and a whisper. The cursor Show is optional. Save locks when a
            confirmed rule is broken.
          </p>
        </article>
        <article>
          <h3>Agents come last</h3>
          <p>
            With the map, an agent can clear routine tickets and stop where {state.expertName} would
            stop. Without the map, Suggested wins — and that&apos;s the point.
          </p>
        </article>
      </div>
      <button type="button" className="solid" onClick={onBack}>
        Back to the roadmap
      </button>
    </section>
  );
}
