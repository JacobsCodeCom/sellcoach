import {
  ALLOW_ORIGIN_OVERRIDE,
  DEFAULT_MIRA_ORIGIN,
  isAllowedMiraOrigin,
} from "./config.js";
import { startExtensionCapture, stopExtensionCapture } from "./capture-bridge.js";

const boot = document.getElementById("boot");
const bootStatus = document.getElementById("bootStatus");
const originControls = document.getElementById("originControls");
const frame = document.getElementById("frame");
const originInput = document.getElementById("origin");
const reloadBtn = document.getElementById("reload");
const errorEl = document.getElementById("error");

let miraOrigin = DEFAULT_MIRA_ORIGIN;

function normalizeOrigin(value) {
  const trimmed = String(value || "").trim().replace(/\/$/, "");
  if (!trimmed) return DEFAULT_MIRA_ORIGIN;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Origin must be http(s)");
    }
    if (!isAllowedMiraOrigin(url.origin)) {
      throw new Error("This build only connects to the Mira production app.");
    }
    return url.origin;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Mira")) throw err;
    throw new Error(`Enter a valid Mira URL, e.g. ${DEFAULT_MIRA_ORIGIN}`);
  }
}

async function readStoredOrigin() {
  if (!ALLOW_ORIGIN_OVERRIDE) return DEFAULT_MIRA_ORIGIN;
  const result = await chrome.storage.sync.get(["miraOrigin"]);
  const stored = result.miraOrigin;
  if (typeof stored === "string" && isAllowedMiraOrigin(stored)) return stored;
  return DEFAULT_MIRA_ORIGIN;
}

async function writeStoredOrigin(origin) {
  if (!ALLOW_ORIGIN_OVERRIDE) return;
  await chrome.storage.sync.set({ miraOrigin: origin });
}

function showError(message) {
  errorEl.hidden = !message;
  errorEl.textContent = message || "";
}

function isTrustedMiraMessage(event) {
  if (!event.data || typeof event.data !== "object") return false;
  if (event.source !== frame.contentWindow) return false;
  try {
    return new URL(event.origin).origin === miraOrigin;
  } catch {
    return false;
  }
}

async function openMira(originValue) {
  showError("");
  let origin;
  try {
    origin = normalizeOrigin(originValue);
  } catch (err) {
    showError(err instanceof Error ? err.message : "Invalid URL");
    if (ALLOW_ORIGIN_OVERRIDE) {
      bootStatus.textContent = "Choose a Mira URL to continue.";
      originControls.hidden = false;
    }
    return;
  }
  miraOrigin = origin;
  await writeStoredOrigin(origin);
  if (originInput) originInput.value = origin;
  bootStatus.textContent = "Opening Mira…";
  frame.src = `${origin}/ext`;
  document.body.classList.add("is-framed");
  frame.hidden = false;
  boot.hidden = true;
}

if (ALLOW_ORIGIN_OVERRIDE) {
  originControls.hidden = false;
  bootStatus.textContent = "Opening Mira… You can change the URL for local development.";
  reloadBtn.addEventListener("click", () => {
    document.body.classList.remove("is-framed");
    boot.hidden = false;
    frame.hidden = true;
    void openMira(originInput.value);
  });
}

frame.addEventListener("load", () => {
  if (frame.src) {
    document.body.classList.add("is-framed");
    boot.hidden = true;
    frame.hidden = false;
  }
});

window.addEventListener("message", (event) => {
  if (!isTrustedMiraMessage(event)) return;
  const data = event.data;

  if (data.type === "mira:open-tab" && typeof data.url === "string") {
    try {
      const url = new URL(data.url);
      if (url.protocol === "http:" || url.protocol === "https:") {
        chrome.tabs.create({ url: url.href });
      }
    } catch {
      /* ignore */
    }
    return;
  }

  if (data.type === "mira:start-capture") {
    void (async () => {
      const result = await startExtensionCapture(frame, miraOrigin);
      if (!result.ok) {
        frame.contentWindow?.postMessage(
          {
            source: "mira-extension",
            type: "mira:capture-need-mic",
            error: result.reason,
          },
          miraOrigin,
        );
      }
    })();
    return;
  }

  if (data.type === "mira:stop-capture") {
    stopExtensionCapture(frame, miraOrigin);
    return;
  }

  if (data.type === "mira:highlight" && data.rect && typeof data.rect === "object") {
    void chrome.runtime.sendMessage({ type: "mira:highlight", rect: data.rect });
  }
});

const stored = await readStoredOrigin();
if (originInput) originInput.value = stored;
await openMira(stored);
