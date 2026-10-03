import type { Board, Load, Truck } from "./types";

/** Reply paths: type dry = standard close, reefer = renewal-aware. driversAvailable: 1 = timeline closed, 2 = opened. */
const capturePaths: Truck[] = [
  {
    id: "RP-STD",
    name: "Standard close",
    type: "dry",
    capacityT: 99999,
    base: "Macros",
    rateEur: 0,
    laneScore: 40,
    day: "Wednesday",
    driversAvailable: 2,
    available: true,
    closest: true,
  },
  {
    id: "RP-RENEW",
    name: "Renewal-aware reply",
    type: "reefer",
    capacityT: 99999,
    base: "Account desk",
    rateEur: 0,
    laneScore: 90,
    day: "Wednesday",
    driversAvailable: 2,
    available: true,
  },
  {
    id: "RP-HEALTH",
    name: "Health-check reply",
    type: "dry",
    capacityT: 99999,
    base: "CS playbook",
    rateEur: 0,
    laneScore: 88,
    day: "Wednesday",
    driversAvailable: 2,
    available: true,
  },
  {
    id: "RP-CLOSE",
    name: "Close with macro",
    type: "dry",
    capacityT: 99999,
    base: "Macros",
    rateEur: 0,
    laneScore: 96,
    day: "Friday",
    driversAvailable: 1,
    available: true,
  },
  {
    id: "RP-ESC",
    name: "Escalate to AM",
    type: "dry",
    capacityT: 99999,
    base: "Escalations",
    rateEur: 0,
    laneScore: 50,
    day: "Monday",
    driversAvailable: 1,
    available: true,
  },
];

/**
 * Ticket board.
 * alpine = second cancellation mention this week (churn).
 * cargo pharma = renewal within 30 days.
 * customer Competitor / Rival = named competitor in thread.
 * penaltyWindow = soft judgment leave Suggested macro.
 * drivers: 1 = renewal timeline closed, 2 = opened.
 */
const captureLoads: Load[] = [
  {
    id: "TKT-441",
    customer: "Brightfield Co",
    origin: "Billing question",
    destination: "CS inbox",
    weightT: 1,
    cargo: "general",
    day: "Wednesday",
    window: "SLA 4h",
    penaltyWindow: true,
    alpine: false,
    contact: "ops@brightfield.example",
    accept: "any",
    bait: {
      truckId: "RP-STD",
      drivers: 1,
      label: "Standard close · Suggested macro",
    },
  },
  {
    id: "TKT-448",
    customer: "Northwind Labs",
    origin: "“Cancel if this happens again” · 2nd this week",
    destination: "CS inbox",
    weightT: 2,
    cargo: "general",
    day: "Thursday",
    window: "SLA 2h",
    penaltyWindow: false,
    alpine: true,
    accept: "hold-or-escalate",
    bait: {
      truckId: "RP-STD",
      drivers: 1,
      label: "Standard close · Suggested",
    },
  },
  {
    id: "TKT-477",
    customer: "RivalSoft mentioned",
    origin: "Feature gap · named CompetitorX",
    destination: "CS inbox",
    weightT: 1,
    cargo: "general",
    day: "Friday",
    window: "SLA 8h",
    penaltyWindow: false,
    alpine: false,
    accept: "hold-or-escalate",
    bait: {
      truckId: "RP-CLOSE",
      drivers: 1,
      label: "Close with macro · Suggested",
    },
  },
];

export const captureBoard: Board = {
  id: "capture",
  loads: captureLoads,
  trucks: capturePaths,
  requiredIds: ["TKT-441", "TKT-448", "TKT-477"],
};

function path(
  partial: Pick<Truck, "id" | "name" | "day" | "type"> & Partial<Truck>,
): Truck {
  return {
    capacityT: 99999,
    base: "CS desk",
    rateEur: 0,
    laneScore: 70,
    driversAvailable: 2,
    available: true,
    ...partial,
  };
}

