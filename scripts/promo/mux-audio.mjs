/**
 * Build a timed voiceover track and mux it onto a silent promo video.
 *
 * Prefers ElevenLabs via the local /api/speak route; falls back to macOS `say`.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const FFMPEG = process.env.FFMPEG_PATH || path.join(ROOT, "tools/ffmpeg/ffmpeg");
const ORIGIN = process.env.MIRA_ORIGIN || "http://localhost:3000";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function ensureFfmpeg() {
  try {
    await access(FFMPEG);
  } catch {
    throw new Error(`ffmpeg not found at ${FFMPEG}`);
  }
}

async function speakEleven(text, outPath) {
  const res = await fetch(`${ORIGIN}/api/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`speak API ${res.status}: ${detail.slice(0, 200)}`);
  }
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
}

async function speakSay(text, outPath) {
  const aiff = outPath.replace(/\.mp3$/i, ".aiff");
  const said = await run("say", ["-v", "Daniel", "-r", "185", "-o", aiff, text]);
  if (said.code !== 0) throw new Error(said.stderr || "say failed");
  const conv = await run(FFMPEG, ["-y", "-i", aiff, "-ar", "44100", "-ac", "1", outPath]);
  if (conv.code !== 0) throw new Error(conv.stderr.slice(-400));
  await rm(aiff, { force: true });
}

function parseDuration(stderr) {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 30;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export async function muxNarration({ videoPath, lines, outDir, basename = "mira-extension-promo" }) {
  await ensureFfmpeg();
  await mkdir(outDir, { recursive: true });
  const work = path.join(outDir, ".audio-work");
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });

  const clips = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = String(line.text || "").trim();
    if (!text) continue;
    const mp3 = path.join(work, `line-${String(i).padStart(2, "0")}.mp3`);
    try {
      await speakEleven(text, mp3);
      console.log(`  audio[${i}] elevenlabs · ${text.slice(0, 64)}`);
    } catch (err) {
      console.warn(`  audio[${i}] elevenlabs failed (${err.message}); using macOS say`);
      await speakSay(text, mp3);
    }
    clips.push({ path: mp3, atMs: Math.max(0, Number(line.atMs) || 0) });
  }

  if (!clips.length) throw new Error("No narration clips generated");

  const probe = await run(FFMPEG, ["-i", videoPath]);
  const durationSec = parseDuration(probe.stderr);

  const inputs = ["-i", videoPath];
  for (const clip of clips) inputs.push("-i", clip.path);

  const delays = clips.map((c, i) => {
    const ms = Math.round(c.atMs);
    return `[${i + 1}:a]adelay=${ms}|${ms},volume=1.12[a${i}]`;
  });
  const mixInputs = clips.map((_, i) => `[a${i}]`).join("");
  const filter = `${delays.join(";")};${mixInputs}amix=inputs=${clips.length}:dropout_transition=0:normalize=0[aout]`;

  const webmOut = path.join(outDir, `${basename}.webm`);
  const mp4Out = path.join(outDir, `${basename}.mp4`);
  const voiced = path.join(work, "voiced.webm");

  const mux = await run(FFMPEG, [
    "-y",
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "libopus",
    "-shortest",
    voiced,
  ]);
  if (mux.code !== 0) throw new Error(`mux failed\n${mux.stderr.slice(-1000)}`);

  const copyWebm = await run(FFMPEG, ["-y", "-i", voiced, "-c", "copy", webmOut]);
  if (copyWebm.code !== 0) throw new Error(copyWebm.stderr.slice(-400));

  const mp4 = await run(FFMPEG, [
    "-y",
    "-i",
    voiced,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    mp4Out,
  ]);
  if (mp4.code !== 0) throw new Error(`mp4 encode failed\n${mp4.stderr.slice(-1000)}`);

  await rm(work, { recursive: true, force: true });
  return { webmOut, mp4Out, durationSec };
}
