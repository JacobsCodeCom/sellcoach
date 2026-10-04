type Props = {
  steps: string[];
  /** Index of the current step. */
  active: number;
  onSelect?: (index: number) => void;
};

/** Numbered "1 · Record → 2 · Debrief → 3 · Work Map" header. Earlier steps are clickable when onSelect is set. */
export function FlowSteps({ steps, active, onSelect }: Props) {
  return (
    <ol className="flow-steps">
      {steps.map((label, i) => {
        const state = i < active ? "done" : i === active ? "active" : "todo";
        const clickable = onSelect && i < active;
        return (
          <li key={label} data-state={state}>
            {clickable ? (
              <button type="button" onClick={() => onSelect(i)}>
                <span className="flow-num">{i + 1}</span>
                {label}
              </button>
            ) : (
              <span>
                <span className="flow-num">{i + 1}</span>
                {label}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
