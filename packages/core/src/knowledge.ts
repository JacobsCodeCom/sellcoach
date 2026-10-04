/**
 * The Knowledge Ledger: what Mira must know about ANY work, in any app.
 *
 * Two question engines use it:
 *  - Phase A, scripted fundamentals: asked in a fixed order before the work starts (no LLM). Same every time,
 *    so Mira always builds the same structured understanding.
 *  - Phase B, generated probes: once the fundamentals are filled, the LLM asks deeper, situation-specific
 *    questions about what the expert just did, each one filling an EMPTY slot.
 */

export type LedgerLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type LedgerSlot = {
  level: LedgerLevel;
  id: string;
  name: string;
  /** How the slot is usually filled. */
  fill: "ask" | "ask-if-new" | "observe";
  /** The question to ask when the slot is empty. */
  q: string;
};

export type Ledger = Record<string, string>;

export const LEDGER_LEVEL_NAMES: Record<number, string> = {
  1: "Context",
  2: "The case",
  3: "Steps",
  4: "Judgment",
  5: "Guardrails",
};

export const LEDGER: LedgerSlot[] = [
  // Level 1 – Context (once per app / session)
  { level: 1, id: "ctx.app", name: "The app or system", fill: "ask-if-new", q: "I haven't seen this app before. What is it, and what do you use it for?" },
  { level: 1, id: "ctx.role", name: "The expert's role", fill: "ask", q: "What's your role here, and who do you hand work to?" },
  { level: 1, id: "ctx.task", name: "The task, in one sentence", fill: "ask", q: "What are we doing right now, in one sentence?" },
  { level: 1, id: "ctx.done", name: "What done looks like", fill: "ask", q: "How do you know this task is finished?" },
  { level: 1, id: "ctx.people", name: "Who approves, who you escalate to", fill: "ask", q: "Who else touches this? Who approves, and who do you escalate to?" },

  // Level 2 – The case (per item)
  { level: 2, id: "case.item", name: "What this item is", fill: "observe", q: "What is this one? A ticket, an invoice, a customer?" },
  { level: 2, id: "case.source", name: "Where it came from", fill: "observe", q: "Where did this one come from? E-mail, phone, portal?" },
  { level: 2, id: "case.normal", name: "Typical or unusual", fill: "ask", q: "Is this a typical one, or is something off about it?" },
  { level: 2, id: "case.first", name: "What you check first", fill: "ask", q: "What do you look at first, before you do anything?" },

  // Level 3 – Steps (observed, asked only when unclear)
  { level: 3, id: "step.purpose", name: "What a step is for", fill: "observe", q: "You just did that. What is that step for?" },
  { level: 3, id: "step.order", name: "Whether order matters", fill: "ask", q: "Does this always come before that, or doesn't it matter?" },
  { level: 3, id: "step.skipped", name: "Skipped fields or steps", fill: "observe", q: "You skipped that field. On purpose?" },
  { level: 3, id: "step.tool", name: "Other tools consulted", fill: "observe", q: "You opened that. What are you looking for there?" },

  // Level 4 – Judgment (the core, always asked)
  { level: 4, id: "why.reason", name: "The reason for a decision", fill: "ask", q: "You chose that over the other option. What made you choose it?" },
  { level: 4, id: "why.alt", name: "When the alternative applies", fill: "ask", q: "When would you have done the other thing instead?" },
  { level: 4, id: "why.signal", name: "The signal that decided it", fill: "ask", q: "What told you? The amount, the sender, the wording?" },
  { level: 4, id: "why.confidence", name: "How sure the expert is", fill: "ask", q: "Were you sure there, or is that something you'd double-check?" },

  // Level 5 – Guardrails (at least one per task)
  { level: 5, id: "guard.limit", name: "Hard limits", fill: "ask", q: "Is there a number or a limit here you never go past?" },
  { level: 5, id: "guard.exception", name: "Exceptions to the rule", fill: "ask", q: "Is there a case where that rule doesn't apply?" },
  { level: 5, id: "guard.stop", name: "When to stop and ask, and whom", fill: "ask", q: "When would you stop and ask someone? Who?" },
  { level: 5, id: "guard.never", name: "What you never do", fill: "ask", q: "What would you never do here, even if asked nicely?" },
  { level: 5, id: "guard.consequence", name: "What goes wrong otherwise", fill: "ask", q: "What goes wrong if someone gets this step wrong?" },

  // Meta
  { level: 0, id: "meta.offrecord", name: "Things to leave out", fill: "ask", q: "Should I leave that out?" },
  { level: 0, id: "meta.teachback", name: "Expert confirmed the summary", fill: "ask", q: "Did I get that right?" },
];

