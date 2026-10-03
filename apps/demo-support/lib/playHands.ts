import type { HandAction } from "./types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function frames() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)));
  });
}

export async function playHands(
  actions: HandAction[],
  ctx: {
    cancelled: () => boolean;
    apply: (target: string) => void;
    save: () => Promise<boolean>;
    move: (target: string) => Promise<void>;
    recoil: (target: string) => Promise<void>;
    typeNote: (text: string) => void;
    onRecoil: () => Promise<void>;
  },
) {
  for (const action of actions) {
    if (ctx.cancelled()) return;
    if (action.type === "wait") {
      await sleep(action.ms);
      continue;
    }
    if (action.type === "move") {
      await ctx.move(action.target);
      continue;
    }
    if (action.type === "type") {
      let built = "";
      for (const character of action.text) {
        if (ctx.cancelled()) return;
        built += character;
        ctx.typeNote(built);
        await sleep(18);
      }
      continue;
    }
    if (action.type === "recoil") {
      await ctx.recoil(action.target);
      if (ctx.cancelled()) return;
      await ctx.onRecoil();
      return;
    }
    if (action.type === "click") {
      if (action.target === "save") {
        await ctx.move("save");
        if (ctx.cancelled()) return;
        const saved = await ctx.save();
        if (ctx.cancelled()) return;
        if (!saved) {
          await sleep(320);
          continue;
        }
        await frames();
        continue;
      }
      await ctx.move(action.target);
      if (ctx.cancelled()) return;
      ctx.apply(action.target);
      await sleep(280);
      await frames();
    }
  }
}

export function measureTarget(target: string) {
  const element = document.querySelector(`[data-hand="${CSS.escape(target)}"]`);
  if (!(element instanceof HTMLElement)) return null;
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + Math.min(36, rect.width * 0.35),
    y: rect.top + rect.height * 0.55,
  };
}
