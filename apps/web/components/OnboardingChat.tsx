"use client";

import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  applyOnboardingActions,
  buildManualSetupActions,
  buildOnboardingSnapshot,
  localManageReply,
  localOnboardingReply,
  sanitizeActions,
  type AgentMode,
  type AgentReply,
  type ChatMessage,
} from "@/lib/onboarding";
import { loadStore } from "@/lib/repo";
import { HoldToTalk } from "@/components/HoldToTalk";
import { VoiceEar } from "@/components/VoiceEar";
import { cancelSpeech, enqueueSpeech, onAgentSpeaking } from "@/lib/speak";
import { useSession, useStore } from "@/lib/store";
import { micEnvironmentHint } from "@/lib/voiceListen";

/** Soft pixel silhouette — 1 = on, 0 = off (7×7). */
const PIX_MAP = [
  0, 0, 1, 1, 1, 0, 0,
  0, 1, 1, 1, 1, 1, 0,
  1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 0,
  0, 0, 1, 1, 1, 0, 0,
];

function renderLiteMarkdown(text: string): ReactNode[] {
  return text.split("\n").map((line, lineIndex) => {
    const parts = line.split(/(\*\*.+?\*\*)/g).map((part, i) => {
      const bold = part.match(/^\*\*(.+)\*\*$/);
      if (bold) return <strong key={i}>{bold[1]}</strong>;
      return <span key={i}>{part}</span>;
    });
    return (
      <span key={lineIndex}>
        {lineIndex > 0 ? <br /> : null}
        {parts}
      </span>
    );
  });
}

export function PixelAgent({ state }: { state: string }) {
  return (
    <div className={`levelup-pix levelup-pix--${state}`} aria-hidden>
      <span className="levelup-pix-halo" />
      <span className="levelup-pix-grid">
        {PIX_MAP.map((on, i) => (
          <span
            key={i}
            className={`levelup-pix-cell${on ? " on" : ""}`}
            style={{ ["--i" as string]: i }}
          />
        ))}
      </span>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 18v4" />
    </svg>
  );
}

type Phase = "live" | "manual" | "done";
type SetupMode = "chat" | "voice";

async function fetchAgentReply(
  history: ChatMessage[],
  snapshot: ReturnType<typeof buildOnboardingSnapshot>,
  fallback: AgentReply,
  mode: AgentMode,
): Promise<AgentReply> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch("/api/onboarding-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, snapshot, mode }),
      signal: controller.signal,
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      message?: string;
      actions?: unknown;
      done?: boolean;
      options?: string[];
      placeholder?: string;
    };
    return {
      message: String(data.message || fallback.message),
      actions: sanitizeActions(data.actions),
      done: Boolean(data.done),
      options: Array.isArray(data.options) ? data.options : fallback.options,
      placeholder: data.placeholder ?? fallback.placeholder,
    };
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timer);
  }
}

