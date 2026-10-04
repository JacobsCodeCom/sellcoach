/**
 * Injected into the learner's active tab to draw a short-lived spotlight.
 * Idempotent: re-injection does not stack listeners.
 */
(() => {
  const ROOT_ID = "mira-highlight-root";
  const STYLE_ID = "mira-highlight-style";
  const HOLD_MS = 5500;

  if (globalThis.__miraHighlightReady) {
    return;
  }
  globalThis.__miraHighlightReady = true;

  let clearTimer = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        pointer-events: none;
      }
      #${ROOT_ID} .mira-hl-dim {
        position: absolute;
        inset: 0;
        background: rgba(8, 12, 20, 0.28);
        mix-blend-mode: multiply;
      }
      #${ROOT_ID} .mira-hl-hole {
        position: absolute;
        box-shadow: 0 0 0 9999px rgba(8, 12, 20, 0.28);
        border-radius: 10px;
        outline: 3px solid rgba(56, 189, 248, 0.95);
        animation: mira-hl-pulse 1.1s ease-in-out infinite;
      }
      @keyframes mira-hl-pulse {
        0%, 100% { outline-color: rgba(56, 189, 248, 0.95); outline-width: 3px; }
        50% { outline-color: rgba(125, 211, 252, 1); outline-width: 5px; }
      }
    `;
    (document.documentElement || document.head).appendChild(style);
  }

  function clearHighlight() {
    if (clearTimer != null) {
      window.clearTimeout(clearTimer);
      clearTimer = null;
    }
    document.getElementById(ROOT_ID)?.remove();
  }

  function showHighlight(rect) {
    if (!rect || typeof rect !== "object") return;
    const x = Number(rect.x);
    const y = Number(rect.y);
    const w = Number(rect.w);
    const h = Number(rect.h);
    if (![x, y, w, h].every((v) => Number.isFinite(v))) return;

    ensureStyle();
    clearHighlight();

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(0, Math.min(vw, x * vw));
    const top = Math.max(0, Math.min(vh, y * vh));
    const width = Math.max(8, Math.min(vw - left, w * vw));
    const height = Math.max(8, Math.min(vh - top, h * vh));

    const root = document.createElement("div");
    root.id = ROOT_ID;
    const hole = document.createElement("div");
    hole.className = "mira-hl-hole";
    hole.style.left = `${left - 4}px`;
    hole.style.top = `${top - 4}px`;
    hole.style.width = `${width + 8}px`;
    hole.style.height = `${height + 8}px`;
    root.appendChild(hole);
    (document.documentElement || document.body).appendChild(root);

    clearTimer = window.setTimeout(clearHighlight, HOLD_MS);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "mira:highlight" && message.rect) {
      showHighlight(message.rect);
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "mira:highlight-clear") {
      clearHighlight();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  window.addEventListener("pagehide", clearHighlight);
})();
