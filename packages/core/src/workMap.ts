import { formatClock } from "./apprentice";
import { ruleLabelFromAnswer } from "./transcript";
import type {
  GuardrailType,
  LiveQuestion,
  QuestionKind,
  ScreenMoment,
  TranscriptLine,
  WorkMap,
  WorkMapGuardrail,
  WorkMapStep,
} from "./types";

/**
 * Challenge brief: debrief asks ≥3 follow-ups not answered live, then teach-back.
 * Prefer real gaps; pad only enough to meet the bar.
 */
export const MIN_DEBRIEF_QUESTIONS = 3;
/** Soft cap so the debrief stays short. */
export const MAX_DEBRIEF_QUESTIONS = 5;

const PAD_OPEN_QUESTIONS = [
  "What would make you stop and ask someone before finishing?",
  "Is there a limit or exception a new hire would miss here?",
  "When would you NOT do it the way you just did?",
  "What are you checking that isn't obvious from the screen alone?",
  "Who else needs to be involved, and when?",
];

/** Ensure the debrief has enough real follow-ups (pad with judgment / guardrail prompts if needed). */
export function ensureMinOpenQuestions(
  map: WorkMap,
  min = MIN_DEBRIEF_QUESTIONS,
  max = MAX_DEBRIEF_QUESTIONS,
): WorkMap {
  const open = [...map.openQuestions];
  for (const step of map.steps) {
    if (open.length >= min) break;
    if (step.reason?.trim()) continue;
    const q = `At "${step.title}", why did you do it that way?`;
    if (!open.includes(q)) open.push(q);
  }
  for (const step of map.steps.filter((s) => s.isJudgmentCall)) {
    if (open.length >= min) break;
    const q = `At "${step.title}", what would change that decision?`;
    if (!open.includes(q)) open.push(q);
  }
  if (!map.guardrails.length) {
    for (const q of PAD_OPEN_QUESTIONS) {
      if (open.length >= min) break;
      if (!open.includes(q)) open.push(q);
    }
  } else {
    for (const g of map.guardrails) {
      if (open.length >= min) break;
      const q = `About "${g.rule.slice(0, 48)}": when would that not apply?`;
      if (!open.includes(q)) open.push(q);
    }
    for (const q of PAD_OPEN_QUESTIONS) {
      if (open.length >= min) break;
      if (!open.includes(q)) open.push(q);
    }
  }
  return { ...map, openQuestions: open.slice(0, max) };
}

export type WorkMapInput = {
  expertName: string;
  transcript: TranscriptLine[];
  questions: LiveQuestion[];
  moments: Pick<ScreenMoment, "id" | "t" | "url">[];
};

function pageUrlForMoment(
  moments: Pick<ScreenMoment, "id" | "url">[],
  momentId: string | null,
): string | undefined {
  if (!momentId) return undefined;
  const url = moments.find((m) => m.id === momentId)?.url?.trim();
  return url || undefined;
}

