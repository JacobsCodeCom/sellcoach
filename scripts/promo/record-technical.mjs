#!/usr/bin/env node
/**
 * Technical walkthrough — real product clickthrough (admin → map → teach → agents).
 *
 * Prerequisites: `pnpm dev:web` on http://localhost:3000
 *
 * Usage:
 *   pnpm promo:technical
 *
 * Output:
 *   apps/extension/promo/mira-technical-walkthrough.webm
 *   apps/extension/promo/mira-technical-walkthrough.mp4
 *
 * Note: uses the seeded promo store (same UI as production). Production
 * (mira.jacobscode.com) needs a logged-in owner session — not automated here.
 */

import { chromium } from "playwright";
import { mkdir, copyFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPromoStore } from "./seed.mjs";
import { estimateSpeechMs, muxNarration } from "./mux-audio.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "apps/extension/promo");
const ORIGIN = process.env.MIRA_ORIGIN || "http://localhost:3000";
const WIDTH = 1280;
const HEIGHT = 800;
const BASENAME = "mira-technical-walkthrough";

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

function captionScript() {
  return () => {
    if (window.__miraTechCaptionReady) return;
    window.__miraTechCaptionReady = true;
    const el = document.createElement("div");
    el.id = "mira-tech-caption";
    Object.assign(el.style, {
      position: "fixed",
      left: "50%",
      bottom: "1.5rem",
      transform: "translateX(-50%)",
      zIndex: "99999",
      maxWidth: "40rem",
      padding: "0.7rem 1.15rem",
      borderRadius: "999px",
      background: "rgba(20, 20, 20, 0.9)",
      color: "#fff",
      font: "600 0.95rem/1.35 Avenir Next, Segoe UI, sans-serif",
      letterSpacing: "-0.02em",
      boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
      pointerEvents: "none",
      display: "none",
      textAlign: "center",
    });
    document.documentElement.appendChild(el);
    window.miraTechCaption = {
      set(text) {
        if (!text) {
          el.style.display = "none";
          el.textContent = "";
          return;
        }
        el.textContent = text;
        el.style.display = "block";
      },
    };
  };
}

