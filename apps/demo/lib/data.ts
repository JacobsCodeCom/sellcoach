import type { Board, Load, Truck } from "./types";

const captureTrucks: Truck[] = [
  {
    id: "TR-BRE",
    name: "Brenner Freight",
    type: "dry",
    capacityT: 20,
    base: "Ingolstadt",
    rateEur: 860,
    laneScore: 64,
    day: "Wednesday",
    driversAvailable: 1,
    available: true,
    closest: true,
  },
  {
    id: "TR-MAR",
    name: "Marbach Logistics",
    type: "dry",
    capacityT: 22,
    base: "Munich yard",
    rateEur: 910,
    laneScore: 94,
    day: "Wednesday",
    driversAvailable: 1,
    available: true,
  },
  {
    id: "TR-ORT",
    name: "Ortler Zug",
    type: "dry",
    capacityT: 24,
    base: "Munich yard",
    rateEur: 1240,
    laneScore: 88,
    day: "Thursday",
    driversAvailable: 2,
    available: true,
  },
  {
    id: "TR-RHE",
    name: "Rhein Express",
    type: "dry",
    capacityT: 20,
    base: "Stuttgart",
    rateEur: 780,
    laneScore: 96,
    day: "Friday",
    driversAvailable: 1,
    available: true,
  },
  {
    id: "TR-ELB",
    name: "Elbe Partner",
    type: "dry",
    capacityT: 20,
    base: "Munich yard",
    rateEur: 960,
    laneScore: 71,
    day: "Monday",
    driversAvailable: 2,
    available: true,
  },
  {
    id: "TR-THU",
    name: "Main Freight",
    type: "dry",
    capacityT: 20,
    base: "Munich yard",
    rateEur: 940,
    laneScore: 72,
    day: "Thursday",
    driversAvailable: 1,
    available: true,
  },
];

const captureLoads: Load[] = [
  {
    id: "LD-441",
    customer: "Keller & Sohn",
    origin: "Munich",
    destination: "Lyon",
    weightT: 8.2,
    cargo: "general",
    day: "Wednesday",
    window: "Thu 16:00",
    penaltyWindow: true,
    alpine: false,
    contact: "+49 171 555 0148",
    accept: "any",
    bait: {
      truckId: "TR-BRE",
      drivers: 1,
      label: "Brenner Freight · Wednesday · €860",
    },
  },
  {
    id: "LD-448",
    customer: "Alpina Maschinen",
    origin: "Munich",
    destination: "Innsbruck",
    weightT: 19.4,
    cargo: "general",
    day: "Thursday",
    window: "Fri 09:00",
    penaltyWindow: false,
    alpine: true,
    accept: "any",
    bait: {
      truckId: "TR-ORT",
      drivers: 1,
      label: "Ortler Zug · Thursday · one driver · €1240",
    },
  },
  {
    id: "LD-477",
    customer: "Nordwerk",
    origin: "Stuttgart",
    destination: "Cologne",
    weightT: 6,
    cargo: "general",
    day: "Friday",
    window: "Fri 18:00",
    penaltyWindow: false,
    alpine: false,
    accept: "any",
    correctTruckId: "TR-THU",
    bait: {
      truckId: "TR-RHE",
      drivers: 1,
      label: "Rhein Express · Friday · lane 96 · €780",
    },
  },
];

export const captureBoard: Board = {
  id: "capture",
  loads: captureLoads,
  trucks: captureTrucks,
  requiredIds: ["LD-441", "LD-448", "LD-477"],
};

function truck(
  partial: Pick<Truck, "id" | "name" | "day" | "rateEur" | "laneScore"> & Partial<Truck>,
): Truck {
  return {
    type: "dry",
    capacityT: 22,
    base: "Munich yard",
    driversAvailable: 1,
    available: true,
    ...partial,
  };
}