const RULE_WORDS =
  /\b(never|always|only|unless|except|don'?t|do not|must|limit|max(imum)?|at most|no more than|ask|escalate|check with|stop|before)\b/i;

export function guardrailTypeFor(text: string): GuardrailType {
  if (/\b(unless|except|only if|but if|exception)\b/i.test(text)) return "exception";
  if (/\b(ask(ing)?|escalat\w*|check(ing)? with|stop(ping)?|call (my|the|a) (manager|lead|boss))\b/i.test(text)) {
    return "stop_and_ask";
  }
  return "limit";
}

export function nearestMomentId(moments: Pick<ScreenMoment, "id" | "t">[], t: number | null): string | null {
  if (t == null || !moments.length) return null;
  let best: Pick<ScreenMoment, "id" | "t"> | null = null;
  for (const m of moments) {
    if (m.t > t + 2000) continue;
    if (!best || m.t > best.t) best = m;
  }
  return (best ?? moments[0]).id;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

function lastExpertLineBefore(transcript: TranscriptLine[], t: number): TranscriptLine | null {
  let found: TranscriptLine | null = null;
  for (const line of transcript) {
    if (line.who !== "expert") continue;
    if (line.t > t) break;
    found = line;
  }
  return found;
}

/** Group narration into chunks separated by long gaps; used when no live questions were asked. */
function narrationChunks(transcript: TranscriptLine[], maxChunks = 6): TranscriptLine[][] {
  const expert = transcript.filter((l) => l.who === "expert" && l.text.trim());
  if (!expert.length) return [];
  const size = Math.max(1, Math.ceil(expert.length / maxChunks));
  const chunks: TranscriptLine[][] = [];
  for (let i = 0; i < expert.length; i += size) chunks.push(expert.slice(i, i + size));
  return chunks;
}

/** Offline Work Map draft: steps from live questions (or narration), guardrails from rule-like sentences. */
export function localWorkMapDraft(input: WorkMapInput): WorkMap {
  const { transcript, questions, moments } = input;
  const first = input.expertName.split(/\s+/)[0] || "the expert";
  const steps: WorkMapStep[] = [];

  const asked = [...questions].sort((a, b) => a.t - b.t);
  if (asked.length) {
    for (const q of asked) {
      const before = lastExpertLineBefore(transcript, q.t);
      const doing = before?.text.trim() || "";
      const momentId = q.momentId ?? nearestMomentId(moments, q.t);
      steps.push({
        id: `S${steps.length + 1}`,
        title: ruleLabelFromAnswer(doing || q.question.replace(/\?$/, "")),
        t: q.t,
        momentId,
        screen: "",
        decision: doing,
        isJudgmentCall: q.kind !== "why" || Boolean(q.answer.trim()),
        reason: q.answer.trim(),
        reasonSource: q.answer.trim() ? `live question at ${formatClock(q.t)}` : "not yet explained",
        guardrailIds: [],
        pageUrl: pageUrlForMoment(moments, momentId),
      });
    }
  } else {
    for (const chunk of narrationChunks(transcript)) {
      const text = chunk.map((l) => l.text.trim()).join(" ");
      const t = chunk[0].t;
      const momentId = nearestMomentId(moments, t);
      steps.push({
        id: `S${steps.length + 1}`,
        title: ruleLabelFromAnswer(text),
        t,
        momentId,
        screen: "",
        decision: text,
        isJudgmentCall: RULE_WORDS.test(text),
        reason: "",
        reasonSource: "not yet explained",
        guardrailIds: [],
        pageUrl: pageUrlForMoment(moments, momentId),
      });
    }
  }

  const guardrails: WorkMapGuardrail[] = [];
  const seen = new Set<string>();
  const sources: { t: number; text: string }[] = [
    ...asked.filter((q) => q.answer.trim()).map((q) => ({ t: q.t, text: q.answer })),
    ...transcript.filter((l) => l.who === "expert").map((l) => ({ t: l.t, text: l.text })),
  ];
  for (const src of sources) {
    for (const s of sentences(src.text.endsWith(".") ? src.text : `${src.text}.`)) {
      if (!RULE_WORDS.test(s)) continue;
      const key = s.toLowerCase().slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      const id = `G${guardrails.length + 1}`;
      guardrails.push({
        id,
        type: guardrailTypeFor(s),
        rule: s.replace(/[.!?]+$/, ""),
        quote: s,
        t: src.t,
        momentId: nearestMomentId(moments, src.t),
      });
      const step = [...steps].reverse().find((st) => st.t != null && st.t <= src.t + 1000) ?? steps[0];
      step?.guardrailIds.push(id);
      if (guardrails.length >= 6) break;
    }
    if (guardrails.length >= 6) break;
  }

  const openQuestions: string[] = [];
  for (const step of steps) {
    if (!step.reason?.trim() && openQuestions.length < MIN_DEBRIEF_QUESTIONS) {
      openQuestions.push(`At "${step.title}", why did you do it that way?`);
    }
  }

  const map: WorkMap = ensureMinOpenQuestions({
    title: steps.length ? `How ${first} works` : `${first}'s session`,
    steps,
    guardrails,
    openQuestions,
    teachBack: "",
    confirmed: false,
    corrections: [],
  });
  return { ...map, teachBack: localTeachBack(map) };
}

export function localTeachBack(map: Pick<WorkMap, "steps" | "guardrails">): string {
  const order = ["First", "Then", "Next", "After that", "Then", "Finally"];
  const parts = map.steps.slice(0, 6).map((s, i) => `${order[Math.min(i, order.length - 1)]}, ${lowerFirst(s.title)}.`);
  const rules = map.guardrails.slice(0, 4).map((g) => g.rule.replace(/[.!?]+$/, ""));
  const ruleText = rules.length ? ` The rules: ${rules.join(". ")}.` : "";
  // UI asks for confirmation separately — keep the spoken teach-back as a statement.
  return `Here's how I understood it. ${parts.join(" ")}${ruleText}`.replace(/\s+/g, " ").trim();
}

function lowerFirst(text: string): string {
  return text.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
}

const AFFIRM = /\b(yes|yeah|yep|right|correct|exactly|that's it|thats it|spot on)\b/i;
const NEGATE = /\b(no|not|but|except|actually|wrong)\b/i;

export function isAffirmative(text: string): boolean {
  return AFFIRM.test(text) && !NEGATE.test(text);
}

/** Offline debrief merge: answers fill reasons or become guardrails; teach-back corrections are kept. */
export function localWorkMapFinal(draft: WorkMap, debrief: TranscriptLine[]): WorkMap {
  const map: WorkMap = JSON.parse(JSON.stringify(draft));
  const answered = new Set<string>();
  let afterTeachBack = false;

  for (let i = 0; i < debrief.length; i += 1) {
    const line = debrief[i];
    if (line.who !== "apprentice") continue;
    if (/understood it|explain the whole process|got anything wrong/i.test(line.text)) {
      afterTeachBack = true;
    }
    const answers: string[] = [];
    for (let j = i + 1; j < debrief.length && debrief[j].who === "expert"; j += 1) answers.push(debrief[j].text.trim());
    const answer = answers.join(" ").trim();
    if (!answer) continue;

    if (afterTeachBack) {
      if (!isAffirmative(answer)) {
        map.corrections.push(answer);
        addGuardrail(map, answer);
      }
      continue;
    }

    const question = map.openQuestions.find((q) => line.text.includes(q.slice(0, 30))) ?? line.text;
    answered.add(question);
    const stepTitle = question.match(/^At "(.+?)"/)?.[1];
    const step = stepTitle ? map.steps.find((s) => s.title === stepTitle) : undefined;
    if (step && !step.reason) {
      step.reason = answer;
      step.reasonSource = "debrief";
      step.isJudgmentCall = true;
    }
    if (!step || RULE_WORDS.test(answer)) addGuardrail(map, answer, step);
  }

  map.openQuestions = map.openQuestions.filter((q) => !answered.has(q));
  map.confirmed = true;
  map.teachBack = map.corrections.length ? localTeachBack(map) : map.teachBack;
  return map;
}

function addGuardrail(map: WorkMap, text: string, step?: WorkMapStep) {
  const id = `G${map.guardrails.length + 1}`;
  const anchor = step ?? map.steps.at(-1);
  map.guardrails.push({
    id,
    type: guardrailTypeFor(text),
    rule: text.replace(/[.!?]+$/, ""),
    quote: text,
    t: anchor?.t ?? null,
    momentId: anchor?.momentId ?? null,
  });
  anchor?.guardrailIds.push(id);
}

/** Offline live question: rotate through why / guardrail / exception, anchored on what was just said. */
export function localLiveQuestion(input: {
  recent: string[];
  asked: Pick<LiveQuestion, "question" | "kind">[];
}): { skip: boolean; question: string; kind: QuestionKind } {
  const last = input.recent.filter((l) => l.trim()).at(-1)?.trim() ?? "";
  const about = last ? ` "${ruleLabelFromAnswer(last, 40)}"` : "";
  const guardrailYet = input.asked.some((q) => q.kind === "guardrail");
  const pool: { question: string; kind: QuestionKind }[] = [
    { question: `You just did${about || " that"}. What made you do it that way?`, kind: "why" },
    { question: "Is there a limit there, or a point where you'd stop and ask someone?", kind: "guardrail" },
    { question: "When would you NOT do it like that?", kind: "exception" },
    { question: "What would a new person most likely get wrong at this point?", kind: "guardrail" },
    { question: "What are you checking on the screen right now, and why?", kind: "why" },
  ];
  const fresh = pool.filter((p) => !input.asked.some((a) => a.question === p.question));
  const pick = (!guardrailYet && fresh.find((p) => p.kind === "guardrail")) || fresh[0];
  if (!pick) return { skip: true, question: "", kind: "why" };
  return { skip: false, ...pick };
}

const GUARDRAIL_TYPES: GuardrailType[] = ["limit", "exception", "stop_and_ask"];

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Coerce model output into a valid WorkMap; unknown moment/guardrail ids are dropped. */
export function normalizeWorkMap(
  raw: unknown,
  moments: Pick<ScreenMoment, "id" | "t" | "url">[],
): WorkMap | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const momentIds = new Set(moments.map((m) => m.id));
  const rawSteps = Array.isArray(r.steps) ? r.steps : [];
  const rawGuards = Array.isArray(r.guardrails) ? r.guardrails : [];

  const guardIdMap = new Map<string, string>();
  const guardrails: WorkMapGuardrail[] = rawGuards
    .map((g) => (g && typeof g === "object" ? (g as Record<string, unknown>) : null))
    .filter((g): g is Record<string, unknown> => Boolean(g && str(g.rule)))
    .map((g, i) => {
      const id = `G${i + 1}`;
      if (str(g.id)) guardIdMap.set(str(g.id), id);
      const t = num(g.t);
      const momentId = momentIds.has(str(g.momentId)) ? str(g.momentId) : nearestMomentId(moments, t);
      return {
        id,
        type: GUARDRAIL_TYPES.includes(g.type as GuardrailType) ? (g.type as GuardrailType) : guardrailTypeFor(str(g.rule)),
        rule: str(g.rule),
        quote: str(g.quote),
        t,
        momentId,
      };
    });

  const steps: WorkMapStep[] = rawSteps
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : null))
    .filter((s): s is Record<string, unknown> => Boolean(s && str(s.title)))
    .map((s, i) => {
      const t = num(s.t);
      const momentId = momentIds.has(str(s.momentId)) ? str(s.momentId) : nearestMomentId(moments, t);
      const reason = str(s.reason);
      const ids = Array.isArray(s.guardrailIds) ? s.guardrailIds.map((x) => guardIdMap.get(str(x))).filter(Boolean) : [];
      const fromModel = str(s.pageUrl);
      return {
        id: `S${i + 1}`,
        title: str(s.title),
        t,
        momentId,
        screen: str(s.screen),
        decision: str(s.decision),
        isJudgmentCall: s.isJudgmentCall === true,
        reason: /^not yet explained$/i.test(reason) ? "" : reason,
        reasonSource: str(s.reasonSource) || (reason ? "narration" : "not yet explained"),
        guardrailIds: [...new Set(ids as string[])],
        pageUrl: fromModel || pageUrlForMoment(moments, momentId),
      };
    });

  if (!steps.length) return null;
  const map = ensureMinOpenQuestions({
    title: str(r.title) || "Work Map",
    steps,
    guardrails,
    openQuestions: Array.isArray(r.openQuestions)
      ? r.openQuestions.map(str).filter(Boolean).slice(0, MAX_DEBRIEF_QUESTIONS)
      : [],
    teachBack: str(r.teachBack),
    confirmed: r.confirmed === true,
    corrections: Array.isArray(r.corrections) ? r.corrections.map(str).filter(Boolean) : [],
  });
  if (!map.teachBack) map.teachBack = localTeachBack(map);
  return map;
}

/** Moments referenced by a Work Map (the rest can be dropped to save storage). */
export function referencedMomentIds(map: WorkMap): Set<string> {
  const ids = new Set<string>();
  for (const s of map.steps) if (s.momentId) ids.add(s.momentId);
  for (const g of map.guardrails) if (g.momentId) ids.add(g.momentId);
  return ids;
}
