import { askJson } from "@/lib/llm";

export const runtime = "nodejs";

export type HighlightRect = {
  /** Left edge as a fraction of viewport width (0–1). */
  x: number;
  /** Top edge as a fraction of viewport height (0–1). */
  y: number;
  /** Width as a fraction of viewport width (0–1). */
  w: number;
  /** Height as a fraction of viewport height (0–1). */
  h: number;
};

const SYSTEM = `You help a new hire find the next UI control on their live screen.

You receive two screenshots:
1) expertMoment — what the expert's screen looked like for this step
2) learnerFrame — the learner's current tab

Find ONE interactive control on the learner frame that matches what the expert was using / pointing the learner toward for this step. Prefer buttons, fields, links, menus, or tabs described by the step hint.

Return JSON only:
{"rect":{"x":number,"y":number,"w":number,"h":number}|null}

Rules:
- x,y,w,h are fractions of the learner frame (0–1). x,y is the top-left of the box.
- Keep the box tight around the control (typically w and h between 0.02 and 0.25).
- If the learner is on a different page, the control is not visible, or you are not confident, return {"rect":null}.
- Never invent a random center box. Null is better than a wrong highlight.`;

type Body = {
  expertImage?: string;
  learnerImage?: string;
  screen?: string;
  decision?: string;
  stepTitle?: string;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function parseRect(raw: unknown): HighlightRect | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const x = Number(r.x);
  const y = Number(r.y);
  const w = Number(r.w);
  const h = Number(r.h);
  if (![x, y, w, h].every((v) => Number.isFinite(v))) return null;
  const rect = { x: clamp01(x), y: clamp01(y), w: clamp01(w), h: clamp01(h) };
  if (rect.w < 0.01 || rect.h < 0.01) return null;
  if (rect.x + rect.w > 1.05 || rect.y + rect.h > 1.05) {
    rect.w = Math.min(rect.w, 1 - rect.x);
    rect.h = Math.min(rect.h, 1 - rect.y);
  }
  if (rect.w < 0.01 || rect.h < 0.01) return null;
  return rect;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const expertImage = typeof body.expertImage === "string" ? body.expertImage : "";
  const learnerImage = typeof body.learnerImage === "string" ? body.learnerImage : "";
  if (!expertImage.startsWith("data:image/") || !learnerImage.startsWith("data:image/")) {
    return Response.json({ rect: null, error: "expertImage and learnerImage data URLs required" }, { status: 400 });
  }

  const out = (await askJson({
    system: SYSTEM,
    user: {
      stepTitle: body.stepTitle || null,
      lookFor: body.screen || null,
      expertDid: body.decision || null,
      images: "First image is the expert moment. Second image is the learner's current screen.",
    },
    images: [expertImage, learnerImage],
    maxTokens: 120,
    timeoutMs: 12_000,
    priority: "latency",
  })) as { rect?: unknown } | null;

  const rect = parseRect(out?.rect ?? null);
  return Response.json({ rect });
}
