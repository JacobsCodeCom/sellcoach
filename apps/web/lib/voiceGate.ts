/**
 * Drop background / wrong-language speech before it becomes a user turn.
 * Not true speaker isolation — pairs with push-to-talk + Scribe language=en.
 */
export function isPlausibleUserUtterance(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 160) return false;

  const letters = t.replace(/[^\p{L}]/gu, "");
  if (!letters.length) return false;

  const cyrillic = (t.match(/\p{Script=Cyrillic}/gu) || []).length;
  if (cyrillic / letters.length > 0.25) return false;

  const latin = (t.match(/[A-Za-z]/g) || []).length;
  if (latin / letters.length < 0.55) return false;

  // Ignore pure filler / noise bursts
  if (/^(um+|uh+|ah+|hmm+|okay|ok|yeah|yes|no)\.?$/i.test(t)) return false;

  return true;
}
