import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tipChipsForLesson } from "./hints";
import { normalizeTranscriptLines, ruleLabelFromAnswer } from "./transcript";

describe("normalizeTranscriptLines", () => {
  it("splits sentences and drops noise", () => {
    const lines = normalizeTranscriptLines([
      "um",
      "Escalate if they mention cancellation twice. Same-day recap after a failed call.",
    ]);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /Escalate/i);
    assert.match(lines[1]!, /Same-day/i);
  });

  it("dedupes near duplicates", () => {
    const lines = normalizeTranscriptLines([
      "Always send a recap with three next steps after the call",
      "Always send a recap with three next steps after the call today",
    ]);
    assert.equal(lines.length, 1);
  });
});

describe("ruleLabelFromAnswer", () => {
  it("takes the first clause", () => {
    assert.equal(
      ruleLabelFromAnswer("Escalate churn risk: call the manager same day."),
      "Escalate churn risk",
    );
  });
});

describe("tipChipsForLesson", () => {
  it("builds chips from lesson fields", () => {
    const chips = tipChipsForLesson({
      title: "Churn escalation",
      summary: "Escalate on repeat cancel talk",
      passCriteria: "Escalate if cancellation is mentioned twice in one week",
    });
    assert.match(chips[0]!, /Churn escalation/);
    assert.ok(chips.length >= 2);
  });
});