export function OnboardingChat({
  mode: agentMode = "setup",
  title,
}: {
  mode?: AgentMode;
  title?: string;
}) {
  const router = useRouter();
  const managing = agentMode === "manage";
  const { setStore } = useStore();
  const { user } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeholder, setPlaceholder] = useState<string | undefined>();
  const [options, setOptions] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("live");
  const [mode, setMode] = useState<SetupMode>("chat");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [earActive, setEarActive] = useState(false);
  const [earMode, setEarMode] = useState<"scribe" | "browser" | "off">("off");
  const [pttArmed, setPttArmed] = useState(false);
  const [interim, setInterim] = useState("");
  const openInBrowserHref =
    typeof window !== "undefined" ? window.location.href : "http://localhost:3000/onboarding";
  const [manual, setManual] = useState({
    companyName: "",
    summary: "",
    expertName: "",
    expertEmail: "",
  });
  const messagesRef = useRef<ChatMessage[]>([]);
  const busyRef = useRef(false);
  const voiceEnabledRef = useRef(false);
  const agentSpeakingRef = useRef(false);
  const turnGate = useRef(false);
  const askGen = useRef(0);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);
  const earPaused = agentSpeaking || busy;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    return onAgentSpeaking((speaking) => {
      agentSpeakingRef.current = speaking;
      setAgentSpeaking(speaking);
    });
  }, []);

  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, interim, agentSpeaking]);

  async function askAgent(history: ChatMessage[], opts?: { speak?: boolean }) {
    const gen = ++askGen.current;
    setBusy(true);
    busyRef.current = true;
    setError(null);
    setInterim("");
    const snapshot = buildOnboardingSnapshot(loadStore());
    const shouldSpeak = opts?.speak ?? voiceEnabledRef.current;
    const local = managing
      ? localManageReply(history, snapshot)
      : localOnboardingReply(history, snapshot);

    const paintMessage = (message: string) => {
      const next: ChatMessage[] = [...history, { role: "assistant", content: message }];
      messagesRef.current = next;
      setMessages(next);
    };

    const applyReply = (reply: AgentReply) => {
      const actions = sanitizeActions(reply.actions);
      let done = Boolean(reply.done);
      if (actions.length) {
        const applied = applyOnboardingActions(actions);
        setStore(applied.store);
        done = done || applied.done;
      }
      setPlaceholder(reply.placeholder ?? local.placeholder);
      setOptions(reply.options ?? local.options ?? []);
      paintMessage(reply.message);
      return done;
    };

    try {
      // Local wins only when it already produced durable actions (solo expert, member, etc.).
      const lockLocal =
        !managing &&
        (local.actions.length > 0 ||
          /work email\?/i.test(local.message) ||
          /just you/i.test(local.message));

      let done = false;

      if (lockLocal) {
        done = applyReply(local);
        setBusy(false);
        busyRef.current = false;
        if (shouldSpeak) await enqueueSpeech(local.message);
      } else {
        // Ask Anthropic (or OpenAI) before speaking, so we don't loop "Which role is yours?"
        setBusy(false);
        busyRef.current = false;
        const remote = await fetchAgentReply(history, snapshot, local, agentMode);
        if (gen !== askGen.current) return;
        done = applyReply(remote);
        if (shouldSpeak) await enqueueSpeech(remote.message);
      }

      if (gen !== askGen.current) return;

      if (done && !managing) {
        setPhase("done");
        setEarActive(false);
        setTimeout(() => router.push("/admin"), 700);
        return;
      }
    } catch (err) {
      if (gen !== askGen.current) return;
      setError(err instanceof Error ? err.message : "Setup coach failed");
      setBusy(false);
      busyRef.current = false;
    } finally {
      if (gen === askGen.current) turnGate.current = false;
    }
  }

  async function handleUserText(text: string) {
    const cleaned = text.trim();
    if (!cleaned || turnGate.current) return;
    turnGate.current = true;
    askGen.current += 1; // invalidate in-flight agent turn
    cancelSpeech();
    agentSpeakingRef.current = false;
    setAgentSpeaking(false);
    const history: ChatMessage[] = [
      ...messagesRef.current,
      { role: "user", content: cleaned },
    ];
    messagesRef.current = history;
    setMessages(history);
    setOptions([]);
    setInterim("");
    await askAgent(history);
  }

  function interruptAgent() {
    if (!agentSpeakingRef.current && !busyRef.current) return;
    cancelSpeech();
    agentSpeakingRef.current = false;
    setAgentSpeaking(false);
    setBusy(false);
    busyRef.current = false;
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void askAgent([], { speak: false });
  }, []);

  async function attachMic(): Promise<boolean> {
    setError(null);
    setMicBusy(true);
    try {
      const hint = micEnvironmentHint();
      if (hint) {
        setMicReady(false);
        setEarActive(false);
        setError(hint);
        return false;
      }
      // Remount ear so Scribe reconnects with a fresh token.
      setEarActive(false);
      await new Promise((r) => window.setTimeout(r, 40));
      setEarActive(true);
      setError(null);
      return true;
    } finally {
      setMicBusy(false);
    }
  }

  function stopVoice() {
    cancelSpeech();
    voiceEnabledRef.current = false;
    setMode("chat");
    setEarActive(false);
    setListening(false);
    setMicReady(false);
    setEarMode("off");
    setPttArmed(false);
    setInterim("");
    setAgentSpeaking(false);
    agentSpeakingRef.current = false;
  }

  async function toggleVoice() {
    if (mode === "voice") {
      stopVoice();
      setError(null);
      return;
    }
    setMode("voice");
    voiceEnabledRef.current = true;
    const ok = await attachMic();
    const lastAssistant = [...messagesRef.current].reverse().find((m) => m.role === "assistant");
    if (ok && lastAssistant && !busyRef.current) void enqueueSpeech(lastAssistant.content);
  }

  function openManual() {
    askGen.current += 1;
    turnGate.current = false;
    stopVoice();
    setBusy(false);
    busyRef.current = false;
    setError(null);
    setPhase("manual");
  }

  function backToChat() {
    setError(null);
    setPhase("live");
  }

  const header = title ? (
    <div className="levelup-head">
      <h1>{title}</h1>
      {!managing && phase === "live" ? (
        <button className="levelup-skip" type="button" onClick={openManual}>
          Skip
        </button>
      ) : null}
      {phase === "manual" ? (
        <button className="levelup-skip" type="button" onClick={backToChat}>
          Back to chat
        </button>
      ) : null}
    </div>
  ) : null;

  async function onChatSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || phase !== "live") return;
    setInput("");
    await handleUserText(text);
  }

  function onManualSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const actions = buildManualSetupActions({ ...manual, ownerEmail: user?.email });
    if (!actions.length) {
      setError("Add company name plus one expert name and email.");
      return;
    }
    try {
      const applied = applyOnboardingActions(actions);
      setStore(applied.store);
      setPhase("done");
      setTimeout(() => router.push("/admin"), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save setup");
    }
  }

  const voiceOn = mode === "voice";
  const orbState = agentSpeaking
    ? "speaking"
    : busy
      ? "thinking"
      : pttArmed && interim
        ? "hearing"
        : pttArmed && micReady
          ? "listening"
          : "waiting";

  const voiceStatus = agentSpeaking
    ? "Speaking"
    : busy
      ? "Thinking"
      : pttArmed && interim
        ? "Hearing you"
        : pttArmed
          ? "Listening — keep holding"
          : micReady
            ? "Hold to talk"
            : "Mic needed";

  if (phase === "manual") {
    return (
      <div className="levelup">
        {header}
        <form className="stack levelup-manual" onSubmit={onManualSubmit}>
          <div className="field">
            <label htmlFor="companyName">Company name</label>
            <input
              id="companyName"
              value={manual.companyName}
              onChange={(e) => setManual((m) => ({ ...m, companyName: e.target.value }))}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="summary">What do you do?</label>
            <input
              id="summary"
              value={manual.summary}
              onChange={(e) => setManual((m) => ({ ...m, summary: e.target.value }))}
              placeholder="e.g. B2B sales coaching for mid-market teams"
            />
          </div>
          <div className="field">
            <label htmlFor="expertName">First expert</label>
            <input
              id="expertName"
              value={manual.expertName}
              onChange={(e) => setManual((m) => ({ ...m, expertName: e.target.value }))}
              placeholder="Name"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="expertEmail">Expert email</label>
            <input
              id="expertEmail"
              type="email"
              value={manual.expertEmail}
              onChange={(e) => setManual((m) => ({ ...m, expertEmail: e.target.value }))}
              placeholder={user?.email?.replace(/^[^@]+/, "sam") || "sam@company.com"}
              required
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit">
            Continue
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="levelup">
      {header}
      {voiceOn ? (
        <VoiceEar
          active={earActive}
          paused={earPaused}
          armed={pttArmed && !earPaused}
          onPartial={setInterim}
          onFinal={(text) => {
            // Keep UI disarmed; VoiceEar already flushed on release.
            setPttArmed(false);
            setInterim("");
            if (agentSpeakingRef.current) interruptAgent();
            void handleUserText(text);
          }}
          onListeningChange={(v) => {
            setListening(v);
            if (v) setMicReady(true);
          }}
          onError={(message) => {
            setMicReady(false);
            setError(message);
          }}
          onMode={setEarMode}
        />
      ) : null}

      {voiceOn ? (
        <div className="levelup-bar">
          <PixelAgent state={orbState} />
          <div className="levelup-bar-copy">
            <p className="levelup-status">{voiceStatus}</p>
            <p className="muted levelup-hint">
              {micReady
                ? "Answers only count while you hold Talk."
                : earMode === "browser"
                  ? "Browser speech (fallback)"
                  : "Allow the mic, then use Hold to talk."}
            </p>
          </div>
          <div className="levelup-bar-actions">
            {agentSpeaking ? (
              <button className="btn btn-ghost" type="button" onClick={interruptAgent}>
                Interrupt
              </button>
            ) : null}
            {!micReady ? (
              <button
                className="btn btn-primary"
                type="button"
                disabled={micBusy}
                onClick={() => void attachMic()}
              >
                {micBusy ? "Requesting…" : "Allow mic"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="levelup-thread" ref={threadRef} aria-live="polite">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}-${m.content.slice(0, 12)}`}
            className={`levelup-bubble levelup-bubble--${m.role}`}
          >
            {renderLiteMarkdown(m.content)}
          </div>
        ))}
        {voiceOn && interim ? (
          <div className="levelup-bubble levelup-bubble--user levelup-bubble--live">
            <em>{interim}</em>
          </div>
        ) : null}
      </div>

      {options.length && phase === "live" ? (
        <div className="levelup-options">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              className="levelup-option"
              disabled={busy}
              onClick={() => void handleUserText(o)}
            >
              {o}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="stack" style={{ gap: "0.45rem" }}>
          <p className="error">{error}</p>
          {voiceOn && !micReady ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.92rem" }}>
              Voice needs a real browser mic prompt.{" "}
              <a href={openInBrowserHref} target="_blank" rel="noreferrer">
                Open this page in Chrome/Edge
              </a>
              , or keep typing here.
            </p>
          ) : null}
        </div>
      ) : null}

      {voiceOn && micReady ? (
        <HoldToTalk
          armed={pttArmed}
          disabled={earPaused}
          onArmedChange={setPttArmed}
          shortcutLabel="Space"
        />
      ) : null}

      {phase === "live" ? (
        <form className="onboard-compose" onSubmit={onChatSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder ?? (voiceOn && micReady ? "Or type…" : "Type your answer…")}
            aria-label="Message"
            autoFocus={!voiceOn}
          />
          <button
            className={`onboard-mic${voiceOn ? " onboard-mic--on" : ""}`}
            type="button"
            onClick={() => void toggleVoice()}
            disabled={micBusy}
            aria-pressed={voiceOn}
            aria-label={voiceOn ? "Switch to typing" : "Switch to voice"}
            title={voiceOn ? "Switch to typing" : "Switch to voice"}
          >
            <MicIcon />
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      ) : null}
    </div>
  );
}
