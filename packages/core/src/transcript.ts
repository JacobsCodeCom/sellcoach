/**
 * Turn raw speech finals into durable rule-sized lines for teach-backs.
 * Domain-agnostic: no vertical vocabulary.
 */
export function normalizeTranscriptLines(lines: string[]): string[] {
  const joined = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  if (!joined) return [];

  const pieces = joined
    .split(/[.!?]+\s+|[\n;•]+/)
    .map((piece) => piece.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, ""))
    .filter((piece) => piece.length >= 12)
    .filter((piece) => !isNoise(piece));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of pieces) {
    const key = piece.toLowerCase();
    if (seen.has(key)) continue;
    // Drop near-duplicates (prefix overlap).
    if ([...seen].some((prev) => similar(prev, key))) continue;
    seen.add(key);
    out.push(piece.replace(/^[a-z]/, (c) => c.toUpperCase()));
  }
  return out;
}

/** Short label for a rule card / lesson title. */
export function ruleLabelFromAnswer(answer: string, max = 48): string {
  const cleaned = answer.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Rule";
  const clause = cleaned.split(/[.:;—–-]/)[0]?.trim() || cleaned;
  if (clause.length <= max) return clause;
  const cut = clause.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > 20 ? cut.slice(0, at) : cut).trim()}…`;
}

function isNoise(text: string): boolean {
  const lower = text.toLowerCase();
  if (/^(um+|uh+|ah+|okay|ok|yeah|yes|no|hmm+)\.?$/i.test(lower)) return true;
  if (lower.split(/\s+/).length < 3 && text.length < 20) return true;
  return false;
}

function similar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 20 || b.length < 20) return false;
  return a.includes(b.slice(0, 24)) || b.includes(a.slice(0, 24));
}
