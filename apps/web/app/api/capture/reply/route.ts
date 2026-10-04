import { ledgerSummary, redactDeep, type Ledger, type TranscriptLine } from "@mira/core";
import { askJson } from "@/lib/llm";

export const runtime = "nodejs";

const SYSTEM = `You are Mira, an apprentice quietly learning a job by watching an expert work. The expert just said something TO you (a question or a remark). Reply in ONE short spoken sentence (max 22 words), warm and natural.
- If they ask what you've learned or understood: summarise from the KNOWLEDGE LEDGER in one sentence, in their own words where possible.
- If they ask whether they should do X: do NOT give work advice (you are the apprentice, they are the expert). Say you'd rather hear how they decide, and ask one tiny why-question.
- If they tell you to be quiet, wait, or that it's off the record: acknowledge in 3–5 words.
- If it was not really addressed to you AND the expert did not say your name: set "skip": true. If they said your name, never skip.
- Never repeat or paraphrase what they said. Never lecture.
Return JSON: {"skip": boolean, "reply": string}`;

type Body = { expertName?: string; utterance?: string; recent?: TranscriptLine[]; ledger?: Ledger; direct?: boolean };

export async function POST(request: Request) {
  const body = redactDeep((await request.json().catch(() => ({}))) as Body);
  const utterance = String(body.utterance || "").trim();
  if (!utterance) return Response.json({ skip: true, reply: "" });
  const out = (await askJson({
    system: SYSTEM,
    user: {
      expert: body.expertName || "the expert",
      theyJustSaid: utterance,
      saidYourName: Boolean(body.direct),
      recentTranscript: (body.recent ?? []).slice(-8).map((l) => `${l.who}: ${l.text}`),
      KNOWLEDGE_LEDGER: ledgerSummary(body.ledger ?? {}),
    },
    maxTokens: 120,
    timeoutMs: 8_000,
    priority: "latency",
  })) as { skip?: boolean; reply?: string } | null;
  if (out && out.skip && !body.direct) return Response.json({ skip: true, reply: "" });
  if (!out || !out.reply) {
    // Offline fallback: a brief, honest acknowledgement.
    const local = /what (have|did) you (learn|understand)|so far/i.test(utterance)
      ? "So far I have the context and a couple of your rules; keep going and I'll fill the rest."
      : /quiet|wait|hold on|off the record/i.test(utterance)
        ? "Sure, I'll wait."
        : "I'm listening. Show me how you'd do it and I'll ask when I need to.";
    return Response.json({ skip: false, reply: local, source: "local" });
  }
  return Response.json({ skip: false, reply: String(out.reply).trim(), source: "model" });
}
