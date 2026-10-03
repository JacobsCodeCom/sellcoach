"use client";

export type CoachResult = {
  hint: string;
  status: "on_track" | "risk" | "unclear";
  source: "model" | "fallback";
};

/** Grab a JPEG data URL from a video/display stream for coaching. */
export async function captureFrame(stream: MediaStream, maxWidth = 960): Promise<string | null> {
  const track = stream.getVideoTracks()[0];
  if (!track) return null;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Could not read screen frame"));
      void video.play().catch(reject);
    });
  } catch {
    video.srcObject = null;
    return null;
  }

  if (!video.videoWidth) {
    video.srcObject = null;
    return null;
  }

  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    video.srcObject = null;
    return null;
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  video.srcObject = null;
  return dataUrl;
}

export async function requestCoach(input: {
  title: string;
  passCriteria: string;
  summary?: string;
  image?: string | null;
}): Promise<CoachResult> {
  try {
    const response = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        passCriteria: input.passCriteria,
        summary: input.summary ?? "",
        image: input.image ?? undefined,
      }),
    });
    if (!response.ok) throw new Error("Coach failed");
    return (await response.json()) as CoachResult;
  } catch {
    return {
      hint: `Check whether your screen matches: ${input.passCriteria}`,
      status: "unclear",
      source: "fallback",
    };
  }
}