/** Phase A – scripted fundamentals, asked in this order before the work starts (deterministic, no LLM). */
export const FUNDAMENTALS = ["ctx.app", "ctx.task", "ctx.done", "ctx.people"] as const;

/** Phase B – generated probes. Once the fundamentals are filled, the LLM digs. */
export const PROBE_GUIDE = `
PROBE MODE (fundamentals are known – now dig)
Ask the question an experienced apprentice would ask after watching THIS exact moment. Prefer, in order:
1. Counterfactual: "What would have made you do the opposite here?"
2. Signal: "Which detail decided it – the amount, the sender, the channel, the wording?"
3. Edge: "What is the trickiest version of this you've seen? How did you handle it?"
4. Comparison: "You treated this one differently from the previous one. What changed?"
5. Threshold: "Is there a number where your answer flips?"
6. Delegation: "Could a new hire do this step alone, or should they always check with someone?"
7. Confidence: "Were you sure, or would you double-check this in real life?"
Make it concrete: name the record, field and value you just saw. One sentence. Never generic.`;

export const FUNDAMENTALS_MODE =
  "FUNDAMENTALS MODE: a context slot is still empty. Ask the most important empty level-1 slot, phrased for what is on screen.";

export const ASK_POLICY = `
ASK POLICY
- Level 1 (context) only when the app, task or role is unknown or clearly new. Ask it before anything else.
- Level 5 (guardrails) at least once per task.
- Levels 2–4 only when something happened on screen that the ledger cannot yet explain.
- Pick ONE question: the emptiest, highest-level slot that the latest events touch. Prefer level 1 > 5 > 4 > 2 > 3.
- Max 5 live questions per 10 minutes. Everything else waits for the debrief.
- Never ask what the screen already shows. Never repeat a filled slot.
- Rephrase the slot's question so it names the concrete thing on screen (record id, field, value).`;

/** The scripted questions still owed before the work starts. */
export function missingFundamentals(filled: Ledger = {}, opts: { appIsNew?: boolean } = {}): LedgerSlot[] {
  const appIsNew = opts.appIsNew ?? true;
  return FUNDAMENTALS.filter((id) => !filled[id] && (id !== "ctx.app" || appIsNew))
    .map((id) => LEDGER.find((s) => s.id === id))
    .filter((s): s is LedgerSlot => Boolean(s));
}

/** Compact text for the prompt: every slot, FILLED (with the expert's words) or EMPTY. */
export function ledgerSummary(filled: Ledger = {}): string {
  return LEDGER.map(
    (s) => `${s.id} [L${s.level}] ${s.name}: ${filled[s.id] ? "FILLED – " + String(filled[s.id]).slice(0, 80) : "EMPTY"}`,
  ).join("\n");
}

/** Per-level fill counts for the UI ("What Mira knows"). */
export function ledgerProgress(filled: Ledger = {}): { level: number; name: string; slots: LedgerSlot[]; filled: number }[] {
  return [1, 2, 3, 4, 5].map((level) => {
    const slots = LEDGER.filter((s) => s.level === level);
    return { level, name: LEDGER_LEVEL_NAMES[level], slots, filled: slots.filter((s) => filled[s.id]).length };
  });
}

export function isFundamental(slotId: string | null | undefined): boolean {
  return Boolean(slotId) && (FUNDAMENTALS as readonly string[]).includes(slotId as string);
}
