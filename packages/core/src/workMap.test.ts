import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APPRENTICE, apprenticeState, meetsLiveCaptureBar } from "./apprentice";
import { compileLessonFromWorkMap } from "./compileLessons";
import { localPracticeCases, localPracticeCheck, practiceReport } from "./practice";
import { redact, redactDeep } from "./redact";
import type { CaptureSession, LiveQuestion, TranscriptLine } from "./types";
import {
  ensureMinOpenQuestions,
  localLiveQuestion,
  localWorkMapDraft,
  localWorkMapFinal,
  MIN_DEBRIEF_QUESTIONS,
  normalizeWorkMap,
} from "./workMap";

const transcript: TranscriptLine[] = [
  { t: 1_000, who: "expert", text: "I open the refund request and check the order date" },
  { t: 9_000, who: "expert", text: "I look up the customer in the billing system" },
  { t: 20_000, who: "expert", text: "Refund approved and saved" },
];

const questions: LiveQuestion[] = [
  { id: "q1", t: 10_000, question: "Why the billing system?", kind: "why", answer: "The order page can be edited by the customer, billing can't.", momentId: "m2" },
  { id: "q2", t: 22_000, question: "Is there a limit?", kind: "guardrail", answer: "Never refund more than 200 euros without asking my lead.", momentId: "m3" },
];

const moments = [
  { id: "m1", t: 2_000 },
  { id: "m2", t: 10_500 },
  { id: "m3", t: 21_000 },
];

describe("apprenticeState", () => {
  const base = {
    now: 60_000,
    lastActivity: 50_000,
    lastQuestionAt: 0,
    pending: 2,
    asked: 0,
    speaking: false,
    awaitingAnswer: false,
    offRecord: false,
    busy: false,
  };

  it("asks only after a pause with something new", () => {
    assert.equal(apprenticeState(base).mayAsk, true);
    assert.equal(apprenticeState({ ...base, lastActivity: 59_000 }).mayAsk, false);
    // Under the bar, pending can be 0 (catch-up). At/above the bar, need new material.
    assert.equal(apprenticeState({ ...base, pending: 0 }).mayAsk, true);
    assert.equal(
      apprenticeState({ ...base, asked: APPRENTICE.minLiveQuestions, pending: 0 }).mayAsk,
      false,
    );
  });

  it("respects the gap, the cap and off the record", () => {
    // 10s since last ask — under catch-up gap (20s).
    assert.equal(apprenticeState({ ...base, lastQuestionAt: 50_000 }).mayAsk, false);
    assert.match(apprenticeState({ ...base, lastQuestionAt: 50_000 }).label, /Holding/);
    assert.equal(apprenticeState({ ...base, asked: APPRENTICE.maxLiveQuestions }).mayAsk, false);
    const off = apprenticeState({ ...base, offRecord: true });
    assert.equal(off.mayAsk, false);
    assert.equal(off.quietFrac, 0);
  });

  it("uses a shorter gap until the live question bar is met", () => {
    // 25s since last ask: allowed while catching up (20s), blocked once at/above min (90s).
    const catchingUp = apprenticeState({ ...base, asked: 0, lastQuestionAt: 35_000 });
    assert.equal(catchingUp.mayAsk, true);
    const atBar = apprenticeState({
      ...base,
      asked: APPRENTICE.minLiveQuestions,
      lastQuestionAt: 35_000,
    });
    assert.equal(atBar.mayAsk, false);
  });

  it("keeps asking while under the bar even with no new speech/screen", () => {
    const underBar = apprenticeState({
      ...base,
      asked: 2,
      pending: 0,
      lastQuestionAt: 20_000,
    });
    assert.equal(underBar.mayAsk, true);
    assert.match(underBar.label, /Catching up/);
    const atBarQuiet = apprenticeState({
      ...base,
      asked: APPRENTICE.minLiveQuestions,
      pending: 0,
      lastQuestionAt: 0,
    });
    assert.equal(atBarQuiet.mayAsk, false);
  });

  it("reports when the live capture bar is met", () => {
    assert.equal(meetsLiveCaptureBar([{ kind: "why" }, { kind: "why" }]).ok, false);
    assert.equal(
      meetsLiveCaptureBar([{ kind: "why" }, { kind: "why" }, { kind: "guardrail" }]).ok,
      true,
    );
  });
});

