import type { LessonId, LessonMode, RoadmapCard, WorkMap } from "./types";
import { FALLBACK } from "./rules";

export function lessonTitle(id: LessonId) {
  if (id === "alpine") return "Churn-risk escalation";
  if (id === "cold") return "Renewal prep ritual";
  if (id === "friday") return "Competitor notes";
  return "Combined queue";
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
      title: "Churn-risk escalation",
      quote: alpine,
      bait: "A calm-looking ticket with a second cancel mention this week.",
      locked: !byId["alpine-weight"],
      exam: false,
    },
    {
      id: "cold",
      kicker: "Stop and ask",
      title: "Renewal prep ritual",
      quote: cold,
      bait: "A usage question with renewal inside 30 days.",
      locked: !byId["cold-chain"],
      exam: false,
    },
    {
      id: "friday",
      kicker: "Exception",
      title: "Competitor notes",
      quote: friday,
      bait: "A thread that names CompetitorX with a close-macro suggestion.",
      locked: !byId["friday-nordwerk"],
      exam: false,
    },
    {
      id: "combined",
      kicker: "Competence",
      title: "Combined queue",
      quote: `${friday} ${alpine}`,
      bait: "Competitor named plus a second cancel cue on one unseen ticket.",
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
    return `${expert} would not close that competitor thread with a macro. What would you do?`;
  }
  if (lesson === "alpine") {
    return `Suggested is a standard close. What would ${expert} change?`;
  }
  if (lesson === "cold") {
    return `Renewal is inside 30 days. Would you close without the timeline?`;
  }
  return "";
}

export function tryBrief(lesson: LessonId) {
  if (lesson === "combined") {
    return "Unseen ticket. Two rules. If you have it, the tutor stays quiet.";
  }
  return "A fresh ticket. The assist has a suggestion. Save what you would defend.";
}
