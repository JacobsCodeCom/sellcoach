let chain: Promise<void> = Promise.resolve();
let pending = 0;
let current: HTMLAudioElement | null = null;
const listeners = new Set<(speaking: boolean) => void>();

function emit(speaking: boolean) {
  listeners.forEach((listener) => listener(speaking));
}

export function onApprenticeSpeaking(listener: (speaking: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function browserSpeak(text: string) {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
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

async function speakText(text: string) {
  const clean = text.trim();
  if (!clean) return;
  try {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      await withTimeout(
        new Promise<void>((resolve) => {
          const audio = new Audio(url);
          current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            if (current === audio) current = null;
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          void audio.play().catch(() => resolve());
        }),
        12_000,
      );
      return;
    }
  } catch {
    /* browser voice */
  }
  await withTimeout(browserSpeak(clean), 8_000);
}

export function enqueueSpeech(text: string) {
  pending += 1;
  emit(true);
  chain = chain
    .then(() => speakText(text))
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
  current?.pause();
  current = null;
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  emit(false);
}
