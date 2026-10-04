import type { ActionName, Draft, Load, RuleId, Truck, Violation } from "./types";

export const RULE_COPY: Record<RuleId, string> = {
  "alpine-weight":
    "Equipment over €5,000 must post to capex with an asset number on file.",
  "cold-chain":
    "Czech subsidiary invoices need a second approval before they post.",
  "friday-nordwerk":
    "Vogel December invoices stay on hold. Do not pay this week.",
};

function isVogel(load: Load) {
  return /vogel/i.test(load.customer);
}

export function checkViolation(
  load: Load,
  draft: Draft,
  trucks: Truck[],
): Violation | null {
  const center = trucks.find((item) => item.id === draft.truckId) ?? null;

  if (isVogel(load) && draft.action === "assign") {
    return {
      ruleId: "friday-nordwerk",
      title: "Posting blocked",
      message: RULE_COPY["friday-nordwerk"],
      because: "Company policy: hold Vogel in December.",
    };
  }

  if (load.cargo === "pharma" && draft.action === "assign") {
    return {
      ruleId: "cold-chain",
      title: "Posting blocked",
      message: RULE_COPY["cold-chain"],
      because: "Subsidiary invoices wait for a second approval.",
    };
  }

  if (load.alpine && load.weightT > 5000 && draft.action === "assign") {
    const opex = center?.type === "dry";
    const noAsset = draft.drivers < 2;
    if (opex || noAsset) {
      return {
        ruleId: "alpine-weight",
        title: "Posting blocked",
        message: RULE_COPY["alpine-weight"],
        because: opex
          ? "Equipment over €5,000 cannot post to opex."
          : "Capex requires an asset number on file.",
      };
    }
  }

  return null;
}

export function actionLabel(action: ActionName) {
  if (action === "assign") return "Post";
  if (action === "hold") return "Hold";
  return "2nd approval";
}
