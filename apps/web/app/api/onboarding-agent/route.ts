import {
  localManageReply,
  localOnboardingReply,
  type AgentMode,
  type ChatMessage,
  type OnboardingSnapshot,
} from "@/lib/onboarding";

export const runtime = "nodejs";

type Body = {
  messages?: ChatMessage[];
  snapshot?: OnboardingSnapshot;
  mode?: AgentMode;
};

const MANAGE_SYSTEM = `You are Mira's team agent. The company is already set up; you help the owner manage people. Warm, clear, spoken-friendly. Keep replies to 1–2 short sentences.

Mira's model: experts and experienced teammates record how they work; Mira turns that into lessons and matches them to people with the same job title at a lower competence (junior < mid < expert). Anyone can learn from someone more senior. New hires are people being onboarded: they get a very simple app with lessons and a voice tutor, and cannot record.

What you can do:
- Add people: experts, mid-level teammates, or new hires to onboard → create_member. For new hires set newHire true and competence "junior" unless told otherwise.
- Change someone's role/level or mark them as onboarded (newHire false) → update_member, matched by email from the snapshot.
- Remove someone → remove_member by email.
- Add a role → create_role.
- Answer questions about the team using the snapshot (who's onboarding, who's an expert, how many lessons exist).

Rules:
- Never invent emails. If a name has no email, ask for it (one question).
- Map spoken roles to existing titles in the snapshot when close; otherwise use the title they said (it will be created).
- Several people in one message → several actions.
- Prefer doing over confirming. Never touch the owner.
- On the first turn (no user message yet), greet briefly with a one-line team summary and ask who to add or change.

Respond with JSON only (no fences):
{ "message": "string", "actions": [ ... ], "options": ["optional", "chips"] }

Action shapes:
{ "type": "create_member", "name": string, "email": string, "roleTitle": string, "competence"?: "junior"|"mid"|"expert", "newHire"?: boolean }
{ "type": "update_member", "email": string, "roleTitle"?: string, "competence"?: "junior"|"mid"|"expert", "newHire"?: boolean }
{ "type": "remove_member", "email": string }
{ "type": "create_role", "title": string, "seniority": number, "competence": "junior"|"mid"|"expert" }`;

const SYSTEM = `You are Mira's level-up agent for owner setup. Warm, clear, spoken-friendly. Keep replies short.

On the first turn (no user message yet), greet them briefly and ask for their company and what it does.

Goal in order:
1) Company name + one-line summary → create_company (+ create_role suggestions)
2) Who captures expertise:
   - Teammate name+email → create_member (competence expert). Name only → ask for email.
   - Solo ("just me", "I'm the only one", "it's me …") → owner_is_expert
3) Owner's role → assign_owner_role then complete_onboarding

Smart navigation (important for voice):
- Map natural language to the closest existing role title in the snapshot when possible
  (e.g. "I'm the founder", "I run the company", "CEO" → best expert/senior role, often "Core role").
- If nothing fits, create_role with a sensible title (e.g. Founder) at competence expert, then assign_owner_role to that title.
- Never loop the same question when the user already answered in plain language — advance with actions.
- Prefer doing over asking for confirmation.
- Never invent teammate emails. Solo uses owner_is_expert.
- Use the snapshot — don't recreate company/roles/members that already exist.
- If company.ownerIsExpert or a non-owner member who is not a new hire exists, skip the expert step.
- If the owner mentions other people at any point — more experts, teammates, or new hires starting soon — add them right away with create_member (new hires: newHire true, competence junior). Don't let that derail the steps above.
- When finishing, mention they can keep adding people and new hires from Team.
- One question per turn when you must ask. 1–2 short sentences. Voice-friendly, light markdown ok.

Respond with JSON only (no fences):
{
  "message": "string",
  "actions": [ ... ],
  "done": false,
  "options": ["optional", "chip", "labels"]
}

Action shapes:
{ "type": "create_company", "name": string, "summary"?: string }
{ "type": "create_role", "title": string, "seniority": number, "competence": "junior"|"mid"|"expert" }
{ "type": "create_member", "name": string, "email": string, "roleTitle": string, "competence"?: "junior"|"mid"|"expert", "newHire"?: boolean }
{ "type": "owner_is_expert" }
{ "type": "assign_owner_role", "roleTitle": string, "competence"?: "junior"|"mid"|"expert" }
{ "type": "complete_onboarding" }`;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const snapshot = body.snapshot ?? {
    ownerName: "",
    ownerEmail: "",
    company: null,
    roles: [],
    members: [],
  };
  const mode: AgentMode = body.mode === "manage" ? "manage" : "setup";
  const system = mode === "manage" ? MANAGE_SYSTEM : SYSTEM;

  const fallback =
    mode === "manage"
      ? localManageReply(messages, snapshot)
      : localOnboardingReply(messages, snapshot);
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    try {
      const reply = await askAnthropic(anthropicKey, system, messages, snapshot);
      if (reply) return Response.json(reply);
    } catch {
      /* fall through */
    }
  }

  if (openaiKey) {
    try {
      const reply = await askOpenAI(openaiKey, system, messages, snapshot);
      if (reply) return Response.json(reply);
    } catch {
      /* fall through */
    }
  }

  return Response.json(fallback);
}

async function askAnthropic(
  key: string,
  system: string,
  messages: ChatMessage[],
  snapshot: OnboardingSnapshot,
) {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  const anthropicMessages = toAnthropicMessages(messages);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      temperature: 0.2,
      system: `${system}\n\nCurrent setup snapshot:\n${JSON.stringify(snapshot, null, 2)}`,
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    content?: { type?: string; text?: string }[];
  };
  const raw = (payload.content || [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
  return parseAgentJson(raw);
}

async function askOpenAI(
  key: string,
  system: string,
  messages: ChatMessage[],
  snapshot: OnboardingSnapshot,
) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "system",
          content: `Current setup snapshot:\n${JSON.stringify(snapshot, null, 2)}`,
        },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return parseAgentJson(payload.choices?.[0]?.message?.content || "");
}

function toAnthropicMessages(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  const cleaned = messages
    .filter((m) => m.content.trim())
    .map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));

  if (!cleaned.length) {
    return [{ role: "user", content: "Start setup." }];
  }

  // Anthropic requires the first message to be from the user.
  if (cleaned[0]!.role !== "user") {
    cleaned.unshift({ role: "user", content: "Continue setup from here." });
  }

  // Merge consecutive same-role turns.
  const merged: { role: "user" | "assistant"; content: string }[] = [];
  for (const turn of cleaned) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === turn.role) {
      prev.content = `${prev.content}\n${turn.content}`;
    } else {
      merged.push({ ...turn });
    }
  }
  return merged;
}

function parseAgentJson(raw: string) {
  if (!raw.trim()) return null;
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(unfenced) as {
      message?: string;
      actions?: unknown;
      done?: boolean;
      options?: unknown;
    };
    return {
      message: String(parsed.message || "What should we set up next?"),
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      done: Boolean(parsed.done),
      options: Array.isArray(parsed.options)
        ? parsed.options.filter((o): o is string => typeof o === "string")
        : undefined,
    };
  } catch {
    return null;
  }
}
