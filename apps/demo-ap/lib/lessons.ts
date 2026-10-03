import type { LessonId, LessonMode, RoadmapCard, WorkMap } from "./types";
import { FALLBACK } from "./rules";

export function lessonTitle(id: LessonId) {
  if (id === "alpine") return "Capex vs opex";
  if (id === "cold") return "Czech subsidiary";
  if (id === "friday") return "December holds";
  return "Combined close";
}

export function lessonBeat(mode: LessonMode) {
  if (mode === "show") {
    return {
      kicker: "Lesson started",
      mark: "Show",
      lead: "Watch how the desk is supposed to move. Don’t click yet.",
    };
  }
  if (mode === "hint") {
    return {
      kicker: "Hint",
      mark: "Hint",
      lead: "One cue before you take the board.",
    };
  }
  if (mode === "try") {
    return {
      kicker: "Your turn",
      mark: "Try",
      lead: "The board is yours. Save what you would defend.",
    };
  }
  return {
    kicker: "Lesson ended",
    mark: "Done",
    lead: "This beat is closed. Return to the roadmap when ready.",
  };
}

export function compileRoadmap(map: WorkMap): RoadmapCard[] {
  const byId = Object.fromEntries(map.guardrails.map((item) => [item.id, item]));
  const alpine = byId["alpine-weight"]?.expertWords || FALLBACK["alpine-weight"];
  const cold = byId["cold-chain"]?.expertWords || FALLBACK["cold-chain"];
  const friday = byId["friday-nordwerk"]?.expertWords || FALLBACK["friday-nordwerk"];
  const confirmed = map.guardrails.length >= 3;
  return [
    {
      id: "alpine",
      kicker: "Limit",
      title: "Capex vs opex",
      quote: alpine,
      bait: "A €7,200 equipment invoice where Suggested is still opex.",
      locked: !byId["alpine-weight"],
      exam: false,
    },
    {
      id: "cold",
      kicker: "Stop and ask",
      title: "Czech subsidiary",
      quote: cold,
      bait: "A subsidiary invoice Suggested wants to post now.",
      locked: !byId["cold-chain"],
      exam: false,
    },
    {
      id: "friday",
      kicker: "Exception",
      title: "December holds",
      quote: friday,
      bait: "Vogel in December with a pay-this-week suggestion.",
      locked: !byId["friday-nordwerk"],
      exam: false,
    },
    {
      id: "combined",
      kicker: "Competence",
      title: "Combined close",
      quote: `${friday} ${alpine}`,
      bait: "Vogel December plus equipment over €5,000 on one unseen invoice.",
      locked: !confirmed,
      exam: true,
    },
  ];
}

export function quoteFor(map: WorkMap | null, lesson: LessonId) {
  if (!map) {
    if (lesson === "alpine") return FALLBACK["alpine-weight"];
    if (lesson === "cold") return FALLBACK["cold-chain"];
    return FALLBACK["friday-nordwerk"];
  }
  const card = compileRoadmap(map).find((item) => item.id === lesson);
  return card?.quote || FALLBACK["friday-nordwerk"];
}

export function hintFor(lesson: LessonId, expert: string) {
  if (lesson === "friday") {
    return `${expert} would not pay Vogel this week. What would you do?`;
  }
  if (lesson === "alpine") {
    return `Suggested is opex. What would ${expert} change before posting?`;
  }
  if (lesson === "cold") {
    return `Suggested posts now. Would you take it?`;
  }
  return "";
}

export function tryBrief(lesson: LessonId) {
  if (lesson === "combined") {
    return "Unseen invoice. Two rules. If you have it, the tutor stays quiet.";
  }
  return "A fresh invoice. The assist has a suggestion. Save what you would defend.";
}
