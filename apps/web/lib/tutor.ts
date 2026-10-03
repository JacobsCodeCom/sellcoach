export type TutorMessage = { role: "user" | "assistant"; content: string };

export type TutorRequest = {
  learnerName: string;
  expertName?: string;
  lesson: { title: string; summary: string; prompt: string; passCriteria: string };
  messages: TutorMessage[];
};

export type TutorReply = { message: string; passed: boolean };

const STOP = new Set(
  "the a an and or to of in on for at by with is are be it this that when what you your they them if then do does not".split(
    " ",
  ),
);

function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w)),
    ),
  ];
}

/** No-model tutor: intro, then pass when the explanation overlaps the pass criteria. */
export function localTutorReply(input: TutorRequest): TutorReply {
  const first = input.learnerName.split(/\s+/)[0] || "there";
  const from = input.expertName ? `${input.expertName} taught this one` : "This comes from a senior colleague";
  const learnerTurns = input.messages.filter((m) => m.role === "user");
  const last = learnerTurns.at(-1)?.content.trim() ?? "";

  if (!last) {
    return {
      message: `Hi ${first}. ${from}: ${input.lesson.summary || input.lesson.title}. In your own words, when does this apply and what do you do?`,
      passed: false,
    };
  }

  if (/\?\s*$/.test(last)) {
    return {
      message: `Good question. The rule is: ${input.lesson.passCriteria || input.lesson.summary}. Now try saying it back.`,
      passed: false,
    };
  }

  const target = keywords(`${input.lesson.passCriteria} ${input.lesson.summary}`);
  const said = new Set(keywords(last));
  const hits = target.filter((w) => said.has(w)).length;
  const enough = last.split(/\s+/).length >= 6 && (hits >= 2 || hits / Math.max(target.length, 1) >= 0.25);

  if (enough) {
    return { message: `That's it, ${first}. Lesson done.`, passed: true };
  }
  return {
    message:
      learnerTurns.length >= 2
        ? `Close. Hint: ${input.lesson.passCriteria || input.lesson.summary}. Say it once more in your words.`
        : "Almost. Say when it applies, and what you do then.",
    passed: false,
  };
}