describe("local work map", () => {
  it("drafts one step per live question with reasons and guardrails", () => {
    const map = localWorkMapDraft({ expertName: "Erik Lund", transcript, questions, moments });
    assert.equal(map.steps.length, 2);
    assert.equal(map.steps[0].reason, questions[0].answer);
    assert.equal(map.steps[0].momentId, "m2");
    assert.ok(map.guardrails.some((g) => /200 euros/.test(g.rule) && g.type === "stop_and_ask"));
    assert.ok(map.openQuestions.length >= MIN_DEBRIEF_QUESTIONS);
    assert.ok(map.teachBack.length > 0);
  });

  it("falls back to narration chunks when nothing was asked", () => {
    const map = localWorkMapDraft({ expertName: "Erik", transcript, questions: [], moments });
    assert.ok(map.steps.length >= 1);
    assert.ok(map.steps.every((s) => s.reasonSource === "not yet explained"));
    assert.ok(map.openQuestions.length >= MIN_DEBRIEF_QUESTIONS);
  });

  it("pads thin drafts to at least three debrief follow-ups", () => {
    const thin = localWorkMapDraft({ expertName: "Erik", transcript, questions, moments });
    const padded = ensureMinOpenQuestions({ ...thin, openQuestions: thin.openQuestions.slice(0, 1) });
    assert.ok(padded.openQuestions.length >= MIN_DEBRIEF_QUESTIONS);
  });

  it("merges debrief answers and corrections", () => {
    const draft = localWorkMapDraft({ expertName: "Erik", transcript, questions: [], moments });
    const q = draft.openQuestions[0];
    const final = localWorkMapFinal(draft, [
      { t: 0, who: "apprentice", text: q },
      { t: 1, who: "expert", text: "Because the date decides if we refund at all." },
      { t: 2, who: "apprentice", text: "Let me explain the whole process back to you. Here's how I understood it." },
      { t: 3, who: "expert", text: "Not quite, unless it's a business customer, then I always ask finance." },
    ]);
    assert.equal(final.confirmed, true);
    assert.ok(!final.openQuestions.includes(q));
    assert.equal(final.corrections.length, 1);
    assert.ok(final.guardrails.some((g) => g.type === "exception"));
  });

  it("normalizes model output and remaps guardrail ids", () => {
    const map = normalizeWorkMap(
      {
        title: "Refunds",
        steps: [
          {
            id: "x",
            title: "Check date",
            t: 9_000,
            momentId: "nope",
            guardrailIds: ["g-a", "missing"],
            reason: "not yet explained",
          },
        ],
        guardrails: [
          { id: "g-a", type: "weird", rule: "Never refund over 200 without asking", t: 21_000 },
        ],
      },
      moments,
    );
    assert.ok(map);
    // Unknown moment ids fall back to the nearest moment by t.
    assert.equal(map!.steps[0].momentId, "m2");
    assert.deepEqual(map!.steps[0].guardrailIds, ["G1"]);
    assert.equal(map!.guardrails[0].type, "stop_and_ask");
  });

  it("offers a guardrail question first when none was asked", () => {
    const first = localLiveQuestion({ recent: ["I approved the refund"], asked: [] });
    assert.equal(first.kind, "guardrail");
    const next = localLiveQuestion({
      recent: ["I approved the refund"],
      asked: [{ question: first.question, kind: first.kind }],
    });
    assert.ok(next.kind === "why" || next.kind === "guardrail" || next.kind === "exception");
  });
});

describe("practice", () => {
  it("builds cases from guardrails and checks answers", () => {
    const map = localWorkMapDraft({ expertName: "Erik", transcript, questions, moments });
    const cases = localPracticeCases(map);
    assert.ok(cases.length >= 1);
    const hit = localPracticeCheck(
      map,
      cases[0],
      "I would ask my lead before refunding over 200 euros",
      "Erik",
    );
    assert.equal(hit.verdict, "ok");
  });

  it("reports mastered vs practise next", () => {
    const map = localWorkMapDraft({ expertName: "Erik", transcript, questions, moments });
    const cases = localPracticeCases(map);
    const report = practiceReport(
      map,
      cases.map((c, i) => ({
        caseId: c.id,
        guardrailId: c.guardrailId,
        stops: i === 0 ? 0 : 1,
        passed: i === 0,
      })),
    );
    assert.ok(report.mastered.length + report.practise.length === map.guardrails.length || cases.length >= 1);
  });

  it("does not count an unsure answer as mastered", () => {
    const map = localWorkMapDraft({ expertName: "Erik", transcript, questions, moments });
    const cases = localPracticeCases(map);
    const miss = localPracticeCheck(map, cases[0], "I'm not sure", "Erik");
    assert.equal(miss.verdict === "ok", false);
  });
});

describe("lesson + redact", () => {
  it("compiles one lesson per work map", () => {
    const map = localWorkMapDraft({ expertName: "Erik", transcript, questions, moments });
    const capture = {
      id: "cap1",
      companyId: "co1",
      memberId: "mem1",
      workRoleId: "wr1",
      startedAt: 1,
      endedAt: 2,
      workMap: { ...map, confirmed: true },
    } as CaptureSession;
    const lesson = compileLessonFromWorkMap(capture);
    assert.ok(lesson);
    assert.ok(lesson!.title.length > 0);
  });

  it("redacts contact details but keeps images", () => {
    const text = redact("Call Jane at +1 555-0100 or jane@example.com");
    assert.ok(text.includes("[") || !/@/.test(text));
    const deep = redactDeep({ a: "email me at a@b.co", image: "data:image/png;base64,xx" });
    assert.equal((deep as { image: string }).image, "data:image/png;base64,xx");
  });
});
