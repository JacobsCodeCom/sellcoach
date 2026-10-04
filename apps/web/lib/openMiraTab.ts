"use client";

/** Open a URL via the Chrome extension parent when embedded; otherwise a normal tab. */
export function openMiraTab(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
    window.parent.postMessage({ type: "mira:open-tab", url: parsed.href }, "*");
  } catch {
    return;
  }
  try {
    if (window.self === window.top) {
      window.open(trimmed, "_blank", "noopener,noreferrer");
    }
  } catch {
    window.open(trimmed, "_blank", "noopener,noreferrer");
  }
}

/** Short host label for a page URL, e.g. "billing.example.com/invoices". */
export function pageHostLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    const short = path.length > 28 ? `${path.slice(0, 28)}…` : path;
    return `${parsed.host}${short}`;
  } catch {
    return url;
  }
}
