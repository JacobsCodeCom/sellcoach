const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[card]"],
  [/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}\b/g, "[iban]"],
  [/\+?\d[\d\s().-]{7,}\d/g, "[phone]"],
];

/** Strip e-mails, phone, card and IBAN numbers before text leaves the browser or reaches a model. */
export function redact(text: string): string {
  return PATTERNS.reduce((s, [re, rep]) => s.replace(re, rep), String(text ?? ""));
}

/** Redact every string in a JSON-like value, except image data URLs. */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return (value.startsWith("data:") ? value : redact(value)) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out as T;
  }
  return value;
}
