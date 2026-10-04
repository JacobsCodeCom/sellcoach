import { LEDGER, ledgerSummary, redactDeep, type Ledger, type TranscriptLine } from "@mira/core";
import { askJson } from "@/lib/llm";

export const runtime = "nodejs";

/** Slots Mira is allowed to fill by WATCHING (no question needed). */
const OBSERVE_SLOTS = LEDGER.filter((s) => s.fill === "observe").map((s) => s.id);

const SYSTEM = `You are the eyes of Mira, an apprentice silently watching an expert work in any software. You get the current screen and the last things the expert said.

Do three things:
1. "activity": in ONE short line, what the expert is doing right now, concretely (app, page, record, action). Say "unclear" if you cannot tell.
2. "fills": fill ONLY these ledger slots, and ONLY when the screen or words clearly show it: ${OBSERVE_SLOTS.join(", ")}. Values are short (max 12 words), concrete, no personal data. Never fill a slot that is already FILLED. Never guess.
3. "understood": true if the ledger + narration explain what you see. false when the expert just did something you cannot explain: a new page or tool you have not seen, a field left empty, a choice between options with no reason given, a value that seems odd, a step that does not follow from the task. Then put the exact puzzle in "confusion" (one sentence, name the thing on screen) — that is what Mira will ask about at the next pause.

Return JSON: {"activity": string, "fills": {slotId: value}, "understood": boolean, "confusion": string}`;

type Body = { image?: string; recent?: TranscriptLine[]; ledger?: Ledger; expertName?: string };

export async function POST(request: Request) {
  const body = redactDeep((await request.json().catch(() => ({}))) as Body);
  const ledger = body.ledger ?? {};
  const recent = (body.recent ?? []).slice(-6);
  const lastSaid = [...recent].reverse().find((l) => l.who === "expert")?.text ?? "";
  const out = body.image
    ? ((await askJson({
        system: SYSTEM,
        user: {
          expert: body.expertName || "the expert",
          recentNarration: recent.map((l) => `${l.who}: ${l.text}`),
          KNOWLEDGE_LEDGER: ledgerSummary(ledger),
        },
        images: [body.image],
        maxTokens: 300,
        timeoutMs: 12_000,
        priority: "latency",
      })) as { activity?: string; fills?: Record<string, string>; understood?: boolean; confusion?: string } | null)
    : null;

  if (!out) {
    // No model / no frame: fall back to the narration. Mira "understands" unless the expert sounds puzzled themselves.
    const puzzled = /(weird|strange|odd|hmm|not sure|normally|usually|except|but this one)/i.test(lastSaid);
    return Response.json({
      activity: lastSaid ? lastSaid.slice(0, 80) : "unclear",
      fills: {},
      understood: !puzzled,
      confusion: puzzled ? `You said "${lastSaid.slice(0, 60)}" — what is different about this one?` : "",
      source: "local",
    });
  }
  const fills: Record<string, string> = {};
  for (const [k, v] of Object.entries(out.fills ?? {})) {
    if (OBSERVE_SLOTS.includes(k) && !ledger[k] && typeof v === "string" && v.trim()) fills[k] = v.trim().slice(0, 90);
  }
  return Response.json({
    activity: String(out.activity || "unclear").slice(0, 120),
    fills,
    understood: out.understood !== false,
    confusion: out.understood === false ? String(out.confusion || "").slice(0, 200) : "",
    source: "model",
  });
}
