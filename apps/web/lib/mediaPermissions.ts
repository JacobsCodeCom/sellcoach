"use client";

/** Chrome side panels cannot show the mic permission prompt — open a normal tab once. */
export const ENABLE_MIC_PATH = "/ext/enable-mic";

export async function getMicrophonePermissionState(): Promise<PermissionState | "unknown"> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state;
  } catch {
    return "unknown";
  }
}

/** Ask the extension shell (or open a tab) so the user can grant mic outside the side panel. */
export function openMicEnablePage(): void {
  const url = `${window.location.origin}${ENABLE_MIC_PATH}`;
  try {
    window.parent.postMessage({ type: "mira:open-tab", url }, "*");
  } catch {
    /* ignore */
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function ensureMicrophoneReady(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const state = await getMicrophonePermissionState();
  if (state === "granted") return { ok: true };

  // Already denied in a normal tab — user must reset via site settings.
  if (state === "denied") {
    return {
      ok: false,
      reason:
        "Microphone is blocked for Mira. Click the lock icon on a Mira tab → Site settings → allow Microphone, then try again.",
    };
  }

  // Side panel / iframe often can't show the prompt ("prompt" or "unknown").
  openMicEnablePage();
  return {
    ok: false,
    reason:
      "Allow the microphone in the tab that just opened (Chrome can’t ask for mic inside the side panel). Then press Start again.",
  };
}
