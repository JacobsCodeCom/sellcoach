"use client";

type CursorState = {
  x: number;
  y: number;
  visible: boolean;
  pressing: boolean;
  label: string;
};

export function GhostCursor({ cursor }: { cursor: CursorState }) {
  return (
    <div
      className={`ghost ${cursor.visible ? "is-on" : ""} ${cursor.pressing ? "is-down" : ""}`}
      style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
    >
      <span className="ghost-arrow" />
      {cursor.label ? <span className="ghost-label">{cursor.label}</span> : null}
    </div>
  );
}

export type { CursorState };
