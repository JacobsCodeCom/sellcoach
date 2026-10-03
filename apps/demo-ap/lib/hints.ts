import type { LessonId } from "./types";

export function tipChips(lesson: LessonId | null, expert: string): string[] {
  if (lesson === "friday") {
    return [
      `Suggested is pay this week — ${expert} would hold Vogel`,
      "Use Hold, not Post",
      "Save stays locked until the conflict clears",
    ];
  }
  if (lesson === "alpine") {
    return [
      "Suggested is opex with no asset number",
      `${expert} codes 0400 · Capex and attaches the asset number`,
      "The form will accept opex — the rule will not",
    ];
  }
  if (lesson === "cold") {
    return [
      "Suggested posts the Czech subsidiary now",
      "Hold or send for 2nd approval — do not post",
      `${expert} stops and asks the controller`,
    ];
  }
  if (lesson === "combined") {
    return [
      "Unseen invoice. Two rules. Tutor stays quiet if you have it.",
      "Watch Vogel December and capex over €5,000",
    ];
  }
  return [];
}

export function proofChainLabel(phase: string) {
  if (phase === "capture") return "Suggested → departure → voice → map";
  if (phase === "teach") return "Hint on the desk · voice when you need it";
  if (phase === "agent") return "With the map, the gate stops the bad Post";
  if (phase === "map" || phase === "roadmap") return "Confirmed rules · competence is a clean save";
  return "Voice in · sparse hints · stays out of the way";
}
