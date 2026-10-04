/**
 * Mira web origin the side panel embeds.
 * Store package sets ALLOW_ORIGIN_OVERRIDE=false (no URL field).
 * Unpacked local builds keep override so you can point at localhost.
 */
export const DEFAULT_MIRA_ORIGIN = "https://mira.jacobscode.com";

/** When true, boot screen can change Mira URL (local unpacked only). */
export const ALLOW_ORIGIN_OVERRIDE = true;

export function isAllowedMiraOrigin(origin) {
  if (ALLOW_ORIGIN_OVERRIDE) {
    try {
      const url = new URL(origin);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }
  return origin === DEFAULT_MIRA_ORIGIN;
}
