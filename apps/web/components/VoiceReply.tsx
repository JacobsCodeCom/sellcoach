"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { HoldToTalk } from "@/components/HoldToTalk";
import { VoiceEar } from "@/components/VoiceEar";
import { cancelSpeech, onAgentSpeaking } from "@/lib/speak";

type Props = {
  /**
   * Thinking / checking: typed send waits.
   * Speaking never blocks hold-to-talk — starting to talk, or Skip, stops the voice.
   */
  disabled: boolean;
  placeholder: string;
  onSubmit: (text: string) => void;
};

/** Hold-to-talk with a live transcript preview, plus a typed fallback. */
export function VoiceReply({ disabled, placeholder, onSubmit }: Props) {
  const [armed, setArmed] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [interim, setInterim] = useState("");
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => onAgentSpeaking(setSpeaking), []);

  function send(text: string) {
    const cleaned = text.trim();
    if (!cleaned || disabled) return;
    cancelSpeech();
    onSubmit(cleaned);
  }

  function onType(e: FormEvent) {
    e.preventDefault();
    send(input);
    setInput("");
    // Keep caret in the field without scrolling the page to the submit control.
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  return (
    <div className="voice-reply">
      <VoiceEar
        active
        paused={disabled}
        armed={armed && !disabled}
        onPartial={setInterim}
        onFinal={(text) => {
          setArmed(false);
          setInterim("");
          send(text);
        }}
        onListeningChange={(v) => v && setMicReady(true)}
        onError={() => setMicReady(false)}
      />
      {interim ? <p className="learn-line learn-line--user learn-line--live">{interim}</p> : null}
      {micReady ? (
        <HoldToTalk
          armed={armed}
          disabled={false}
          onArmedChange={(next) => {
            if (next) cancelSpeech();
            setArmed(next);
          }}
        />
      ) : (
        <p className="learn-hint">Allow the microphone to answer by voice, or type below.</p>
      )}
      {speaking ? (
        <button className="voice-skip" type="button" onClick={() => cancelSpeech()}>
          Skip
        </button>
      ) : null}
      <form className="learn-type" onSubmit={onType}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <button className="btn" type="submit" disabled={disabled || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
