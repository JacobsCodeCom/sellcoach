/** Promo theater / Playwright recording helpers. Not used in production UX. */

export function isPromoDemo(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem("mira-promo") === "1") return true;
  } catch {
    /* private mode */
  }
  if (new URLSearchParams(window.location.search).get("promo") === "1") return true;
  return Boolean((window as Window & { __MIRA_PROMO__?: boolean }).__MIRA_PROMO__);
}

export function markPromoDemo(): void {
  if (typeof window === "undefined") return;
  (window as Window & { __MIRA_PROMO__?: boolean }).__MIRA_PROMO__ = true;
  try {
    window.sessionStorage.setItem("mira-promo", "1");
  } catch {
    /* ignore */
  }
}
