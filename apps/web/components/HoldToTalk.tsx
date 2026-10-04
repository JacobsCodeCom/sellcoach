"use client";

import { useEffect, useRef } from "react";

type Props = {
  disabled?: boolean;
  armed: boolean;
  onArmedChange: (armed: boolean) => void;
  /** Shown under the button, e.g. "Space" */
  shortcutLabel?: string;
};

/**
 * Push-to-talk control: hold on screen (mouse/touch) or hold Space on keyboard.
 * Ignores Space while typing in inputs.
 */
export function HoldToTalk({
  disabled = false,
  armed,
  onArmedChange,
  shortcutLabel = "Space",
}: Props) {
  const onArmedChangeRef = useRef(onArmedChange);
  onArmedChangeRef.current = onArmedChange;
  const armedRef = useRef(armed);
  armedRef.current = armed;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (isTypingTarget(e.target)) return;
      // Always block Space-as-page-down, including key-repeat while held and
      // while the mic is disabled (agent speaking) — otherwise the page jumps.
      e.preventDefault();
      if (disabledRef.current || e.repeat) return;
      onArmedChangeRef.current(true);
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      onArmedChangeRef.current(false);
    }

    function onBlur() {
      onArmedChangeRef.current(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    if (disabled && armed) onArmedChange(false);
  }, [disabled, armed, onArmedChange]);

  return (
    <div className="hold-talk">
      <button
        ref={btnRef}
        className={`hold-talk-btn${armed ? " hold-talk-btn--hot" : ""}`}
        type="button"
        disabled={disabled}
        aria-pressed={armed}
        aria-keyshortcuts="Space"
        aria-label={armed ? "Listening — release to stop" : "Hold to talk"}
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          // Avoid browser scrolling the page to this control when it takes focus.
          btnRef.current?.focus({ preventScroll: true });
          btnRef.current?.setPointerCapture(e.pointerId);
          onArmedChange(true);
        }}
        onPointerUp={(e) => {
          try {
            btnRef.current?.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          onArmedChange(false);
        }}
        onPointerCancel={() => onArmedChange(false)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          // Space is handled globally for push-to-talk. Enter must not activate
          // this button (browsers scroll the focused control into view).
          if (e.key === "Enter" || e.key === " " || e.code === "Space") {
            e.preventDefault();
          }
        }}
      >
        <span className="hold-talk-dot" aria-hidden />
        <span className="hold-talk-label">{armed ? "Listening…" : "Hold to talk"}</span>
      </button>
      <p className="hold-talk-hint">
        {disabled
          ? "Wait for Mira to finish"
          : <>
              Hold the button or <kbd>{shortcutLabel}</kbd> — pauses are fine; we send only when
              you release
            </>}
      </p>
    </div>
  );
}
