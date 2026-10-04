import {
  ASK_POLICY,
  FUNDAMENTALS_MODE,
  PROBE_GUIDE,
  ledgerSummary,
  localLiveQuestion,
  missingFundamentals,
  redactDeep,
  type Ledger,
  type QuestionKind,
  type TranscriptLine,
} from "@mira/core";
import { askJson } from "@/lib/llm";

export const runtime = "nodejs";

const SYSTEM = `You are the brain of an apprentice that silently watches an expert do their real work (any software, any company) through a shared screen and their spoken narration. At a natural pause you ask ONE short spoken question to capture knowledge that is NOT written down.

Pick the single best question about the most recent meaningful moment.

Good questions reveal:
- the REASON behind a decision ("You picked X over Y. What made you do that?")
- a GUARDRAIL: a limit, an exception, or the moment to stop and ask someone ("Is there a limit there?", "When would you NOT do this?", "Who would you ask if...?")

Rules:
- Refer concretely to what they just said or what is on screen (a field, a value, a record, a page).
- Never ask what the screen or narration already answers.
- Never repeat or rephrase an already-asked question.
- Max 20 words, natural spoken English, friendly and curious, like a thoughtful colleague.
- Prefer a guardrail question if none of the previous questions was about a guardrail.
- Never say personal data out loud (names of private people, phone numbers, e-mails, IDs).
- If nothing meaningful happened, set "skip": true.

You are given the KNOWLEDGE LEDGER: the slots you must fill about any work, with which are already FILLED. Follow the ASK POLICY and the MODE. Your question fills exactly one EMPTY slot; return its id as "slot".

Return JSON: {"skip": boolean, "question": string, "kind": "why"|"guardrail"|"exception"|"context", "slot": string}`;

type Body = {
  expertName?: string;
  recent?: TranscriptLine[];
  asked?: { question: string; kind: QuestionKind }[];
  screenChanges?: number;
  image?: string;
  /** Knowledge ledger so far: slotId → expert's words. */
  ledger?: Ledger;
  /** What Mira could NOT explain from watching (from /api/capture/observe). Ask about exactly this. */
  confusion?: string;
};

export async function POST(request: Request) {
  const body = redactDeep((await request.json().catch(() => ({}))) as Body);
  const recent = (body.recent ?? []).slice(-10);
  const asked = (body.asked ?? []).slice(-8);
  const fallback = localLiveQuestion({ recent: recent.filter((l) => l.who === "expert").map((l) => l.text), asked });
  const ledger = body.ledger ?? {};
  const fundamentalsDone = missingFundamentals(ledger, { appIsNew: false }).length === 0;

  const out = (await askJson({
    system: SYSTEM,
    user: {
      expert: body.expertName || "the expert",
      recentTranscript: recent.map((l) => `${l.who}: ${l.text}`),
      screenChangesSinceLastQuestion: body.screenChanges ?? 0,
      alreadyAsked: asked.map((q) => q.question),
      guardrailAskedYet: asked.some((q) => q.kind === "guardrail"),
      screen: body.image ? "The current screen is attached." : "No screen frame available.",
      KNOWLEDGE_LEDGER: ledgerSummary(ledger),
      ASK_POLICY,
      MODE: fundamentalsDone ? PROBE_GUIDE : FUNDAMENTALS_MODE,
      ...(body.confusion
        ? { WHAT_I_DID_NOT_UNDERSTAND: `${body.confusion} — ask about EXACTLY this, in the expert's terms. Do not skip.` }
        : {}),
    },
    images: body.image ? [body.image] : [],
    maxTokens: 200,
    timeoutMs: 12_000,
  })) as { skip?: boolean; question?: string; kind?: string; slot?: string } | null;

  if (!out) return Response.json({ ...fallback, slot: fallback.kind === "guardrail" ? "guard.limit" : "why.reason", source: "local" });
  const kind: QuestionKind = out.kind === "guardrail" || out.kind === "exception" || out.kind === "context" ? out.kind : "why";
  const question = String(out.question || "").trim();
  const slot = typeof out.slot === "string" && out.slot ? out.slot : kind === "guardrail" ? "guard.limit" : "why.reason";
  if (out.skip || !question) return Response.json({ skip: true, question: "", kind, slot, source: "model" });
  return Response.json({ skip: false, question, kind, slot, source: "model" });
}
