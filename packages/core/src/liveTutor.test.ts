import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  learnerAsksForHelp,
  learnerClaimsStepDone,
  localLiveTutor,
  normalizeLiveTutorAction,
  sanitizeLiveTutorAction,
} from "./liveTutor";
import type { WorkMap } from "./types";

const map: WorkMap = {
  title: "Code an invoice",
  steps: [
    {
      id: "S1",
      title: "Open the equipment invoice",
      t: 1000,
      momentId: "m1",
      screen: "INV-7200 open",
      decision: "Opened INV-7200",
      isJudgmentCall: false,
      reason: "",
      reasonSource: "",
      guardrailIds: [],
    },
    {
      id: "S2",
      title: "Code to capex",
      t: 5000,
      momentId: "m2",
      screen: "cost center field",
      decision: "Re-coded to 0400 capex",
      isJudgmentCall: true,
      reason: "Equipment over 5000 euros is always capex.",
      reasonSource: "live",
      guardrailIds: ["G1"],
    },
  ],
  guardrails: [
    {
      id: "G1",
      type: "limit",
      rule: "Equipment over €5,000 must be capex with an asset number.",
      quote: "Equipment over 5000 euros is always capex.",
      t: 5000,
      momentId: "m2",
    },
  ],
  openQuestions: [],
  teachBack: "Code equipment over 5k to capex.",
  confirmed: true,
  corrections: [],
};

describe("localLiveTutor", () => {
  it("guides the current step before predicting", () => {
    const out = localLiveTutor({
      expertFirst: "Sabine",
      learnerFirst: "Lena",
      map,
      stepIndex: 1,
      guidedThisStep: false,
      awaitingPredict: false,
      screenChanged: false,
      elapsedMs: 5_000,
    });
    assert.equal(out.action, "guide");
    assert.match(out.speak, /capex/i);
    assert.equal(out.stepId, "S2");
    assert.equal(out.requestHighlight, false);
  });

  it("intervenes when the answer misses the guardrail", () => {
    const out = localLiveTutor({
      expertFirst: "Sabine",
      learnerFirst: "Lena",
      map,
      stepIndex: 1,
      guidedThisStep: true,
      awaitingPredict: true,
      learnerSaid: "I would just post it on Suggested opex to finish faster",
      screenChanged: true,
      elapsedMs: 20_000,
    });
    assert.equal(out.action, "intervene");
    assert.match(out.speak, /would stop here/i);
    assert.equal(out.guardrailId, "G1");
    assert.equal(out.replayMomentId, "m2");
  });

  it("advances when the answer matches the expert", () => {
    const out = localLiveTutor({
      expertFirst: "Sabine",
      learnerFirst: "Lena",
      map,
      stepIndex: 0,
      guidedThisStep: true,
      awaitingPredict: true,
      learnerSaid: "I opened INV-7200 and look at the equipment line",
      screenChanged: false,
      elapsedMs: 12_000,
    });
    assert.equal(out.action, "advance");
    assert.equal(out.stepIndex, 1);
  });

  it("advances when the learner says they are already past the step", () => {
    assert.equal(
      learnerClaimsStepDone("I'm already signed in", "Sign into the admin portal", "Signed into the system using credentials"),
      true,
    );
    const loginMap: WorkMap = {
      ...map,
      steps: [
        {
          id: "L1",
          title: "Sign into the admin portal",
          t: 0,
          momentId: "m1",
          screen: "Sign in page",
          decision: "Signed into the system using credentials",
          isJudgmentCall: false,
          reason: "",
          reasonSource: "",
          guardrailIds: [],
        },
        map.steps[1],
      ],
    };
    const out = localLiveTutor({
      expertFirst: "Jacob",
      learnerFirst: "Lena",
      map: loginMap,
      stepIndex: 0,
      guidedThisStep: true,
      awaitingPredict: true,
      learnerSaid: "I am already signed in",
      screenChanged: false,
      elapsedMs: 8_000,
    });
    assert.equal(out.action, "advance");
    assert.match(out.speak, /Next/i);
  });

  it("answers where-to-click without advancing", () => {
    assert.equal(learnerAsksForHelp("where do I click?"), true);
    const out = localLiveTutor({
      expertFirst: "Jacob",
      learnerFirst: "Lena",
      map,
      stepIndex: 0,
      guidedThisStep: true,
      awaitingPredict: true,
      learnerSaid: "where do I click?",
      screenChanged: false,
      elapsedMs: 8_000,
    });
    assert.equal(out.action, "guide");
    assert.match(out.speak, /look for|INV-7200|Opened/i);
    assert.equal(out.stepIndex, 0);
    assert.equal(out.requestHighlight, true);
  });

  it("forceHint returns a sharper guide with replay moment", () => {
    const out = localLiveTutor({
      expertFirst: "Jacob",
      learnerFirst: "Lena",
      map,
      stepIndex: 0,
      guidedThisStep: true,
      awaitingPredict: true,
      forceHint: true,
      screenChanged: false,
      elapsedMs: 30_000,
      quietMs: 30_000,
    });
    assert.equal(out.action, "guide");
    assert.match(out.speak, /Hint|Find this|INV-7200/i);
    assert.equal(out.replayMomentId, "m1");
    assert.equal(out.stepIndex, 0);
    assert.equal(out.requestHighlight, false);
  });

  it("explicit Need a hint requests an on-page highlight", () => {
    const out = localLiveTutor({
      expertFirst: "Jacob",
      learnerFirst: "Lena",
      map,
      stepIndex: 0,
      guidedThisStep: true,
      awaitingPredict: true,
      forceHint: true,
      explicitHint: true,
      screenChanged: false,
      elapsedMs: 30_000,
      quietMs: 30_000,
    });
    assert.equal(out.action, "guide");
    assert.equal(out.requestHighlight, true);
    assert.equal(out.replayMomentId, "m1");
  });

  it("proactive stuck guide after long quiet", () => {
    const out = localLiveTutor({
      expertFirst: "Jacob",
      learnerFirst: "Lena",
      map,
      stepIndex: 0,
      guidedThisStep: true,
      awaitingPredict: true,
      screenChanged: false,
      elapsedMs: 40_000,
      quietMs: 30_000,
    });
    assert.equal(out.action, "guide");
    assert.match(out.speak, /Hint|Find this/i);
    assert.equal(out.replayMomentId, "m1");
    assert.equal(out.requestHighlight, false);
  });

  it("stays quiet on screen change when already awaiting speech", () => {
    const out = localLiveTutor({
      expertFirst: "Jacob",
      learnerFirst: "Lena",
      map,
      stepIndex: 0,
      guidedThisStep: true,
      awaitingPredict: true,
      screenChanged: true,
      elapsedMs: 8_000,
    });
    assert.equal(out.action, "skip");
    assert.equal(out.speak, "");
  });

  it("asks once on screen change before awaiting speech", () => {
    const out = localLiveTutor({
      expertFirst: "Jacob",
      learnerFirst: "Lena",
      map,
      stepIndex: 0,
      guidedThisStep: true,
      awaitingPredict: false,
      screenChanged: true,
      elapsedMs: 8_000,
    });
    assert.equal(out.action, "predict");
    assert.match(out.speak, /finished|where to click/i);
  });
});

