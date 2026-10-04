#!/usr/bin/env node
/**
 * Capture Chrome Web Store listing assets:
 *   - 5 screenshots @ 1280×800 (JPEG, no alpha)
 *   - small promo tile 440×280
 *   - marquee promo tile 1400×560
 *
 * Prerequisites: `pnpm dev:web`
 * Usage: `pnpm promo:assets`
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildPromoStore } from "./seed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "apps/extension/promo/store");
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

async function shot(page, name) {
  // Hide captions for clean store shots.
  await page.evaluate(() => {
    window.miraPromo?.setCaption("");
    const end = document.getElementById("endcard");
    if (end) end.hidden = true;
  });
  await sleep(250);
  const file = path.join(OUT_DIR, name);
  // JPEG = 24-bit, no alpha (Chrome Web Store requirement).
  await page.locator("#chrome").screenshot({
    path: file,
    type: "jpeg",
    quality: 92,
  });
  console.log("wrote", name);
}

async function captureScreenshots() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const store = buildPromoStore();
  await context.addInitScript((seed) => {
    localStorage.setItem("mira-web-v1", JSON.stringify(seed));
  }, store);

  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  await page.goto(`${ORIGIN}/ext/learn`, { waitUntil: "domcontentloaded" });
  await sleep(500);
  await page.goto(`${ORIGIN}/promo/theater.html`, { waitUntil: "networkidle" });
  await sleep(900);

  let panel = await mira(page);

  // 1) Learn home
  await panel.getByRole("button", { name: /Start with Mira|Continue with Mira/i }).waitFor();
  await sleep(400);
  await shot(page, "screenshot-01-learn.jpeg");

  // 2) Live coach gate
  await panel.getByRole("button", { name: /Start with Mira|Continue with Mira/i }).click();
  await panel.getByRole("button", { name: /Review step cards instead/i }).waitFor();
  await sleep(500);
  await shot(page, "screenshot-02-coach.jpeg");

  // 3) Step cards
  await panel.getByRole("button", { name: /Review step cards instead/i }).click();
  await sleep(700);
  await shot(page, "screenshot-03-steps.jpeg");

  // Advance one step for variety
  const next = panel.getByRole("button", { name: /^Next step$/i });
  if (await next.count()) {
    await next.click();
    await sleep(600);
  }

  // 4) Record idle
  const recordTab = panel.locator('a[href="/ext"]');
  if (await recordTab.count()) await recordTab.click();
  else await page.evaluate(() => window.miraPromo.openRecord());
  await sleep(1000);
  panel = await mira(page);
  await panel.getByRole("button", { name: /^Start$|^Start task$/i }).waitFor();
  await sleep(400);
  await shot(page, "screenshot-04-record.jpeg");

  // 5) Recording live
  await panel.getByRole("button", { name: /^Start$|^Start task$/i }).click();
  await panel.locator(".ext-rec-bar.live, .ext-record").first().waitFor({ timeout: 12_000 });
  await sleep(2800);
  await shot(page, "screenshot-05-capturing.jpeg");

  await context.close();
  await browser.close();
}

function buildTiles() {
  const py = path.join(__dirname, "build-tiles.py");
  const result = spawnSync("python3", [py, OUT_DIR], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error("Failed to build promo tiles");
  }
}

async function main() {
  await waitForServer();
  await mkdir(OUT_DIR, { recursive: true });
  await captureScreenshots();
  buildTiles();

  // Manifest for convenience
  await writeFile(
    path.join(OUT_DIR, "README.txt"),
    [
      "Chrome Web Store listing assets",
      "",
      "Screenshots (1280x800 JPEG):",
      "  screenshot-01-learn.jpeg",
      "  screenshot-02-coach.jpeg",
      "  screenshot-03-steps.jpeg",
      "  screenshot-04-record.jpeg",
      "  screenshot-05-capturing.jpeg",
      "",
      "Small promo tile (440x280 JPEG):",
      "  tile-small.jpeg",
      "",
      "Marquee promo tile (1400x560 JPEG):",
      "  tile-marquee.jpeg",
      "",
    ].join("\n"),
  );

  console.log(`\nStore assets → ${OUT_DIR}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