async function main() {
  await waitForServer();
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });

  const ownerStore = buildPromoStore({ sessionUserId: "usr_owner" });
  const learnerStore = buildPromoStore({ sessionUserId: "usr_alex" });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: OUT_DIR,
      size: { width: WIDTH, height: HEIGHT },
    },
  });

  // Promo flags only — never re-seed localStorage on navigation (that wiped role switches).
  await context.addInitScript(() => {
    sessionStorage.setItem("mira-promo", "1");
    window.__MIRA_PROMO__ = true;
    const pending = sessionStorage.getItem("mira-promo-store");
    if (pending) localStorage.setItem("mira-web-v1", pending);
  });
  await context.addInitScript(captionScript());

  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  const t0 = Date.now();
  const lines = [];

  async function say(spoken, caption) {
    const hold = Math.max(estimateSpeechMs(spoken), 2200);
    lines.push({ atMs: Date.now() - t0, text: spoken });
    await page.evaluate((t) => window.miraTechCaption?.set(t), caption);
    await sleep(hold);
  }

  async function clearCaption() {
    await page.evaluate(() => window.miraTechCaption?.set(""));
  }

  async function seedUser(store) {
    await page.evaluate((seed) => {
      const raw = JSON.stringify(seed);
      localStorage.setItem("mira-web-v1", raw);
      sessionStorage.setItem("mira-promo-store", raw);
      sessionStorage.setItem("mira-promo", "1");
      window.__MIRA_PROMO__ = true;
    }, store);
  }

  async function gotoPromo(pathname) {
    await page.goto(`${ORIGIN}${pathname}${pathname.includes("?") ? "&" : "?"}promo=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(700);
  }

  // ——— 1. Admin overview (real product) ———
  await page.goto(`${ORIGIN}/?promo=1`, { waitUntil: "domcontentloaded" });
  await seedUser(ownerStore);
  await gotoPromo("/admin");
  await page.getByRole("heading", { name: "Admin" }).waitFor({ timeout: 15_000 });
  await page.getByRole("heading", { name: "Overview" }).waitFor();
  await say(
    "[confident] Mira’s admin platform and Chrome extension share one product brain — Capture, Map, Teach — hosted as Next.js on Vercel.",
    "Admin + extension · one product on Vercel",
  );
  await page.locator(".admin-metrics").first().scrollIntoViewIfNeeded().catch(() => {});
  await sleep(500);
  await clearCaption();

  // ——— 2. Lessons = Work Maps in the company ———
  await page.locator("nav.admin-tabs").getByRole("link", { name: "Lessons", exact: true }).click();
  await page.getByRole("heading", { name: "Lessons" }).waitFor();
  await say(
    "[curious] Confirmed Work Maps land here as lessons — steps, guardrails, and the expert’s moments compiled from a capture session.",
    "Admin · Lessons from confirmed Work Maps",
  );
  await page.getByText(/Handle a churn-risk account/i).first().scrollIntoViewIfNeeded();
  await sleep(700);
  await clearCaption();

  // ——— 3. Agents = same map as permission ———
  await page.locator("nav.admin-tabs").getByRole("link", { name: "Agents", exact: true }).click();
  await page.getByRole("heading", { name: "Agents" }).waitFor();
  await page.getByText(/CS desk agent/i).first().click().catch(() => {});
  await sleep(600);
  await say(
    "[excited] The same map can later permission agents. Humans keep the judgment calls; agents stay inside the rails.",
    "Admin · Agents constrained by Work Maps",
  );
  await page.getByText(/Handle churn-risk triage/i).first().scrollIntoViewIfNeeded().catch(() => {});
  await sleep(600);
  await clearCaption();

  // ——— 4. People / Firebase auth ———
  await page.locator("nav.admin-tabs").getByRole("link", { name: "People", exact: true }).click();
  await page.getByRole("heading", { name: /People|Team|Invites/i }).first().waitFor({ timeout: 8_000 }).catch(() => {});
  await say(
    "[matter-of-fact] Firebase Auth signs people in. Company membership is invite-bound in Firestore — not email-domain magic.",
    "Firebase Auth · invite-bound orgs",
  );
  await clearCaption();

  // ——— 5. Extension / learn side — theater for side-by-side desk ———
  await seedUser(learnerStore);
  await gotoPromo("/promo/theater.html");
  await page.waitForTimeout(700);
  const panel = page.frameLocator("#mira");
  await panel.locator(".learn-path-block, .learn-trail").first().waitFor({
    timeout: 20_000,
  });

  await say(
    "[calm] The Chrome side panel is a thin MV3 shell. It iframes Mira, owns tab screenshots and mic, and postMessages frames back into the app.",
    "Extension · shell over Mira APIs",
  );
  await clearCaption();

  await say(
    "[matter-of-fact] Screen capture watches for change — web downsamples frames and pixel-diffs; the extension polls the visible tab every few seconds so coaching only fires when the desk actually moves.",
    "Capture · change detection, not a continuous dump",
  );
  await clearCaption();

  // Start lesson → live coach
  await panel.getByRole("button", { name: "Start", exact: true }).click();
  await sleep(400);

  await panel.getByRole("button", { name: /Share screen & start/i }).waitFor({ timeout: 12_000 });
  await panel.getByRole("button", { name: /Share screen & start/i }).click();
  await panel.locator(".live-coach-banner, .learn-session--live").first().waitFor({ timeout: 12_000 });
  await page.evaluate(() => window.miraPromo?.spotlight?.("ticket-alpine"));
  await sleep(400);

  await say(
    "[intense] Teach watches the learner’s screen, asks through vision plus transcript, then speaks with ElevenLabs TTS. Conversational push-to-talk uses ElevenLabs Scribe.",
    "ElevenLabs · TTS + Scribe STT",
  );
  await page.evaluate(() =>
    window.miraPromo?.tutor?.({
      action: "intervene",
      speak:
        "Jordan would stop here. Competitor comparisons go to your lead the same day — don't answer alone.",
      stepIndex: 2,
      guardrailId: "g2",
      stepId: "s3",
      replayMomentId: "m2",
      explain: "Competitor comparison always goes up the same day.",
      requestHighlight: false,
    }),
  );
  await panel.locator(".coach-box--stop").waitFor({ timeout: 8_000 });
  await sleep(2400);
  await clearCaption();

  // ——— 6. Stack endcard ———
  await say(
    "[confident] Stack: Next.js on Vercel, Firebase Auth and Firestore, ElevenLabs Scribe and TTS, vision models for live coaching — shared policy in packages/core.",
    "Vercel · Firebase · ElevenLabs · packages/core",
  );
  await clearCaption();

  lines.push({
    atMs: Date.now() - t0,
    text: "[softly] One map coaches people today — and permissions agents tomorrow.",
  });
  await page.evaluate(() => {
    window.miraPromo?.showEndcard?.({ technical: true });
  });
  await sleep(estimateSpeechMs("One map coaches people today — and permissions agents tomorrow.") + 600);

  const video = page.video();
  await page.close();
  const tempPath = await video.path();
  await context.close();
  await browser.close();

  const silentPath = path.join(OUT_DIR, `${BASENAME}.silent.webm`);
  await copyFile(tempPath, silentPath);

  const leftovers = await readdir(OUT_DIR);
  for (const name of leftovers) {
    if (
      name.endsWith(".webm") &&
      !name.startsWith("mira-extension-promo") &&
      !name.startsWith(BASENAME)
    ) {
      await unlink(path.join(OUT_DIR, name)).catch(() => {});
    }
  }
  if (tempPath !== silentPath) await unlink(tempPath).catch(() => {});

  console.log(`\nSilent capture → ${silentPath}`);
  console.log(`Muxing ${lines.length} narration lines (expressive promo voice)…`);

  const { webmOut, mp4Out, durationSec } = await muxNarration({
    videoPath: silentPath,
    lines,
    outDir: OUT_DIR,
    basename: BASENAME,
    promo: true,
  });

  await unlink(silentPath).catch(() => {});

  console.log(`\nTechnical walkthrough:`);
  console.log(`  ${webmOut}`);
  console.log(`  ${mp4Out}`);
  console.log(`  (~${durationSec.toFixed(1)}s)`);
  console.log(`\n  Voice: George (promo) via /api/speak?promo — override with ELEVENLABS_PROMO_VOICE_ID`);
  console.log(`  open "${mp4Out}"\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