describe("sanitizeLiveTutorAction", () => {
  it("blocks premature done without learner speech", () => {
    const raw = {
      action: "done" as const,
      speak: "Congratulations, you're done!",
      stepIndex: 0,
      guardrailId: null,
      stepId: "S1",
      replayMomentId: null,
      explain: "",
      requestHighlight: false,
    };
    const out = sanitizeLiveTutorAction(raw, map, 0, false);
    assert.equal(out.action, "skip");
    assert.equal(out.speak, "");
    assert.equal(out.requestHighlight, false);
  });

  it("blocks vision-only advance without learner speech", () => {
    const raw = {
      action: "advance" as const,
      speak: "Next step",
      stepIndex: 1,
      guardrailId: null,
      stepId: "S1",
      replayMomentId: null,
      explain: "",
      requestHighlight: false,
    };
    const out = sanitizeLiveTutorAction(raw, map, 0, false);
    assert.equal(out.action, "skip");
  });
});

describe("normalizeLiveTutorAction", () => {
  it("rejects malformed payloads", () => {
    assert.equal(normalizeLiveTutorAction({ action: "guide" }, map, 0), null);
  });

  it("fills intervene replay from the step moment", () => {
    const out = normalizeLiveTutorAction(
      {
        action: "intervene",
        speak: "Sabine would stop here. Why do you think?",
        stepIndex: 1,
        stepId: "S2",
        guardrailId: "G1",
        explain: "Always capex.",
      },
      map,
      1,
    );
    assert.ok(out);
    assert.equal(out.replayMomentId, "m2");
  });
});
