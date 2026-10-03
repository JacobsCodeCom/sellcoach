"use client";

import { CommitStrategy, useConversation, useConversationClientTool, useScribe } from "@elevenlabs/react";
import { useEffect, useRef } from "react";

type EarProps = {
  context: string;
  tool: () => string;
  onSpeaking: (value: boolean) => void;
  onUtterance: (text: string) => void;
  onEar: (mode: string) => void;
};

type BrowserRec = {
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserRec;
    webkitSpeechRecognition?: new () => BrowserRec;
  }
}

async function probeMicrophone(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!devices.some((device) => device.kind === "audioinput")) return false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return true;
  } catch {
    return false;
  }
}

export function VoiceLayer(props: EarProps) {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  if (agentId) return <AgentEar {...props} agentId={agentId} />;
  return <ScribeEar {...props} />;
}

function ScribeEar(props: EarProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const fallbackRef = useRef<() => void>(() => undefined);
  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => {
      propsRef.current.onSpeaking(Boolean(data.text.trim()));
    },
    onCommittedTranscript: (data) => {
      propsRef.current.onSpeaking(false);
      const text = data.text.trim();
      if (text.length > 8) propsRef.current.onUtterance(text);
    },
    onError: () => {
      // Mic setup runs after connect() resolves; surface failures here.
      scribeRef.current.disconnect();
      fallbackRef.current();
    },
  });
  const scribeRef = useRef(scribe);
  scribeRef.current = scribe;

  useEffect(() => {
    let cancelled = false;
    let recognition: BrowserRec | null = null;
    let booted = false;

    const startBrowser = () => {
      propsRef.current.onEar("browser");
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Ctor) {
        propsRef.current.onEar("off");
        return;
      }
      const rec = new Ctor();
      recognition = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (event) => {
        let interim = "";
        let finalText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const piece = event.results[index][0]?.transcript ?? "";
          if (event.results[index].isFinal) finalText += piece;
          else interim += piece;
        }
        propsRef.current.onSpeaking(Boolean((interim || finalText).trim()));
        if (finalText.trim().length > 8) propsRef.current.onUtterance(finalText.trim());
      };
      rec.onerror = (event) => {
        propsRef.current.onSpeaking(false);
        if (event.error === "audio-capture" || event.error === "not-allowed") {
          propsRef.current.onEar("no-mic");
          try {
            rec.stop();
          } catch {
            /* already stopped */
          }
        }
      };
      rec.onend = () => {
        propsRef.current.onSpeaking(false);
        if (!cancelled) {
          try {
            rec.start();
          } catch {
            /* already running */
          }
        }
      };
      try {
        rec.start();
      } catch {
        propsRef.current.onEar("off");
      }
    };

    fallbackRef.current = () => {
      if (cancelled) return;
      startBrowser();
    };

    const boot = () => {
      if (booted || cancelled) return;
      booted = true;
      void (async () => {
        const hasMic = await probeMicrophone();
        if (cancelled) return;
        if (!hasMic) {
          propsRef.current.onEar("no-mic");
          return;
        }

        const response = await fetch("/api/scribe-token", { method: "POST" });
        if (cancelled) return;
        if (!response.ok) {
          startBrowser();
          return;
        }
        const payload = (await response.json()) as { token?: string };
        if (!payload.token) {
          startBrowser();
          return;
        }
        try {
          await scribeRef.current.connect({
            token: payload.token,
            microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          if (!cancelled) propsRef.current.onEar("scribe");
        } catch {
          if (!cancelled) startBrowser();
        }
      })();
    };

    window.addEventListener("pointerdown", boot, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", boot);
      scribeRef.current.disconnect();
      try {
        recognition?.stop();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  return null;
}

function AgentEar({ agentId, ...props }: EarProps & { agentId: string }) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const toolRef = useRef(props.tool);
  toolRef.current = props.tool;
  const conversation = useConversation({
    onVadScore: ({ vadScore }) => propsRef.current.onSpeaking(vadScore > 0.5),
    onMessage: (message) => {
      if (message.role !== "user") return;
      const text = message.message.trim();
      if (text.length > 8) propsRef.current.onUtterance(text);
    },
    onError: () => propsRef.current.onEar("agent-error"),
  });
  useConversationClientTool("get_screen_events", () => toolRef.current());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hasMic = await probeMicrophone();
      if (cancelled) return;
      if (!hasMic) {
        propsRef.current.onEar("no-mic");
        return;
      }
      try {
        await Promise.resolve(conversation.startSession({ agentId }));
      } catch {
        if (!cancelled) propsRef.current.onEar("agent-error");
      }
    })();
    return () => {
      cancelled = true;
      conversation.endSession();
    };
    // The session should open once for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  useEffect(() => {
    if (conversation.status !== "connected") return;
    propsRef.current.onEar("agent");
    conversation.setVolume({ volume: 0 });
    conversation.sendContextualUpdate(
      "Stay silent. You are listening beside a dispatch desk. Another voice asks the questions. Screen events arrive as updates. Use get_screen_events for the board. Do not greet.",
    );
  }, [conversation, conversation.status]);

  useEffect(() => {
    if (!props.context || conversation.status !== "connected") return;
    conversation.sendContextualUpdate(props.context);
  }, [conversation, conversation.status, props.context]);

  return null;
}
