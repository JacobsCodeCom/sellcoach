import type { Draft, Load, Phase, ScreenEvent, Snapshot, Truck } from "./types";
import { clock, uid } from "./types";
import { redact } from "./redact";

export function drawFrame(input: {
  t: number;
  loads: Load[];
  trucks: Truck[];
  openId: string | null;
  draft: Draft;
  label: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const g = canvas.getContext("2d");
  if (!g) return undefined;
  g.fillStyle = "#141610";
  g.fillRect(0, 0, 640, 360);
  g.fillStyle = "#e6ff4d";
  g.fillRect(0, 0, 640, 8);
  g.font = "500 14px ui-monospace, monospace";
  g.fillStyle = "#f4ecd6";
  g.fillText(`MERIDIAN AP  ${clock(input.t)}`, 28, 40);
  g.fillStyle = "#a39a86";
  g.fillText(redact(input.label).slice(0, 72), 28, 64);

  const load = input.loads.find((item) => item.id === input.openId);
  g.fillStyle = "#f4ecd6";
  g.fillRect(28, 88, 584, 180);
  g.fillStyle = "#1c1a16";
  g.font = "600 22px ui-sans-serif, sans-serif";
  if (!load) {
    g.fillText("Queue", 48, 124);
    g.font = "16px ui-sans-serif, sans-serif";
    input.loads.slice(0, 4).forEach((item, index) => {
      g.fillText(
        `${item.id}  ${item.customer}  €${item.weightT}  ${item.day}`,
        48,
        160 + index * 24,
      );
    });
  } else {
    g.fillText(`${load.customer}`, 48, 124);
    g.font = "16px ui-sans-serif, sans-serif";
    g.fillText(`${load.origin} · ${load.destination}`, 48, 152);
    g.fillText(
      `€${load.weightT.toLocaleString("en-US")} · ${load.day} · ${load.cargo === "pharma" ? load.tempLabel || "subsidiary" : "supplier"}${load.alpine ? " · equipment" : ""}`,
      48,
      178,
    );
    const truck = input.trucks.find((item) => item.id === input.draft.truckId);
    g.fillText(
      redact(
        `${input.draft.action ?? "no action"} · ${truck?.name ?? "no code"} · asset ${input.draft.drivers >= 2 ? "on file" : "none"} · ${input.draft.note || "no note"}`,
      ).slice(0, 70),
      48,
      210,
    );
    if (load.contact) {
      g.fillStyle = "#6d675b";
      g.fillText("Contact [email]", 48, 240);
    }
  }
  g.fillStyle = "#a39a86";
  g.font = "12px ui-monospace, monospace";
  g.fillText("Stored frame · personal data redacted", 28, 320);
  return canvas.toDataURL("image/jpeg", 0.62);
}

export function takeSnapshot(input: {
  t: number;
  label: string;
  loadId: string | null;
  loads: Load[];
  trucks: Truck[];
  draft: Draft;
}): Snapshot {
  return {
    id: uid("frame"),
    t: input.t,
    label: redact(input.label),
    loadId: input.loadId,
    image: drawFrame({ ...input, openId: input.loadId }),
  };
}

export function postFrame(before: string, after: string, image?: string) {
  void fetch("/api/frame", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ before, after, image }),
  }).catch(() => undefined);
}

export function phaseAllowsDesk(phase: Phase) {
  return phase === "capture" || phase === "teach" || phase === "agent";
}

export type Gate =
  | "speaking"
  | "pointer"
  | "typing"
  | "speech"
  | "waiting"
  | "watching"
  | "armed"
  | "idle";

export function gateCopy(gate: Gate) {
  switch (gate) {
    case "speaking":
      return "Speaking";
    case "pointer":
      return "Holding: mouse down";
    case "typing":
      return "Holding: expert is typing";
    case "speech":
      return "Holding: expert is speaking";
    case "waiting":
      return "Waiting for the reason";
    case "watching":
      return "Armed · waiting for 2s quiet";
    case "armed":
      return "Armed · 2s quiet · choosing the question";
    default:
      return "Listening";
  }
}
