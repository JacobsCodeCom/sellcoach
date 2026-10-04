const status = document.getElementById("status");
const allowBtn = document.getElementById("allow");

async function enable() {
  status.textContent = "Waiting for the browser permission dialog…";
  status.className = "";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    stream.getTracks().forEach((t) => t.stop());
    await chrome.storage.local.set({ miraMicGranted: true });
    status.textContent = "Microphone enabled. You can close this tab and press Start in Mira.";
    status.className = "ok";
    allowBtn.textContent = "Close tab";
    allowBtn.onclick = () => window.close();
    window.setTimeout(() => window.close(), 1200);
  } catch (err) {
    status.textContent =
      err?.name === "NotAllowedError"
        ? "Permission denied. Click Allow when Chrome asks, or use the lock icon in the address bar."
        : err?.message || "Could not access the microphone";
    status.className = "err";
  }
}

allowBtn.addEventListener("click", () => void enable());
void enable();
