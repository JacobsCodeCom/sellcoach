#!/usr/bin/env node
/**
 * Build a Chrome Web Store zip from apps/extension.
 * Usage: pnpm extension:pack
 */

import { mkdir, cp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(EXT_ROOT, "dist", "store");
const ZIP_PATH = path.join(EXT_ROOT, "dist", "mira-chrome-extension.zip");
const PRODUCTION_ORIGIN = "https://mira.jacobscode.com";

const INCLUDE = [
  "manifest.json",
  "background.js",
  "sidepanel.html",
  "sidepanel.js",
  "sidepanel.css",
  "capture-bridge.js",
  "highlight-overlay.js",
  "request-mic.html",
  "request-mic.js",
  "config.js",
  "icons",
];

async function main() {
  await rm(path.join(EXT_ROOT, "dist"), { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  for (const name of INCLUDE) {
    await cp(path.join(EXT_ROOT, name), path.join(OUT_DIR, name), { recursive: true });
  }

  const manifest = JSON.parse(await readFile(path.join(OUT_DIR, "manifest.json"), "utf8"));
  manifest.homepage_url = PRODUCTION_ORIGIN;
  manifest.host_permissions = ["http://*/*", "https://*/*"];
  manifest.externally_connectable = { matches: [`${PRODUCTION_ORIGIN}/*`] };
  delete manifest.key;
  await writeFile(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  await writeFile(
    path.join(OUT_DIR, "config.js"),
    `/** Production store build — do not edit by hand; regenerate with pnpm extension:pack */
export const DEFAULT_MIRA_ORIGIN = ${JSON.stringify(PRODUCTION_ORIGIN)};
export const ALLOW_ORIGIN_OVERRIDE = false;

export function isAllowedMiraOrigin(origin) {
  return origin === DEFAULT_MIRA_ORIGIN;
}
`,
  );

  const zip = spawnSync(
    "zip",
    ["-r", "-X", ZIP_PATH, ".", "-x", "*.DS_Store"],
    { cwd: OUT_DIR, encoding: "utf8" },
  );
  if (zip.status !== 0) {
    throw new Error(zip.stderr || zip.stdout || "zip failed");
  }

  console.log(`Store package ready:
  ${ZIP_PATH}

Upload that zip in the Chrome Web Store Developer Dashboard.

Privacy policy URL:
  ${PRODUCTION_ORIGIN}/privacy

Permission justifications (paste into Privacy practices):
  sidePanel — Opens Mira Learn/Record UI beside the browser while people work.
  storage — Remembers mic-setup completion; store build does not store custom origins.
  tabs — Reads the active tab URL during Work Map capture and opens the one-time mic permission page.
  scripting — Injects a short-lived coaching highlight overlay on the active work tab during Learn.
  Host access (http/https) — Captures visible-tab screenshots and coaching highlights on the tools people actually use (any http/https work site). Mira never requests chrome:// or file://.

Single purpose:
  Help company teams learn from how their experts work: guided coaching and recording Work Maps.

Remote code:
  No. The extension shell is self-contained. The side panel iframe loads the Mira web app (${PRODUCTION_ORIGIN}) for account UI; capture APIs stay in the extension package.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
