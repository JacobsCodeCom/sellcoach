/**
 * Build a timed voiceover track and mux it onto a silent promo video.
 *
 * Prefers ElevenLabs via the local /api/speak route; falls back to macOS `say`.
 * Clips are de-overlapped by measured duration so narration never stacks.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const FFMPEG = process.env.FFMPEG_PATH || path.join(ROOT, "tools/ffmpeg/ffmpeg");
const ORIGIN = process.env.MIRA_ORIGIN || "http://localhost:3000";
/** Minimum silence between VO lines after de-overlap. */
const GAP_MS = 320;

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

async function speakEleven(text, outPath, { promo = false } = {}) {
  const res = await fetch(`${ORIGIN}/api/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, promo }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`speak API ${res.status}: ${detail.slice(0, 200)}`);
  }
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
}

async function speakSay(text, outPath) {
  const plain = text.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
  const aiff = outPath.replace(/\.mp3$/i, ".aiff");
  const said = await run("say", ["-v", "Daniel", "-r", "175", "-o", aiff, plain]);
  if (said.code !== 0) throw new Error(said.stderr || "say failed");
  const conv = await run(FFMPEG, ["-y", "-i", aiff, "-ar", "44100", "-ac", "1", outPath]);
  if (conv.code !== 0) throw new Error(conv.stderr.slice(-400));
  await rm(aiff, { force: true });
}

function parseDuration(stderr) {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function probeDurationSec(filePath) {
  const probe = await run(FFMPEG, ["-i", filePath]);
  return parseDuration(probe.stderr);
}

/** Push clips forward so each starts only after the previous one finishes. */
function deOverlap(clips) {
  let cursor = 0;
  return clips.map((clip) => {
    const start = Math.max(clip.atMs, cursor);
    const next = { ...clip, atMs: start };
    cursor = start + clip.durationMs + GAP_MS;
    return next;
  });
}

export async function muxNarration({
  videoPath,
  lines,
  outDir,
  basename = "mira-extension-promo",
  promo = false,
}) {
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
      await speakEleven(text, mp3, { promo });
      console.log(`  audio[${i}] elevenlabs${promo ? "·promo" : ""} · ${text.slice(0, 64)}`);
    } catch (err) {
      console.warn(`  audio[${i}] elevenlabs failed (${err.message}); using macOS say`);
      await speakSay(text, mp3);
    }
    const durationSec = await probeDurationSec(mp3);
    clips.push({
      path: mp3,
      atMs: Math.max(0, Number(line.atMs) || 0),
      durationMs: Math.max(200, Math.round(durationSec * 1000)),
    });
  }

  if (!clips.length) throw new Error("No narration clips generated");

  const scheduled = deOverlap(clips);
  for (let i = 0; i < scheduled.length; i++) {
    const c = scheduled[i];
    if (c.atMs !== clips[i].atMs) {
      console.log(`  audio[${i}] shifted ${clips[i].atMs}ms → ${c.atMs}ms (avoid overlap)`);
    }
  }

  const videoDurationSec = await probeDurationSec(videoPath);
  const audioEndSec =
    (scheduled[scheduled.length - 1].atMs + scheduled[scheduled.length - 1].durationMs) / 1000;
  const padSec = Math.max(0, audioEndSec + 0.35 - videoDurationSec);

  let videoInput = videoPath;
  if (padSec > 0.05) {
    const padded = path.join(work, "padded.webm");
    console.log(`  padding video +${padSec.toFixed(2)}s so VO can finish`);
    const pad = await run(FFMPEG, [
      "-y",
      "-i",
      videoPath,
      "-vf",
      `tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}`,
      "-an",
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "32",
      "-b:v",
      "0",
      padded,
    ]);
    if (pad.code !== 0) throw new Error(`video pad failed\n${pad.stderr.slice(-800)}`);
    videoInput = padded;
  }

  const inputs = ["-i", videoInput];
  for (const clip of scheduled) inputs.push("-i", clip.path);

  const delays = scheduled.map((c, i) => {
    const ms = Math.round(c.atMs);
    return `[${i + 1}:a]adelay=${ms}|${ms},volume=1.15[a${i}]`;
  });
  const mixInputs = scheduled.map((_, i) => `[a${i}]`).join("");
  const filter = `${delays.join(";")};${mixInputs}amix=inputs=${scheduled.length}:dropout_transition=0:normalize=0[aout]`;

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

  const durationSec = await probeDurationSec(mp4Out);
  await rm(work, { recursive: true, force: true });
  return { webmOut, mp4Out, durationSec };
}

/** Rough hold so on-screen pacing tracks VO before mux. */
export function estimateSpeechMs(text) {
  const plain = String(text || "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = plain ? plain.split(" ").length : 0;
  return Math.round((words / 2.35) * 1000) + 500;
}