export function boardFor(lesson: string, beat: "show" | "try" | "agent"): Board | null {
  if (lesson === "friday" && beat === "show") {
    return {
      id: "friday-show",
      requiredIds: [],
      loads: [
        {
          id: "FR-1",
          customer: "Nordwerk",
          origin: "Hamburg",
          destination: "Hannover",
          weightT: 5.2,
          cargo: "general",
          day: "Friday",
          window: "Fri 14:00",
          penaltyWindow: false,
          alpine: false,
          accept: "no-friday",
          correctTruckId: "FR-MON",
          correctDrivers: 1,
          bait: {
            truckId: "FR-FRI",
            drivers: 1,
            label: "Nordsee Sprint · Friday · lane 95 · €740",
          },
        },
      ],
      trucks: [
        truck({
          id: "FR-FRI",
          name: "Nordsee Sprint",
          day: "Friday",
          rateEur: 740,
          laneScore: 95,
          closest: true,
          base: "Hamburg",
        }),
        truck({
          id: "FR-MON",
          name: "Elbe Partner",
          day: "Monday",
          rateEur: 990,
          laneScore: 70,
        }),
      ],
    };
  }
  if (lesson === "friday" && beat === "try") {
    return {
      id: "friday-try",
      requiredIds: ["FR-2"],
      loads: [
        {
          id: "FR-2",
          customer: "Nordwerk",
          origin: "Stuttgart",
          destination: "Cologne",
          weightT: 6.4,
          cargo: "general",
          day: "Friday",
          window: "Fri 18:00",
          penaltyWindow: false,
          alpine: false,
          accept: "no-friday",
          correctTruckId: "FR2-MON",
          correctDrivers: 1,
          bait: {
            truckId: "FR2-FRI",
            drivers: 1,
            label: "Rhein Express · Friday · lane 96 · €780",
          },
        },
      ],
      trucks: [
        truck({
          id: "FR2-FRI",
          name: "Rhein Express",
          day: "Friday",
          rateEur: 780,
          laneScore: 96,
          closest: true,
          base: "Stuttgart",
        }),
        truck({
          id: "FR2-MON",
          name: "Main Freight",
          day: "Monday",
          rateEur: 940,
          laneScore: 72,
        }),
      ],
    };
  }
  if (lesson === "alpine" && beat === "show") {
    return {
      id: "alpine-show",
      requiredIds: [],
      loads: [
        {
          id: "AL-1",
          customer: "Bruck Steel",
          origin: "Munich",
          destination: "Innsbruck",
          weightT: 20.2,
          cargo: "general",
          day: "Thursday",
          window: "Fri 08:00",
          penaltyWindow: false,
          alpine: true,
          accept: "assign",
          correctTruckId: "AL-TR",
          correctDrivers: 2,
          bait: {
            truckId: "AL-TR",
            drivers: 1,
            label: "Ortler Zug · Thursday · one driver",
          },
        },
      ],
      trucks: [
        truck({
          id: "AL-TR",
          name: "Ortler Zug",
          day: "Thursday",
          rateEur: 1280,
          laneScore: 89,
          driversAvailable: 2,
          capacityT: 24,
        }),
      ],
    };
  }
  if (lesson === "alpine" && beat === "try") {
    return {
      id: "alpine-try",
      requiredIds: ["AL-2"],
      loads: [
        {
          id: "AL-2",
          customer: "Kesselwerk",
          origin: "Munich",
          destination: "Bolzano",
          weightT: 18.7,
          cargo: "general",
          day: "Thursday",
          window: "Fri 11:00",
          penaltyWindow: false,
          alpine: true,
          accept: "assign",
          correctTruckId: "AL2-TR",
          correctDrivers: 2,
          bait: {
            truckId: "AL2-TR",
            drivers: 1,
            label: "Ortler Zug · Thursday · one driver",
          },
        },
      ],
      trucks: [
        truck({
          id: "AL2-TR",
          name: "Ortler Zug",
          day: "Thursday",
          rateEur: 1310,
          laneScore: 87,
          driversAvailable: 2,
          capacityT: 24,
        }),
      ],
    };
  }
  if (lesson === "cold" && beat === "show") {
    return {
      id: "cold-show",
      requiredIds: [],
      loads: [
        {
          id: "CL-1",
          customer: "Helios Pharma",
          origin: "Munich",
          destination: "Basel",
          weightT: 4.1,
          cargo: "pharma",
          tempLabel: "2–8°C",
          day: "Thursday",
          window: "Thu 21:00",
          penaltyWindow: false,
          alpine: false,
          contact: "+49 89 555 0172",
          accept: "hold-or-escalate",
          bait: {
            truckId: "CL-DRY",
            drivers: 1,
            label: "Dock 4 · dry · Thursday · €640",
          },
        },
      ],
      trucks: [
        truck({
          id: "CL-DRY",
          name: "Dock 4",
          day: "Thursday",
          rateEur: 640,
          laneScore: 81,
          capacityT: 18,
          closest: true,
        }),
        truck({
          id: "CL-REEF",
          name: "Isar Kühl",
          type: "reefer",
          day: "Friday",
          rateEur: 980,
          laneScore: 90,
          capacityT: 12,
          available: false,
          unavailableReason: "Free at 06:00",
        }),
      ],
    };
  }
  if (lesson === "cold" && beat === "try") {
    return {
      id: "cold-try",
      requiredIds: ["CL-2"],
      loads: [
        {
          id: "CL-2",
          customer: "Lumen Labs",
          origin: "Munich",
          destination: "Zurich",
          weightT: 3.6,
          cargo: "pharma",
          tempLabel: "2–8°C",
          day: "Thursday",
          window: "Thu 20:00",
          penaltyWindow: false,
          alpine: false,
          contact: "+49 89 555 0190",
          accept: "hold-or-escalate",
          bait: {
            truckId: "CL2-DRY",
            drivers: 1,
            label: "Dock 4 · dry · Thursday · €620",
          },
        },
      ],
      trucks: [
        truck({
          id: "CL2-DRY",
          name: "Dock 4",
          day: "Thursday",
          rateEur: 620,
          laneScore: 80,
          capacityT: 18,
          closest: true,
        }),
        truck({
          id: "CL2-REEF",
          name: "Isar Kühl",
          type: "reefer",
          day: "Friday",
          rateEur: 990,
          laneScore: 91,
          capacityT: 12,
          available: false,
          unavailableReason: "Free at 05:30",
        }),
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
          customer: "Nordwerk",
          origin: "Munich",
          destination: "Innsbruck",
          weightT: 19.6,
          cargo: "general",
          day: "Friday",
          window: "Fri 16:00",
          penaltyWindow: false,
          alpine: true,
          accept: "assign",
          correctTruckId: "CB-MON",
          correctDrivers: 2,
          bait: {
            truckId: "CB-FRI",
            drivers: 1,
            label: "Rhein Express · Friday · lane 97 · one driver",
          },
        },
      ],
      trucks: [
        truck({
          id: "CB-FRI",
          name: "Rhein Express",
          day: "Friday",
          rateEur: 800,
          laneScore: 97,
          capacityT: 24,
          driversAvailable: 1,
          closest: true,
        }),
        truck({
          id: "CB-MON",
          name: "Elbe Partner",
          day: "Monday",
          rateEur: 1120,
          laneScore: 68,
          capacityT: 24,
          driversAvailable: 2,
        }),
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
          origin: "Munich",
          destination: "Lyon",
          weightT: 7.5,
          cargo: "general",
          day: "Wednesday",
          window: "Thu 12:00",
          penaltyWindow: false,
          alpine: false,
          accept: "assign",
          correctTruckId: "AG-BEST",
          correctDrivers: 1,
        },
        {
          id: "AG-2",
          customer: "Pierron Parts",
          origin: "Munich",
          destination: "Strasbourg",
          weightT: 6.1,
          cargo: "general",
          day: "Wednesday",
          window: "Thu 15:00",
          penaltyWindow: false,
          alpine: false,
          accept: "assign",
          correctTruckId: "AG-BEST",
          correctDrivers: 1,
        },
        {
          id: "AG-3",
          customer: "Nordwerk",
          origin: "Stuttgart",
          destination: "Cologne",
          weightT: 5.8,
          cargo: "general",
          day: "Friday",
          window: "Fri 17:00",
          penaltyWindow: false,
          alpine: false,
          accept: "no-friday",
          correctTruckId: "AG-MON",
          correctDrivers: 1,
          bait: {
            truckId: "AG-FRI",
            drivers: 1,
            label: "Rhein Express · Friday · lane 96 · €770",
          },
        },
      ],
      trucks: [
        truck({
          id: "AG-BEST",
          name: "Marbach Logistics",
          day: "Wednesday",
          rateEur: 900,
          laneScore: 93,
        }),
        truck({
          id: "AG-CLOSE",
          name: "Brenner Freight",
          day: "Wednesday",
          rateEur: 840,
          laneScore: 61,
          closest: true,
          base: "Ingolstadt",
        }),
        truck({
          id: "AG-FRI",
          name: "Rhein Express",
          day: "Friday",
          rateEur: 770,
          laneScore: 96,
          base: "Stuttgart",
        }),
        truck({
          id: "AG-MON",
          name: "Elbe Partner",
          day: "Monday",
          rateEur: 980,
          laneScore: 69,
        }),
      ],
    };
  }
  return null;
}
