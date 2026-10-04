import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localDryRunPlan, normalizeActionIntents } from "./agentPlan";
import type { WorkMap } from "./types";

const map: WorkMap = {
  title: "Invoice exceptions",
  steps: [
    {
      id: "S1",
      title: "Open exception queue",
      t: 0,
      momentId: null,
      screen: "Queue list",
      decision: "Open the oldest flagged invoice",
      isJudgmentCall: false,
      reason: "",
      reasonSource: "",
      guardrailIds: [],
    },
    {
      id: "S2",
      title: "Decide approval",
      t: 1,
      momentId: null,
      screen: "Invoice detail",
      decision: "Approve only under the limit",
      isJudgmentCall: true,
      reason: "Over $5k needs a manager",
      reasonSource: "expert",
      guardrailIds: ["G1"],
    },
  ],
  guardrails: [
    {
      id: "G1",
      type: "stop_and_ask",
      rule: "Ask a manager over $5k",
      quote: "Anything over five thousand I ping Sara",
      t: 1,
      momentId: null,
    },
  ],
  openQuestions: [],
  teachBack: "",
  confirmed: true,
  corrections: [],
};

describe("agentPlan", () => {
  it("builds a local dry-run with act/decide and ask_human for stop_and_ask", () => {
    const { summary, intents } = localDryRunPlan(map, {
      notes: "Be careful with duplicates",
      extraGuardrails: ["Never email the vendor directly"],
      context: "Invoice is $6,200",
    });
    assert.match(summary, /Invoice exceptions/);
    assert.ok(intents.some((i) => i.kind === "act" && i.workMapStepId === "S1"));
    assert.ok(intents.some((i) => i.kind === "decide" && i.workMapStepId === "S2"));
    assert.ok(intents.some((i) => i.kind === "ask_human" && i.guardrailIds.includes("G1")));
    assert.ok(intents.some((i) => i.kind === "stop" && i.title.includes("Never email")));
  });

  it("normalizes model intents and drops unknown ids", () => {
    const intents = normalizeActionIntents(
      [
        {
          kind: "act",
          title: "Open queue",
          detail: "Click the oldest row",
          workMapStepId: "S1",
          guardrailIds: ["G1", "nope"],
        },
        { kind: "explode", title: "Bad" },
        { kind: "decide", title: "", detail: "empty title" },
        { kind: "observe", title: "Look", workMapStepId: "missing", guardrailIds: [] },
      ],
      map,
    );
    assert.equal(intents.length, 2);
    assert.equal(intents[0].workMapStepId, "S1");
    assert.deepEqual(intents[0].guardrailIds, ["G1"]);
    assert.equal(intents[1].workMapStepId, null);
  });
});
