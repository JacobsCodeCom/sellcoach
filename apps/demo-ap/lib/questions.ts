import { departureFrom, suggestedFor, type Departure } from "./suggest";
import type { Decision, Draft, Load, Truck } from "./types";

export type CaptureQuestion = {
  id: string;
  guardrail: boolean;
  because: string;
  text: string;
  departure: string;
  priority: number;
  deferred?: boolean;
};

type AskState = {
  loads: Load[];
  trucks: Truck[];
  openId: string | null;
  draft: Draft;
  done: Decision[];
  asked: string[];
};

const LIVE_CAP = 2;

function centerName(trucks: Truck[], id: string | null) {
  return trucks.find((item) => item.id === id)?.name ?? "that code";
}

function saved(state: AskState, loadId: string) {
  return state.done.find((item) => item.loadId === loadId);
}

function departuresFor(state: AskState): Departure[] {
  const found: Departure[] = [];
  for (const load of state.loads) {
    const decision = saved(state, load.id);
    const onIt = state.openId === load.id;
    if (!decision && !onIt) continue;
    const draft: Draft = onIt
      ? state.draft
      : {
          truckId: decision!.truckId,
          drivers: decision!.drivers,
          action: decision!.action,
          note: decision!.note,
        };
    if (!draft.truckId && !draft.action) continue;
    const suggestion = suggestedFor(load, state.trucks);
    const departure = departureFrom(load, draft, state.trucks, suggestion);
    if (departure) found.push(departure);
  }
  return found.sort((a, b) => a.priority - b.priority);
}

function questionFor(state: AskState, departure: Departure): CaptureQuestion | null {
  const load = state.loads.find((item) => item.id === departure.loadId);
  if (!load) return null;
  const suggestion = suggestedFor(load, state.trucks);
  const suggestedName = suggestion
    ? centerName(state.trucks, suggestion.truckId)
    : departure.suggested;
  const amount = `€${load.weightT.toLocaleString("en-US")}`;

  if (departure.questionId === "lane-score") {
    return {
      id: "lane-score",
      guardrail: false,
      priority: departure.priority,
      departure: departure.summary,
      because: `Departure from Suggested (${suggestedName}). The ERP shows the coding, not the reason.`,
      text: `You left Suggested (${suggestedName}) for ${departure.chosen} on ${load.customer}. What made you do that?`,
    };
  }

  if (departure.questionId === "alpine-limit") {
    return {
      id: "alpine-limit",
      guardrail: true,
      priority: departure.priority,
      departure: departure.summary,
      because: `Departure from Suggested opex / no asset. The form accepts opex.`,
      text: `You moved the ${amount} equipment invoice toward capex / an asset number. Suggested was opex. What made you do that?`,
    };
  }

  if (departure.questionId === "friday-nordwerk") {
    return {
      id: "friday-nordwerk",
      guardrail: true,
      priority: departure.priority,
      departure: departure.summary,
      deferred: true,
      because: `Departure from Suggested pay-this-week. Held for debrief so capex and coding can be asked live.`,
      text: `You held Vogel instead of paying this week, even though Suggested said pay. Why?`,
    };
  }

  if (departure.questionId === "cold-stop") {
    return {
      id: "cold-stop",
      guardrail: true,
      priority: departure.priority,
      departure: departure.summary,
      because: "Departure from Suggested post-now on a Czech subsidiary invoice.",
      text: `You ${departure.chosen === "escalate" ? "sent for second approval" : departure.chosen} the Czech subsidiary invoice instead of posting. When do you stop and ask?`,
    };
  }

  return {
    id: departure.questionId,
    guardrail: departure.guardrail,
    priority: departure.priority,
    departure: departure.summary,
    because: `Departure from Suggested: ${departure.summary}`,
    text: `You left the Suggested path on ${load.customer}. Why?`,
  };
}

export function pendingDepartures(state: AskState): CaptureQuestion[] {
  return departuresFor(state)
    .map((item) => questionFor(state, item))
    .filter((item): item is CaptureQuestion => Boolean(item))
    .filter((item) => !state.asked.includes(item.id));
}

export function nextCaptureQuestion(state: AskState): CaptureQuestion | null {
  const pending = pendingDepartures(state);
  const liveAsked = state.asked.filter((id) => id !== "friday-nordwerk").length;
  const open = state.loads.find((item) => item.id === state.openId) ?? null;

  const live = pending.filter((item) => !item.deferred);
  const preferred = open
    ? live.find((item) => {
        if (item.id === "lane-score") return open.penaltyWindow;
        if (item.id === "alpine-limit") return open.alpine;
        return item.id.includes(open.id);
      })
    : null;

  const next = preferred ?? live[0] ?? null;
  if (!next) return null;
  if (liveAsked >= LIVE_CAP && !next.guardrail) return null;
  if (liveAsked >= LIVE_CAP && next.id === "lane-score") return null;
  return next;
}

export function deferredQuestions(state: AskState): CaptureQuestion[] {
  return pendingDepartures(state).filter((item) => item.deferred);
}
