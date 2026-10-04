/**
 * Drop background / wrong-language speech before it becomes a user turn.
 * Not true speaker isolation — pairs with push-to-talk + Scribe language=en.
 * Upper bound is generous: debrief answers are often well past a tweet.
 *
 * Short answers like "yes" / "no" / "okay" must pass — onboarding and lessons
 * rely on them. Only pure vocal filler is rejected.
 */
export function isPlausibleUserUtterance(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 1 || t.length > 4000) return false;

  const letters = t.replace(/[^\p{L}]/gu, "");
  if (!letters.length) return false;

  const cyrillic = (t.match(/\p{Script=Cyrillic}/gu) || []).length;
  if (cyrillic / letters.length > 0.25) return false;

  const latin = (t.match(/[A-Za-z]/g) || []).length;
  if (latin / letters.length < 0.55) return false;

  // Pure filler / noise bursts only — keep yes/no/ok/yeah as valid turns.
  if (/^(um+|uh+|ah+|hmm+)\.?$/i.test(t)) return false;

  return true;
}
