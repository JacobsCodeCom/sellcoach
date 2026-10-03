import type { Lesson } from "./types";

/** Tip chips for a compiled lesson — domain-agnostic, from stored fields only. */
export function tipChipsForLesson(lesson: Pick<Lesson, "title" | "summary" | "passCriteria">): string[] {
  const chips: string[] = [];
  const title = lesson.title.trim();
  const pass = lesson.passCriteria.trim();
  const summary = lesson.summary.trim();

  if (title) chips.push(`Rule: ${title}`);
  if (pass && pass !== title) {
    chips.push(pass.length > 90 ? `${pass.slice(0, 87)}…` : pass);
  }
  if (summary && summary !== pass && summary !== title) {
    chips.push(summary.length > 90 ? `${summary.slice(0, 87)}…` : summary);
  }
  if (chips.length < 2) {
    chips.push("Say when it applies and what you do next");
  }
  return chips.slice(0, 4);
}

export function coachIntroForLesson(lesson: Pick<Lesson, "title" | "passCriteria">): string {
  return `Lesson: ${lesson.title}. Pass when you can explain: ${lesson.passCriteria}`;
}
