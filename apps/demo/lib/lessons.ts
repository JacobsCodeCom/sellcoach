import type { LessonId, LessonMode, RoadmapCard, WorkMap } from "./types";
import { FALLBACK } from "./rules";

export function lessonTitle(id: LessonId) {
  if (id === "alpine") return "Alpine weight";
  if (id === "cold") return "Cold chain";
  if (id === "friday") return "Customer exceptions";
  return "Combined shift";
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
      title: "Alpine weight",
      quote: alpine,
      bait: "A heavy Alpine load where one driver looks like enough.",
      locked: !byId["alpine-weight"],
      exam: false,
    },
    {
      id: "cold",
      kicker: "Stop and ask",
      title: "Cold chain",
      quote: cold,
      bait: "The only truck with capacity today is a dry van.",
      locked: !byId["cold-chain"],
      exam: false,
    },
    {
      id: "friday",
      kicker: "Exception",
      title: "Customer exceptions",
      quote: friday,
      bait: "Nordwerk, Friday, and a truck that wins on rate and lane score.",
      locked: !byId["friday-nordwerk"],
      exam: false,
    },
    {
      id: "combined",
      kicker: "Competence",
      title: "Combined shift",
      quote: `${friday} ${alpine}`,
      bait: "Friday Nordwerk and Alpine weight, on one unseen ticket.",
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
    return `${expert} would not take that Friday truck. What would you do?`;
  }
  if (lesson === "alpine") {
    return `The form will take one driver. What would ${expert} change?`;
  }
  if (lesson === "cold") {
    return `That dry van makes the window. Would you take it?`;
  }
  return "";
}

export function tryBrief(lesson: LessonId) {
  if (lesson === "combined") {
    return "Unseen ticket. Two rules. If you have it, the tutor stays quiet.";
  }
  return "A fresh ticket. The assist has a suggestion. Save what you would defend.";
}
