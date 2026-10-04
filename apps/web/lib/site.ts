/** Canonical production origin (Vercel). */
export const MIRA_PRODUCTION_ORIGIN = "https://mira.jacobscode.com";

/** Public site origin for links in emails / store listing. */
export function miraPublicOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return MIRA_PRODUCTION_ORIGIN;
}

/**
 * Chrome extension install URL.
 * Set NEXT_PUBLIC_CHROME_EXTENSION_URL to the Chrome Web Store listing after publish.
 * Until then, point people at the in-app install guide.
 */
export function chromeExtensionInstallUrl(): string {
  const store = process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL?.trim();
  if (store) return store;
  return `${miraPublicOrigin()}/extension`;
}
