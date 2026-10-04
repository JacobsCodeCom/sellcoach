/**
 * Runs on the extension side panel page (not the iframe).
 * Owns mic + speech + tab screenshots so Start is one click after one-time mic grant.
 */

let recognition = null;
let shotTimer = null;
let active = false;
let startedAt = 0;
/** Keep an open mic track so Chrome SpeechRecognition stays alive in the side panel. */
let micStream = null;

function postToFrame(frame, payload, targetOrigin) {
  if (!frame?.contentWindow) return;
  const origin = targetOrigin || "*";
  frame.contentWindow.postMessage({ source: "mira-extension", ...payload }, origin);
}

async function ensureMic() {
  const { miraMicGranted } = await chrome.storage.local.get(["miraMicGranted"]);
  if (miraMicGranted) {
    try {
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
      }
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      return true;
    } catch {
      micStream = null;
      await chrome.storage.local.set({ miraMicGranted: false });
    }
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("request-mic.html") });
  return false;
}

function startSpeech(frame, targetOrigin) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    postToFrame(
      frame,
      {
        type: "mira:capture-error",
        error: "This Chrome build has no speech recognition.",
      },
      targetOrigin,
    );
    return;
  }
  const rec = new SR();
  recognition = rec;
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  rec.onresult = (event) => {
    let interim = "";
    const finals = [];
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0]?.transcript?.trim();
      if (!text) continue;
      if (result.isFinal) {
        finals.push({ t: Date.now() - startedAt, text });
      } else {
        interim = text;
      }
    }
    if (finals.length || interim) {
      postToFrame(frame, { type: "mira:capture-speech", finals, interim }, targetOrigin);
    }
  };
  rec.onerror = () => {
    if (!active) return;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      if (active) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      }
    }, 400);
  };
  rec.onend = () => {
    if (!active) return;
    try {
      rec.start();
    } catch {
      /* ignore */
    }
  };
  try {
    rec.start();
  } catch (err) {
    postToFrame(
      frame,
      {
        type: "mira:capture-error",
        error: err instanceof Error ? err.message : "Could not start speech recognition",
      },
      targetOrigin,
    );
  }
}

function compressDataUrl(dataUrl, maxWidth = 720, quality = 0.55) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function shoot(frame, targetOrigin) {
  try {
    const response = await chrome.runtime.sendMessage({ type: "mira:capture-visible-tab" });
    if (response?.ok && response.dataUrl) {
      const image = await compressDataUrl(response.dataUrl);
      postToFrame(
        frame,
        {
          type: "mira:capture-frame",
          image,
          url: typeof response.url === "string" ? response.url : undefined,
          t: Date.now() - startedAt,
        },
        targetOrigin,
      );
    }
  } catch {
    /* tab may be restricted (chrome://) — ignore */
  }
}

export async function startExtensionCapture(frame, targetOrigin) {
  if (active) return { ok: true };
  const micOk = await ensureMic();
  if (!micOk) {
    return {
      ok: false,
      reason:
        "Allow the microphone in the tab that opened (one time). Then press Start again.",
    };
  }

  active = true;
  startedAt = Date.now();
  postToFrame(frame, { type: "mira:capture-started", startedAt }, targetOrigin);
  startSpeech(frame, targetOrigin);
  await shoot(frame, targetOrigin);
  shotTimer = window.setInterval(() => void shoot(frame, targetOrigin), 4000);
  return { ok: true };
}

export function stopExtensionCapture(frame, targetOrigin) {
  active = false;
  if (shotTimer != null) {
    window.clearInterval(shotTimer);
    shotTimer = null;
  }
  if (recognition) {
    try {
      recognition.onend = null;
      recognition.stop();
    } catch {
      /* ignore */
    }
    recognition = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  postToFrame(frame, { type: "mira:capture-stopped" }, targetOrigin);
}
