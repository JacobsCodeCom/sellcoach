import type { Board, Load, Truck } from "./types";

/** Cost centers: type dry = opex, reefer = capex. driversAvailable = max asset-number state (1 none, 2 on file). */
const captureCenters: Truck[] = [
  {
    id: "CC-4711",
    name: "4711 · Opex",
    type: "dry",
    capacityT: 99999,
    base: "Plant GL",
    rateEur: 0,
    laneScore: 40,
    day: "Wednesday",
    driversAvailable: 2,
    available: true,
    closest: true,
  },
  {
    id: "CC-0400",
    name: "0400 · Capex",
    type: "reefer",
    capacityT: 99999,
    base: "Asset ledger",
    rateEur: 0,
    laneScore: 90,
    day: "Wednesday",
    driversAvailable: 2,
    available: true,
  },
  {
    id: "CC-2200",
    name: "2200 · Maintenance",
    type: "dry",
    capacityT: 99999,
    base: "Plant GL",
    rateEur: 0,
    laneScore: 88,
    day: "Wednesday",
    driversAvailable: 2,
    available: true,
  },
  {
    id: "CC-PAY",
    name: "Pay this week",
    type: "dry",
    capacityT: 99999,
    base: "Cash desk",
    rateEur: 0,
    laneScore: 96,
    day: "Friday",
    driversAvailable: 1,
    available: true,
  },
  {
    id: "CC-HOLD",
    name: "Hold queue",
    type: "dry",
    capacityT: 99999,
    base: "AP hold",
    rateEur: 0,
    laneScore: 50,
    day: "Monday",
    driversAvailable: 1,
    available: true,
  },
];

/**
 * Invoice board. weightT = amount EUR.
 * alpine = equipment / capex candidate (>€5k).
 * cargo pharma = Czech subsidiary (needs second approval).
 * customer Vogel = December double-bill risk.
 * penaltyWindow = soft coding judgment (leave cheap Suggested).
 * drivers on draft: 1 = no asset number, 2 = asset on file.
 */
const captureLoads: Load[] = [
  {
    id: "INV-441",
    customer: "Keller & Sohn",
    origin: "PO-8821 · filters",
    destination: "Stuttgart plant",
    weightT: 840,
    cargo: "general",
    day: "Wednesday",
    window: "Net 30",
    penaltyWindow: true,
    alpine: false,
    contact: "ap@keller.example",
    accept: "any",
    bait: {
      truckId: "CC-4711",
      drivers: 1,
      label: "4711 · Opex · Suggested coding",
    },
  },
  {
    id: "INV-448",
    customer: "Alpina Maschinen",
    origin: "CNC spindle · equipment",
    destination: "Stuttgart plant",
    weightT: 7200,
    cargo: "general",
    day: "Thursday",
    window: "Net 14",
    penaltyWindow: false,
    alpine: true,
    accept: "assign",
    correctTruckId: "CC-0400",
    correctDrivers: 2,
    bait: {
      truckId: "CC-4711",
      drivers: 1,
      label: "4711 · Opex · no asset number",
    },
  },
  {
    id: "INV-477",
    customer: "Vogel GmbH",
    origin: "December consumables",
    destination: "Stuttgart plant",
    weightT: 1860,
    cargo: "general",
    day: "Friday",
    window: "Due Fri",
    penaltyWindow: false,
    alpine: false,
    accept: "hold-or-escalate",
    bait: {
      truckId: "CC-PAY",
      drivers: 1,
      label: "Pay this week · Suggested",
    },
  },
];

export const captureBoard: Board = {
  id: "capture",
  loads: captureLoads,
  trucks: captureCenters,
  requiredIds: ["INV-441", "INV-448", "INV-477"],
};

