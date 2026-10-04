import {
  ensureMinOpenQuestions,
  localWorkMapDraft,
  localWorkMapFinal,
  normalizeWorkMap,
  redactDeep,
  type LiveQuestion,
  type TranscriptLine,
  type WorkMap,
} from "@mira/core";
import { askJson } from "@/lib/llm";

export const runtime = "nodejs";

const DRAFT_SYSTEM = `You turn a recorded expert session into a draft "Work Map": the workflow a new hire must follow, with the expert's judgment calls and guardrails. The expert may use any software; you only have their narration, the apprentice's live questions with answers, and a few screen frames.

Input: transcript lines (t = ms since start, who = expert|apprentice), live questions with answers, and screen moments [{id, t}] (some attached as images, in the listed order).

Produce:
1. steps: the ordered workflow (aim for 4–8 steps). Each step:
   - title (imperative, short), t (ms of its moment), momentId (id of the closest screen moment at or before t, or null)
   - screen (one line: what was on screen, no personal data), decision (what the expert decided)
   - isJudgmentCall (true if it was a non-obvious decision)
   - reason (in the expert's OWN words, quote the transcript where possible; "" if not explained)
   - reasonSource ("live question at mm:ss" | "narration at mm:ss" | "not yet explained")
   - guardrailIds: ids of guardrails that apply
2. guardrails: [{id: "G1"..., type: "limit"|"exception"|"stop_and_ask", rule, quote (expert's words or ""), t, momentId}]
3. openQuestions: at least 3 follow-up questions about gaps the live session did NOT fully answer (unexplained judgment calls, unclear limits, exceptions, unseen edge cases, when to stop and ask). Short, spoken style. Prefer real gaps; if the recording was thorough, still ask the three most important things a new hire would need confirmed. Cap at 5. Never invent fake gaps about things already answered clearly.
4. teachBack: the whole process explained back in plain spoken English, under 120 words. Statement only — do not end with "is that right?".
5. title: short name of the task, e.g. "Handling refund requests".

Never invent reasons the expert did not give; leave reason "" and put the gap in openQuestions.
Return JSON: {"title": string, "steps": [...], "guardrails": [...], "openQuestions": [...], "teachBack": string}`;

const FINAL_SYSTEM = `You finalise a Work Map after the expert's debrief.
Input: the draft Work Map and the debrief transcript (answers to the open follow-up questions, then a teach-back the expert confirmed or corrected).
- Fill in reasons and guardrails using the expert's own words from the debrief (reasonSource: "debrief").
- Apply every correction the expert made to the teach-back or answers. Add new guardrails the debrief revealed.
- Keep every step's t and momentId.
- Refresh teachBack so it reflects the filled-in map (plain spoken English, under 120 words). Statement only — the expert already confirmed it in the UI.
- "corrections": only things the expert explicitly corrected, one short plain sentence each in the expert's terms (e.g. "Business customers go to finance, not the team lead"). Empty list if none. Do not log fills or rewording.
- Drop openQuestions that were answered; unanswered ones may remain empty after a full debrief.
Return JSON with the same shape as the draft plus {"confirmed": true, "corrections": [string]}.`;

type MomentRef = { id: string; t: number; image?: string };

type Body = {
  mode?: "draft" | "final";
  expertName?: string;
  transcript?: TranscriptLine[];
  questions?: LiveQuestion[];
  moments?: MomentRef[];
  draft?: WorkMap;
  debrief?: TranscriptLine[];
};

export async function POST(request: Request) {
  const body = redactDeep((await request.json().catch(() => ({}))) as Body);
  const moments = (body.moments ?? []).map(({ id, t }) => ({ id, t }));
  const expertName = body.expertName || "the expert";

  if (body.mode === "final") {
    if (!body.draft) return Response.json({ error: "draft required" }, { status: 400 });
    const debrief = body.debrief ?? [];
    const fallback = localWorkMapFinal(body.draft, debrief);
    const out = await askJson({
      system: FINAL_SYSTEM,
      user: {
        expert: expertName,
        draft: body.draft,
        debriefTranscript: debrief.map((l) => `${l.who}: ${l.text}`),
      },
      maxTokens: 4000,
      timeoutMs: 60_000,
    });
    const map = normalizeWorkMap(out, moments);
    if (!map) return Response.json({ map: fallback, source: "local" });
    return Response.json({ map: { ...map, confirmed: true, openQuestions: [] }, source: "model" });
  }

  const transcript = body.transcript ?? [];
  const questions = body.questions ?? [];
  const fallback = localWorkMapDraft({ expertName, transcript, questions, moments });
  const withImages = (body.moments ?? []).filter((m) => m.image).slice(0, 6);
  const out = await askJson({
    system: DRAFT_SYSTEM,
    user: {
      expert: expertName,
      transcript: transcript.map((l) => ({ t: Math.round(l.t), who: l.who, text: l.text })),
      liveQuestions: questions.map(({ t, question, answer, momentId }) => ({ t: Math.round(t), question, answer, momentId })),
      screenMoments: moments.map((m) => ({ id: m.id, t: Math.round(m.t) })),
      attachedImages: withImages.map((m) => m.id),
    },
    images: withImages.map((m) => m.image as string),
    maxTokens: 4000,
    timeoutMs: 60_000,
  });
  const map = normalizeWorkMap(out, moments);
  if (!map) return Response.json({ map: fallback, source: "local" });
  return Response.json({
    map: { ...ensureMinOpenQuestions({ ...map, confirmed: false, corrections: [] }), confirmed: false, corrections: [] },
    source: "model",
  });
}
