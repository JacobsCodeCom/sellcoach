#!/usr/bin/env node
/**
 * Record landing / store promo videos of Mira coaching on the Acme Ops desk.
 *
 * Prerequisites: `pnpm dev:web` on http://localhost:3000
 *
 * Usage:
 *   pnpm promo:record
 *
 * Output:
 *   apps/extension/promo/mira-extension-promo.webm
 *   apps/extension/promo/mira-extension-promo.mp4  (with narration)
 *
 * Voice: UI is scripted in Playwright; narration is muxed via ElevenLabs (/api/speak)
 * or macOS `say`, then FFmpeg.
 */

import { chromium } from "playwright";
import { mkdir, copyFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPromoStore } from "./seed.mjs";
import { muxNarration } from "./mux-audio.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "apps/extension/promo");
const ORIGIN = process.env.MIRA_ORIGIN || "http://localhost:3000";
const WIDTH = 1280;
const HEIGHT = 800;

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(ORIGIN);
      if (res.ok || res.status === 304) return;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error(`Mira web is not reachable at ${ORIGIN}. Start it with pnpm dev:web.`);
}

async function mira(page) {
  const frame = page.frameLocator("#mira");
  await frame.locator(".ext-root, .ext-start, .learn-start, .ext-mode-tabs").first().waitFor({
    timeout: 20_000,
  });
  return frame;
}

async function main() {
  await waitForServer();
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: OUT_DIR,
      size: { width: WIDTH, height: HEIGHT },
    },
  });

  const store = buildPromoStore();
  await context.addInitScript((seed) => {
    localStorage.setItem("mira-web-v1", JSON.stringify(seed));
    sessionStorage.setItem("mira-promo", "1");
    window.__MIRA_PROMO__ = true;
  }, store);

  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  await page.goto(`${ORIGIN}/ext/learn?promo=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await page.goto(`${ORIGIN}/promo/theater.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const panel = await mira(page);
  const t0 = Date.now();
  const lines = [];

  async function caption(text, holdMs = 2200) {
    lines.push({ atMs: Date.now() - t0, text });
    await page.evaluate((t) => window.miraPromo.setCaption(t), text);
    await sleep(holdMs);
  }

  async function clearCaption() {
    await page.evaluate(() => window.miraPromo.setCaption(""));
  }

  async function tutor(action) {
    await page.evaluate((a) => window.miraPromo.tutor(a), action);
  }

  async function spotlight() {
    await page.evaluate(() => window.miraPromo.spotlight("ticket-alpine"));
  }

  // ——— Scene 1: New-hire learning plan ———
  await caption("New hires get a plan matched to their role", 2600);
  await panel.getByRole("button", { name: /Start with Mira|Continue with Mira/i }).waitFor();
  await sleep(700);
  await panel.getByRole("button", { name: /Start with Mira|Continue with Mira/i }).click();
  await clearCaption();

  // ——— Scene 2: Static guide (the contrast) ———
  await caption("Most tools stop at a click-through guide", 2000);
  const reviewCards = panel.getByRole("button", { name: /Review step cards instead/i });
  await reviewCards.waitFor({ timeout: 12_000 });
  await sleep(500);
  await reviewCards.click();
  await clearCaption();

  await caption("Useful — but not how the work actually happens", 1800);
  await panel.locator(".lesson-card-step h2").first().waitFor();
  await sleep(900);
  await clearCaption();

  // ——— Scene 3: Back to live coach ———
  await caption("Mira coaches on the real job instead", 2000);
  await panel.getByRole("button", { name: /Back to live coach/i }).click();
  await sleep(700);
  await clearCaption();

  await panel.getByRole("button", { name: /Share screen & start/i }).waitFor();
  await sleep(400);
  await panel.getByRole("button", { name: /Share screen & start/i }).click();

  await panel.locator(".live-coach-banner, .learn-session--live").first().waitFor({ timeout: 12_000 });
  await spotlight();
  await sleep(1400);

  // ——— Scene 4: Guided step on Alpine ———
  await caption("It watches the real screen and talks you through the next move", 2200);
  await tutor({
    action: "guide",
    speak: "Open Alpine Health first — two cancellation mentions beat the older tickets.",
    stepIndex: 0,
    guardrailId: null,
    stepId: "s1",
    replayMomentId: "m1",
    explain: "Repeat cancellation mentions beat FIFO when retention is on the line.",
    requestHighlight: true,
  });
  await spotlight();
  await sleep(2200);
  await clearCaption();

  // ——— Scene 5: Need a hint ———
  await caption("Stuck? Ask for a hint in the moment", 1600);
  await panel.getByRole("button", { name: /Need a hint\?/i }).click();
  await sleep(2000);
  await clearCaption();

  // ——— Scene 6: Guardrail intervention ———
  await caption("And it stops you before a senior's rule breaks", 2200);
  await tutor({
    action: "intervene",
    speak:
      "Jordan would stop here. Competitor comparisons go to your lead the same day — don't answer alone.",
    stepIndex: 2,
    guardrailId: "g2",
    stepId: "s3",
    replayMomentId: "m2",
    explain: "Competitor comparison always goes up the same day.",
    requestHighlight: false,
  });
  await panel.locator(".coach-box--stop").waitFor({ timeout: 8_000 });
  await sleep(2800);
  await clearCaption();

  await page.evaluate(() =>
    window.miraPromo.hear("Because competitor talk needs a tighter story than a solo reply."),
  );
  await sleep(1800);

  lines.push({
    atMs: Date.now() - t0,
    text: "Your team learns from its best people.",
  });
  await page.evaluate(() => window.miraPromo.setCaption(""));
  await page.evaluate(() => window.miraPromo.showEndcard());
  await sleep(2800);

  const video = page.video();
  await page.close();
  const tempPath = await video.path();
  await context.close();
  await browser.close();

  const silentPath = path.join(OUT_DIR, "mira-extension-promo.silent.webm");
  await copyFile(tempPath, silentPath);

  // Clean Playwright's random video filename
  const leftovers = await readdir(OUT_DIR);
  for (const name of leftovers) {
    if (name.endsWith(".webm") && !name.startsWith("mira-extension-promo")) {
      await unlink(path.join(OUT_DIR, name)).catch(() => {});
    }
  }

  console.log(`\nSilent capture → ${silentPath}`);
  console.log(`Muxing ${lines.length} narration lines…`);

  const { webmOut, mp4Out, durationSec } = await muxNarration({
    videoPath: silentPath,
    lines,
    outDir: OUT_DIR,
    basename: "mira-extension-promo",
  });

  await unlink(silentPath).catch(() => {});

  console.log(`\nPromo video with audio:`);
  console.log(`  ${webmOut}`);
  console.log(`  ${mp4Out}`);
  console.log(`  (~${durationSec.toFixed(1)}s)`);
  console.log(`\n  open "${mp4Out}"\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
