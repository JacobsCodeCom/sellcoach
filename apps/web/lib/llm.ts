type AskJsonInput = {
  system: string;
  user: unknown;
  /** JPEG/PNG data URLs. */
  images?: string[];
  maxTokens?: number;
  timeoutMs?: number;
  /** Override model id (provider-specific). */
  model?: string;
  /**
   * `latency` prefers Haiku / mini for conversational teach/tutor turns.
   * `quality` keeps the default Sonnet / stronger model (Work Map compile, etc.).
   */
  priority?: "latency" | "quality";
};

function anthropicModelFor(priority: "latency" | "quality", override?: string): string {
  if (override) return override;
  if (priority === "latency") {
    return process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-5";
  }
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
}

function openaiModelFor(priority: "latency" | "quality", override?: string): string {
  if (override) return override;
  if (priority === "latency") {
    return process.env.OPENAI_FAST_MODEL || "gpt-4o-mini";
  }
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function parseJson(raw: string): unknown {
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!unfenced) return null;
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function splitDataUrl(url: string): { mediaType: string; data: string } | null {
  const match = url.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  return match ? { mediaType: match[1], data: match[2] } : null;
}

/** Ask Claude (or OpenAI) for a JSON object. Returns null when no key is set or the call fails. */
export async function askJson({
  system,
  user,
  images = [],
  maxTokens = 600,
  timeoutMs = 25_000,
  model,
  priority = "quality",
}: AskJsonInput) {
  const text = typeof user === "string" ? user : JSON.stringify(user);
  const signal = AbortSignal.timeout(timeoutMs);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const content = [
        ...images
          .map(splitDataUrl)
          .filter((img): img is NonNullable<typeof img> => Boolean(img))
          .map((img) => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } })),
        { type: "text", text },
      ];
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: anthropicModelFor(priority, model),
          max_tokens: maxTokens,
          temperature: 0.3,
          system: `${system}\n\nRespond with JSON only, no code fences.`,
          messages: [{ role: "user", content }],
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { content?: { type?: string; text?: string }[] };
        const raw = (payload.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
        const parsed = parseJson(raw);
        if (parsed) return parsed;
      } else {
        console.warn("[llm] anthropic", response.status, (await response.text()).slice(0, 200));
      }
    } catch (err) {
      console.warn("[llm] anthropic failed", err instanceof Error ? err.message : err);
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const sendImages = images.length > 0 && process.env.OPENAI_NO_VISION !== "1";
      const content = [
        { type: "text", text },
        ...(sendImages ? images.map((url) => ({ type: "image_url", image_url: { url } })) : []),
      ];
      // Any OpenAI-compatible provider (Moonshot/Kimi, Groq, OpenRouter, a local server…) via OPENAI_BASE_URL.
      const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal,
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: openaiModelFor(priority, model),
          temperature: 0.3,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content },
          ],
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
        const parsed = parseJson(payload.choices?.[0]?.message?.content || "");
        if (parsed) return parsed;
      } else {
        console.warn("[llm] openai-compatible", response.status, (await response.text()).slice(0, 200));
      }
    } catch (err) {
      console.warn("[llm] openai failed", err instanceof Error ? err.message : err);
    }
  }

  return null;
}
