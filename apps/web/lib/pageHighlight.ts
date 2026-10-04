import { isEmbeddedInExtension } from "@/lib/extensionCapture";

export type PageHighlightRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Ask the Mira extension parent to spotlight a normalized viewport rect on the active tab. */
export function requestPageHighlight(rect: PageHighlightRect): boolean {
  if (!isEmbeddedInExtension()) return false;
  if (![rect.x, rect.y, rect.w, rect.h].every((v) => Number.isFinite(v))) return false;
  window.parent.postMessage({ type: "mira:highlight", rect }, "*");
  return true;
}
