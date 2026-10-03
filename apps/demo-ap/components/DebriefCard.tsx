"use client";

import { debriefPrompts } from "@/lib/rules";
import type { SessionState } from "@/lib/session";

export function DebriefCard({
  state,
  onChange,
  onSubmit,
  onEdit,
  onConfirm,
}: {
  state: SessionState;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onEdit: (text: string) => void;
  onConfirm: () => void;
}) {
  if (state.debriefStage === "back") {
    return (
      <section className="teachback">
        <p className="kicker">Teach-back</p>
        <h2>Here is the shift. Correct one line if it is wrong.</h2>
        <textarea value={state.teachBackDraft} onChange={(event) => onEdit(event.target.value)} />
        <button type="button" className="solid" onClick={onConfirm} disabled={!state.teachBackDraft.trim()}>
          Yes, that&apos;s how it works
        </button>
      </section>
    );
  }
  const prompt = debriefPrompts()[state.debriefStage];
  const value = state.debrief[prompt.id] || "";
  return (
    <section className="interview">
      <p className="kicker">Debrief · {state.debriefStage + 1} of 3</p>
      <h2>{prompt.prompt}</h2>
      <p className="quiet">{prompt.because}</p>
      <textarea
        value={value}
        placeholder={prompt.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" className="solid" onClick={onSubmit} disabled={!value.trim()}>
        That&apos;s the reason
      </button>
    </section>
  );
}
