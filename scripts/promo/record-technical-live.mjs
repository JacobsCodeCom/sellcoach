#!/usr/bin/env node
/**
 * Silent technical walkthrough against the live Mira site (no ElevenLabs VO).
 *
 *   MIRA_EMAIL=... MIRA_PASSWORD=... pnpm promo:technical:live
 *
 * Optional:
 *   MIRA_ORIGIN=https://mira.jacobscode.com
 *
 * Output:
 *   apps/extension/promo/mira-technical-walkthrough-live.webm
 *   apps/extension/promo/mira-technical-walkthrough-live.mp4
 */

import { chromium } from "playwright";
import { mkdir, copyFile, readdir, unlink, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "apps/extension/promo");
const FFMPEG = process.env.FFMPEG_PATH || path.join(ROOT, "tools/ffmpeg/ffmpeg");
const ORIGIN = (process.env.MIRA_ORIGIN || "https://mira.jacobscode.com").replace(/\/$/, "");
const EMAIL = process.env.MIRA_EMAIL || "";
const PASSWORD = process.env.MIRA_PASSWORD || "";
const WIDTH = 1280;
const HEIGHT = 800;
const BASENAME = "mira-technical-walkthrough-live";

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

async function toMp4(webmPath, mp4Path) {
  await access(FFMPEG);
  const result = await run(FFMPEG, [
    "-y",
    "-i",
    webmPath,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    mp4Path,
  ]);
  if (result.code !== 0) throw new Error(`mp4 encode failed\n${result.stderr.slice(-800)}`);
}

async function hold(page, ms) {
  await page.waitForTimeout(ms);
}

async function clickNav(page, label) {
  const tab = page.locator("nav.admin-tabs").getByRole("link", { name: label, exact: true });
  if (await tab.count()) {
    await tab.click();
    await sleep(900);
    return true;
  }
  return false;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Set MIRA_EMAIL and MIRA_PASSWORD (do not commit them).");
  }

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

  const page = await context.newPage();
  page.setDefaultTimeout(25_000);

  console.log(`Logging into ${ORIGIN} as ${EMAIL}…`);
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();

  // Land somewhere authenticated (or show error)
  await Promise.race([
    page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 }),
    page.locator(".error").waitFor({ timeout: 30_000 }).then(async () => {
      const msg = await page.locator(".error").innerText();
      throw new Error(`Login failed: ${msg}`);
    }),
  ]);
  await sleep(1500);

  // Prefer admin if this account can access it
  await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded" });
  await sleep(1600);

  const onAdmin = await page.getByRole("heading", { name: "Admin" }).isVisible().catch(() => false);
  if (onAdmin) {
    console.log("Touring admin…");
    await page.locator(".admin-metrics").first().scrollIntoViewIfNeeded().catch(() => {});
    await hold(page, 2200);

    if (await clickNav(page, "Lessons")) {
      await page.locator("main, .admin-page").first().hover().catch(() => {});
      await hold(page, 2800);
      // Open first lesson / row if present
      const lessonLink = page.locator("a, button").filter({ hasText: /./ }).nth(0);
      await page
        .locator(".admin-page table tbody tr, .admin-lesson, .admin-row, article")
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await hold(page, 1600);
      void lessonLink;
    }

    if (await clickNav(page, "People")) {
      await hold(page, 2400);
    }

    if (await clickNav(page, "Agents")) {
      await hold(page, 2200);
      const agent = page.getByRole("link").filter({ hasText: /.+/ }).first();
      const agentCard = page.locator("a[href*='/admin/agents/'], .admin-agent, article a").first();
      if (await agentCard.count()) {
        await agentCard.click().catch(() => {});
        await hold(page, 2600);
      } else {
        void agent;
      }
    }

    if (await clickNav(page, "Company")) {
      await hold(page, 2000);
    }
  } else {
    console.log("Admin not available — continuing with app surfaces…");
  }

  // Capture
  console.log("Touring capture…");
  await page.goto(`${ORIGIN}/capture`, { waitUntil: "domcontentloaded" });
  await hold(page, 2800);

  // Learn
  console.log("Touring learn…");
  await page.goto(`${ORIGIN}/learn`, { waitUntil: "domcontentloaded" });
  await hold(page, 2200);
  const start = page.getByRole("button", { name: /^(Start|Continue)$/i }).first();
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    await hold(page, 2200);
    const share = page.getByRole("button", { name: /Share screen|start/i }).first();
    if (await share.isVisible().catch(() => false)) {
      // Don't actually start getDisplayMedia in headless — show the live-coach entry UI
      await share.scrollIntoViewIfNeeded().catch(() => {});
      await hold(page, 2000);
    }
    const review = page.getByRole("button", { name: /Review step cards/i }).first();
    if (await review.isVisible().catch(() => false)) {
      await review.click();
      await hold(page, 2800);
    }
  }

  // App home / overview
  await page.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await hold(page, 1800);

  // Brief end pause on admin overview if possible
  await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded" });
  await hold(page, 2200);

  const video = page.video();
  await page.close();
  const tempPath = await video.path();
  await context.close();
  await browser.close();

  const webmOut = path.join(OUT_DIR, `${BASENAME}.webm`);
  await copyFile(tempPath, webmOut);

  const leftovers = await readdir(OUT_DIR);
  for (const name of leftovers) {
    if (name.endsWith(".webm") && name !== `${BASENAME}.webm` && !name.startsWith("mira-extension-promo") && !name.startsWith("mira-technical-walkthrough.")) {
      // keep prior technical + store promo; remove playwright random names only
      if (!name.includes("walkthrough") && !name.includes("extension-promo")) {
        await unlink(path.join(OUT_DIR, name)).catch(() => {});
      }
    }
  }
  if (tempPath !== webmOut) await unlink(tempPath).catch(() => {});

  const mp4Out = path.join(OUT_DIR, `${BASENAME}.mp4`);
  console.log("Encoding mp4 (silent)…");
  await toMp4(webmOut, mp4Out);

  console.log(`\nLive silent walkthrough:`);
  console.log(`  ${webmOut}`);
  console.log(`  ${mp4Out}`);
  console.log(`\n  open "${mp4Out}"\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
