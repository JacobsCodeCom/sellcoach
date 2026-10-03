import type { LessonId } from "./types";

export function tipChips(lesson: LessonId | null, expert: string): string[] {
  if (lesson === "friday") {
    return [
      `Suggested is Friday — ${expert} would not take it`,
      "Pick Thursday or Monday instead",
      "Save stays locked until the conflict clears",
    ];
  }
  if (lesson === "alpine") {
    return [
      "Suggested is one driver on a heavy Alpine lane",
      `${expert} adds a second driver before Assign`,
      "The form will accept one — the rule will not",
    ];
  }
  if (lesson === "cold") {
    return [
      "Suggested is the dry van that makes the window",
      "Hold or escalate — do not assign cold chain dry",
      `${expert} stops and asks the planner`,
    ];
  }
  if (lesson === "combined") {
    return [
      "Unseen ticket. Two rules. Tutor stays quiet if you have it.",
      "Watch Friday Nordwerk and Alpine weight",
    ];
  }
  return [];
}

export function proofChainLabel(phase: string) {
  if (phase === "capture") return "Suggested → departure → voice → map";
  if (phase === "teach") return "Hint on the desk · voice when you need it";
  if (phase === "agent") return "With the map, the gate stops the bad Assign";
  if (phase === "map" || phase === "roadmap") return "Confirmed rules · competence is a clean save";
  return "Voice in · sparse hints · stays out of the way";
}