function center(
  partial: Pick<Truck, "id" | "name" | "day" | "type"> & Partial<Truck>,
): Truck {
  return {
    capacityT: 99999,
    base: "Plant GL",
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
      id: "december-show",
      requiredIds: [],
      loads: [
        {
          id: "DV-1",
          customer: "Vogel GmbH",
          origin: "December parts kit",
          destination: "Stuttgart plant",
          weightT: 920,
          cargo: "general",
          day: "Friday",
          window: "Due Fri",
          penaltyWindow: false,
          alpine: false,
          accept: "hold-or-escalate",
          bait: {
            truckId: "DV-PAY",
            drivers: 1,
            label: "Pay this week · Suggested",
          },
        },
      ],
      trucks: [
        center({ id: "DV-PAY", name: "Pay this week", day: "Friday", type: "dry", laneScore: 95, closest: true }),
        center({ id: "DV-HOLD", name: "Hold queue", day: "Monday", type: "dry", laneScore: 40 }),
      ],
    };
  }
  if (lesson === "friday" && beat === "try") {
    return {
      id: "december-try",
      requiredIds: ["DV-2"],
      loads: [
        {
          id: "DV-2",
          customer: "Vogel GmbH",
          origin: "December fasteners",
          destination: "Stuttgart plant",
          weightT: 1140,
          cargo: "general",
          day: "Friday",
          window: "Due Fri",
          penaltyWindow: false,
          alpine: false,
          accept: "hold-or-escalate",
          bait: {
            truckId: "DV2-PAY",
            drivers: 1,
            label: "Pay this week · Suggested",
          },
        },
      ],
      trucks: [
        center({ id: "DV2-PAY", name: "Pay this week", day: "Friday", type: "dry", laneScore: 96, closest: true }),
        center({ id: "DV2-HOLD", name: "Hold queue", day: "Monday", type: "dry", laneScore: 42 }),
      ],
    };
  }
  if (lesson === "alpine" && beat === "show") {
    return {
      id: "capex-show",
      requiredIds: [],
      loads: [
        {
          id: "CX-1",
          customer: "Bruck Steel",
          origin: "Press brake tooling · equipment",
          destination: "Stuttgart plant",
          weightT: 6400,
          cargo: "general",
          day: "Thursday",
          window: "Net 14",
          penaltyWindow: false,
          alpine: true,
          accept: "assign",
          correctTruckId: "CX-CAP",
          correctDrivers: 2,
          bait: {
            truckId: "CX-OPX",
            drivers: 1,
            label: "4711 · Opex · no asset number",
          },
        },
      ],
      trucks: [
        center({ id: "CX-OPX", name: "4711 · Opex", day: "Thursday", type: "dry", laneScore: 40, closest: true }),
        center({ id: "CX-CAP", name: "0400 · Capex", day: "Thursday", type: "reefer", laneScore: 90 }),
      ],
    };
  }
  if (lesson === "alpine" && beat === "try") {
    return {
      id: "capex-try",
      requiredIds: ["CX-2"],
      loads: [
        {
          id: "CX-2",
          customer: "Kesselwerk",
          origin: "Servo drive · equipment",
          destination: "Stuttgart plant",
          weightT: 7200,
          cargo: "general",
          day: "Thursday",
          window: "Net 14",
          penaltyWindow: false,
          alpine: true,
          accept: "assign",
          correctTruckId: "CX2-CAP",
          correctDrivers: 2,
          bait: {
            truckId: "CX2-OPX",
            drivers: 1,
            label: "4711 · Opex · no asset number",
          },
        },
      ],
      trucks: [
        center({ id: "CX2-OPX", name: "4711 · Opex", day: "Thursday", type: "dry", laneScore: 38, closest: true }),
        center({ id: "CX2-CAP", name: "0400 · Capex", day: "Thursday", type: "reefer", laneScore: 92 }),
      ],
    };
  }
  if (lesson === "cold" && beat === "show") {
    return {
      id: "czech-show",
      requiredIds: [],
      loads: [
        {
          id: "CZ-1",
          customer: "Meridian CZ s.r.o.",
          origin: "Subsidiary freight",
          destination: "Brno → Stuttgart",
          weightT: 2100,
          cargo: "pharma",
          tempLabel: "Czech subsidiary",
          day: "Thursday",
          window: "Net 30",
          penaltyWindow: false,
          alpine: false,
          contact: "finance@meridian-cz.example",
          accept: "hold-or-escalate",
          bait: {
            truckId: "CZ-POST",
            drivers: 1,
            label: "Post now · Suggested",
          },
        },
      ],
      trucks: [
        center({ id: "CZ-POST", name: "Post now", day: "Thursday", type: "dry", laneScore: 88, closest: true }),
        center({ id: "CZ-WAIT", name: "Await approval", day: "Friday", type: "reefer", laneScore: 60 }),
      ],
    };
  }
  if (lesson === "cold" && beat === "try") {
    return {
      id: "czech-try",
      requiredIds: ["CZ-2"],
      loads: [
        {
          id: "CZ-2",
          customer: "Meridian CZ s.r.o.",
          origin: "Subsidiary tooling",
          destination: "Brno → Stuttgart",
          weightT: 3400,
          cargo: "pharma",
          tempLabel: "Czech subsidiary",
          day: "Thursday",
          window: "Net 30",
          penaltyWindow: false,
          alpine: false,
          contact: "finance@meridian-cz.example",
          accept: "hold-or-escalate",
          bait: {
            truckId: "CZ2-POST",
            drivers: 1,
            label: "Post now · Suggested",
          },
        },
      ],
      trucks: [
        center({ id: "CZ2-POST", name: "Post now", day: "Thursday", type: "dry", laneScore: 86, closest: true }),
        center({ id: "CZ2-WAIT", name: "Await approval", day: "Friday", type: "reefer", laneScore: 58 }),
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
          customer: "Vogel GmbH",
          origin: "December + laser cutter · equipment",
          destination: "Stuttgart plant",
          weightT: 9100,
          cargo: "general",
          day: "Friday",
          window: "Due Fri",
          penaltyWindow: false,
          alpine: true,
          accept: "hold-or-escalate",
          bait: {
            truckId: "CB-PAY",
            drivers: 1,
            label: "Pay this week · Opex Suggested",
          },
        },
      ],
      trucks: [
        center({
          id: "CB-PAY",
          name: "Pay this week · Opex",
          day: "Friday",
          type: "dry",
          laneScore: 97,
          closest: true,
          driversAvailable: 1,
        }),
        center({ id: "CB-CAP", name: "0400 · Capex", day: "Monday", type: "reefer", laneScore: 70 }),
        center({ id: "CB-HOLD", name: "Hold queue", day: "Monday", type: "dry", laneScore: 40 }),
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
          origin: "PO-9100 · glass",
          destination: "Stuttgart plant",
          weightT: 640,
          cargo: "general",
          day: "Wednesday",
          window: "Net 30",
          penaltyWindow: false,
          alpine: false,
          accept: "assign",
          correctTruckId: "AG-OK",
          correctDrivers: 1,
        },
        {
          id: "AG-2",
          customer: "Pierron Parts",
          origin: "PO-9101 · fittings",
          destination: "Stuttgart plant",
          weightT: 420,
          cargo: "general",
          day: "Wednesday",
          window: "Net 30",
          penaltyWindow: false,
          alpine: false,
          accept: "assign",
          correctTruckId: "AG-OK",
          correctDrivers: 1,
        },
        {
          id: "AG-3",
          customer: "Vogel GmbH",
          origin: "December consumables",
          destination: "Stuttgart plant",
          weightT: 1500,
          cargo: "general",
          day: "Friday",
          window: "Due Fri",
          penaltyWindow: false,
          alpine: false,
          accept: "hold-or-escalate",
          bait: {
            truckId: "AG-PAY",
            drivers: 1,
            label: "Pay this week · Suggested",
          },
        },
      ],
      trucks: [
        center({ id: "AG-OK", name: "2200 · Maintenance", day: "Wednesday", type: "dry", laneScore: 90 }),
        center({ id: "AG-CHEAP", name: "4711 · Opex", day: "Wednesday", type: "dry", laneScore: 40, closest: true }),
        center({ id: "AG-PAY", name: "Pay this week", day: "Friday", type: "dry", laneScore: 96, base: "Cash desk" }),
        center({ id: "AG-HOLD", name: "Hold queue", day: "Monday", type: "dry", laneScore: 45 }),
      ],
    };
  }
  return null;
}
