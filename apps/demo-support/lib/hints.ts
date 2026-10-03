import type { LessonId } from "./types";

export function tipChips(lesson: LessonId | null, expert: string): string[] {
  if (lesson === "friday") {
    return [
      `Suggested is close-with-macro — ${expert} would document the competitor`,
      "Escalate or snooze — do not Close",
      "Save stays locked until the conflict clears",
    ];
  }
  if (lesson === "alpine") {
    return [
      "Suggested is a standard close on a second cancel mention",
      `${expert} escalates before Close`,
      "The form will accept Close — the rule will not",
    ];
  }
  if (lesson === "cold") {
    return [
      "Suggested closes without the renewal timeline",
      "Open the timeline, then use a renewal-aware reply",
      `${expert} never skips the ritual inside 30 days`,
    ];
  }
  if (lesson === "combined") {
    return [
      "Unseen ticket. Two rules. Tutor stays quiet if you have it.",
      "Watch competitor notes and second cancel mentions",
    ];
  }
  return [];
}

export function proofChainLabel(phase: string) {
  if (phase === "capture") return "Suggested → departure → voice → map";
  if (phase === "teach") return "Hint on the desk · voice when you need it";
  if (phase === "agent") return "With the map, the gate stops the bad Close";
  if (phase === "map" || phase === "roadmap") return "Confirmed rules · competence is a clean save";
  return "Voice in · sparse hints · stays out of the way";
}
