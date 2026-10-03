let chain: Promise<void> = Promise.resolve();
let pending = 0;
let current: HTMLAudioElement | null = null;
let resolveCurrent: (() => void) | null = null;
const listeners = new Set<(speaking: boolean) => void>();

function emit(speaking: boolean) {
  listeners.forEach((listener) => listener(speaking));
}

export function onAgentSpeaking(listener: (speaking: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Strip lite markdown; keep ElevenLabs audio tags like [excited]. */
export function speechPlain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^[\s•\-–—]+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Browser TTS must not read [excited] aloud. */
function stripAudioTags(text: string): string {
  return text.replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim();
}

/** Keep voice turns short so setup doesn't drag. */
export function speechBrief(text: string, max = 180): string {
  const plain = speechPlain(text);
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const sentence = cut.match(/^.+?[.!?](?=\s|$)/);
  if (sentence && sentence[0].length > 40) return sentence[0];
  const word = cut.lastIndexOf(" ");
  return `${(word > 40 ? cut.slice(0, word) : cut).trim()}…`;
}

/** Light delivery cue for v4 — skipped if text already has an audio tag. */
export function withDeliveryTag(text: string): string {
  if (/\[[^\]]+\]/.test(text)) return text;
  return `[friendly] ${text}`;
}

function browserSpeak(text: string) {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(stripAudioTags(text));
    utterance.rate = 1.08;
    const voices = window.speechSynthesis.getVoices();
    const voice =
      voices.find((item) => item.lang === "en-GB") ||
      voices.find((item) => item.lang.startsWith("en"));
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

function withTimeout(promise: Promise<void>, ms: number) {
  return Promise.race([
    promise,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    }),
  ]);
}

function endCurrentPlayback() {
  const finish = resolveCurrent;
  resolveCurrent = null;
  if (current) {
    current.onended = null;
    current.onerror = null;
    current.pause();
    current = null;
  }
  finish?.();
}

async function speakText(text: string) {
  const clean = text.trim();
  if (!clean) return;
  try {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      await withTimeout(
        new Promise<void>((resolve) => {
          const audio = new Audio(url);
          current = audio;
          resolveCurrent = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onended = () => {
            URL.revokeObjectURL(url);
            if (current === audio) current = null;
            resolveCurrent = null;
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            if (current === audio) current = null;
            resolveCurrent = null;
            resolve();
          };
          void audio.play().catch(() => {
            URL.revokeObjectURL(url);
            if (current === audio) current = null;
            resolveCurrent = null;
            resolve();
          });
        }),
        30_000,
      );
      return;
    }
  } catch {
    /* browser voice */
  }
  await withTimeout(browserSpeak(clean), 6_000);
}

export function enqueueSpeech(text: string) {
  const plain = withDeliveryTag(speechBrief(text));
  if (!plain) return Promise.resolve();
  pending += 1;
  emit(true);
  chain = chain
    .then(() => speakText(plain))
    .finally(() => {
      pending -= 1;
      if (pending <= 0) {
        pending = 0;
        emit(false);
      }
    });
  return chain;
}

export function cancelSpeech() {
  pending = 0;
  chain = Promise.resolve();
  endCurrentPlayback();
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  emit(false);
}