export function boardFor(lesson: string, beat: "show" | "try" | "agent"): Board | null {
  if (lesson === "friday" && beat === "show") {
    return {
      id: "competitor-show",
      requiredIds: [],
      loads: [
        {
          id: "CP-1",
          customer: "RivalSoft mentioned",
          origin: "Pricing ask · CompetitorX named",
          destination: "CS inbox",
          weightT: 1,
          cargo: "general",
          day: "Friday",
          window: "SLA 8h",
          penaltyWindow: false,
          alpine: false,
          accept: "hold-or-escalate",
          bait: {
            truckId: "CP-CLOSE",
            drivers: 1,
            label: "Close with macro · Suggested",
          },
        },
      ],
      trucks: [
        path({ id: "CP-CLOSE", name: "Close with macro", day: "Friday", type: "dry", laneScore: 95, closest: true }),
        path({ id: "CP-ESC", name: "Escalate to AM", day: "Monday", type: "dry", laneScore: 40 }),
      ],
    };
  }
  if (lesson === "friday" && beat === "try") {
    return {
      id: "competitor-try",
      requiredIds: ["CP-2"],
      loads: [
        {
          id: "CP-2",
          customer: "RivalSoft mentioned",
          origin: "Demo loss · CompetitorX named",
          destination: "CS inbox",
          weightT: 1,
          cargo: "general",
          day: "Friday",
          window: "SLA 4h",
          penaltyWindow: false,
          alpine: false,
          accept: "hold-or-escalate",
          bait: {
            truckId: "CP2-CLOSE",
            drivers: 1,
            label: "Close with macro · Suggested",
          },
        },
      ],
      trucks: [
        path({ id: "CP2-CLOSE", name: "Close with macro", day: "Friday", type: "dry", laneScore: 96, closest: true }),
        path({ id: "CP2-ESC", name: "Escalate to AM", day: "Monday", type: "dry", laneScore: 42 }),
      ],
    };
  }
  if (lesson === "alpine" && beat === "show") {
    return {
      id: "churn-show",
      requiredIds: [],
      loads: [
        {
          id: "CH-1",
          customer: "Harbor CRM",
          origin: "Second cancel mention this week",
          destination: "CS inbox",
          weightT: 2,
          cargo: "general",
          day: "Thursday",
          window: "SLA 2h",
          penaltyWindow: false,
          alpine: true,
          accept: "hold-or-escalate",
          bait: {
            truckId: "CH-STD",
            drivers: 1,
            label: "Standard close · Suggested",
          },
        },
      ],
      trucks: [
        path({ id: "CH-STD", name: "Standard close", day: "Thursday", type: "dry", laneScore: 40, closest: true }),
        path({ id: "CH-ESC", name: "Escalate to AM", day: "Thursday", type: "reefer", laneScore: 90 }),
      ],
    };
  }
  if (lesson === "alpine" && beat === "try") {
    return {
      id: "churn-try",
      requiredIds: ["CH-2"],
      loads: [
        {
          id: "CH-2",
          customer: "Pebble Systems",
          origin: "“We’re done if this slips again” · 2nd cancel cue",
          destination: "CS inbox",
          weightT: 2,
          cargo: "general",
          day: "Thursday",
          window: "SLA 2h",
          penaltyWindow: false,
          alpine: true,
          accept: "hold-or-escalate",
          bait: {
            truckId: "CH2-STD",
            drivers: 1,
            label: "Standard close · Suggested",
          },
        },
      ],
      trucks: [
        path({ id: "CH2-STD", name: "Standard close", day: "Thursday", type: "dry", laneScore: 38, closest: true }),
        path({ id: "CH2-ESC", name: "Escalate to AM", day: "Thursday", type: "reefer", laneScore: 92 }),
      ],
    };
  }
  if (lesson === "cold" && beat === "show") {
    return {
      id: "renewal-show",
      requiredIds: [],
      loads: [
        {
          id: "RN-1",
          customer: "Helios Media",
          origin: "Usage question · renewal in 18 days",
          destination: "CS inbox",
          weightT: 1,
          cargo: "pharma",
          tempLabel: "Renewal <30d",
          day: "Thursday",
          window: "SLA 4h",
          penaltyWindow: false,
          alpine: false,
          contact: "cs@helios.example",
          accept: "assign",
          correctTruckId: "RN-RENEW",
          correctDrivers: 2,
          bait: {
            truckId: "RN-STD",
            drivers: 1,
            label: "Standard close · Suggested",
          },
        },
      ],
      trucks: [
        path({ id: "RN-STD", name: "Standard close", day: "Thursday", type: "dry", laneScore: 88, closest: true }),
        path({ id: "RN-RENEW", name: "Renewal-aware reply", day: "Thursday", type: "reefer", laneScore: 90 }),
      ],
    };
  }
  if (lesson === "cold" && beat === "try") {
    return {
      id: "renewal-try",
      requiredIds: ["RN-2"],
      loads: [
        {
          id: "RN-2",
          customer: "Lumen Retail",
          origin: "Seat count · renewal in 12 days",
          destination: "CS inbox",
          weightT: 1,
          cargo: "pharma",
          tempLabel: "Renewal <30d",
          day: "Thursday",
          window: "SLA 4h",
          penaltyWindow: false,
          alpine: false,
          contact: "success@lumen.example",
          accept: "assign",
          correctTruckId: "RN2-RENEW",
          correctDrivers: 2,
          bait: {
            truckId: "RN2-STD",
            drivers: 1,
            label: "Standard close · Suggested",
          },
        },
      ],
      trucks: [
        path({ id: "RN2-STD", name: "Standard close", day: "Thursday", type: "dry", laneScore: 86, closest: true }),
        path({ id: "RN2-RENEW", name: "Renewal-aware reply", day: "Thursday", type: "reefer", laneScore: 91 }),
      ],
    };
  }
  if (lesson === "combined" && beat === "try") {
    return {
      id: "combined",
      requiredIds: ["CB-1"],
      loads: [
        {
          id: "CB-1",
          customer: "RivalSoft mentioned",
          origin: "Second cancel mention · CompetitorX · renewal soon",
          destination: "CS inbox",
          weightT: 2,
          cargo: "general",
          day: "Friday",
          window: "SLA 2h",
          penaltyWindow: false,
          alpine: true,
          accept: "hold-or-escalate",
          bait: {
            truckId: "CB-CLOSE",
            drivers: 1,
            label: "Close with macro · Suggested",
          },
        },
      ],
      trucks: [
        path({
          id: "CB-CLOSE",
          name: "Close with macro",
          day: "Friday",
          type: "dry",
          laneScore: 97,
          closest: true,
          driversAvailable: 1,
        }),
        path({ id: "CB-ESC", name: "Escalate to AM", day: "Monday", type: "dry", laneScore: 70 }),
      ],
    };
  }
  if (beat === "agent") {
    return {
      id: "agent",
      requiredIds: ["AG-1", "AG-2"],
      loads: [
        {
          id: "AG-1",
          customer: "Hartmann Glass",
          origin: "Password reset",
          destination: "CS inbox",
          weightT: 1,
          cargo: "general",
          day: "Wednesday",
          window: "SLA 8h",
          penaltyWindow: false,
          alpine: false,
          accept: "assign",
          correctTruckId: "AG-OK",
          correctDrivers: 1,
        },
        {
          id: "AG-2",
          customer: "Pierron Parts",
          origin: "Invoice copy",
          destination: "CS inbox",
          weightT: 1,
          cargo: "general",
          day: "Wednesday",
          window: "SLA 8h",
          penaltyWindow: false,
          alpine: false,
          accept: "assign",
          correctTruckId: "AG-OK",
          correctDrivers: 1,
        },
        {
          id: "AG-3",
          customer: "RivalSoft mentioned",
          origin: "Feature gap · CompetitorX",
          destination: "CS inbox",
          weightT: 1,
          cargo: "general",
          day: "Friday",
          window: "SLA 4h",
          penaltyWindow: false,
          alpine: false,
          accept: "hold-or-escalate",
          bait: {
            truckId: "AG-CLOSE",
            drivers: 1,
            label: "Close with macro · Suggested",
          },
        },
      ],
      trucks: [
        path({ id: "AG-OK", name: "Health-check reply", day: "Wednesday", type: "dry", laneScore: 90 }),
        path({ id: "AG-CHEAP", name: "Standard close", day: "Wednesday", type: "dry", laneScore: 40, closest: true }),
        path({ id: "AG-CLOSE", name: "Close with macro", day: "Friday", type: "dry", laneScore: 96, base: "Macros" }),
        path({ id: "AG-ESC", name: "Escalate to AM", day: "Monday", type: "dry", laneScore: 45 }),
      ],
    };
  }
  return null;
}
