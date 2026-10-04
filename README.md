# Mira — The AI Apprentice

**Hack-Nation × ElevenLabs · 7th Global AI Hackathon · Challenge 01**

Experts share their screen and talk through real work. Mira asks *why* at natural pauses, turns the session into a clickable **Work Map** (steps, judgment calls, guardrails linked to screen moments and the expert’s own words), then coaches a new hire on *their* screen before they break a rule.

> Your team learns from its best people — before that knowledge walks out the door.

**Live product:** [mira.jacobscode.com](https://mira.jacobscode.com)

---

## The problem

Knowledge lives in heads. Recordings show *what*, not *why*. Guardrails — limits, exceptions, when to stop and ask — are almost never written down. New hires learn them by breaking them.

Mira is an **apprentice, not a recorder**: it asks until the rules are clear, then teaches the next person to decide the way the expert would.

---

## Modules (Capture → Map → Teach)

### 1. Capture

The expert shares their screen (web app or Chrome side panel) and works a real task.

- Frames are sampled and turned into **screen events** (what changed), not a dump of video.
- **ElevenLabs Scribe** listens while they work; the apprentice stays quiet while they type, read, or talk.
- At natural pauses it asks short spoken questions grounded in what is on screen: *why this step*, *is there a limit*, *when would you stop and ask?*
- Prefer a **guardrail** question early. Off-the-record pauses capture and questions immediately.

### 2. Map

When the task ends, a short **debrief** closes gaps the live pass missed, then Mira explains the process back as a teach-back.

The result is a **Work Map**: a clickable timeline where every step shows:

| Field | Example |
|--------|---------|
| Screen moment | 03:12 — invoice 4471, cost center field |
| Decision | Re-coded opex → capex |
| Reason | Expert’s words from the live question |
| Guardrails | No asset number → no capex; unknown supplier → stop and ask |

Steps and guardrails link to a **screen moment** and a **quote**. Publish once the expert confirms the map.

### 3. Teach

A new hire works a case on their own screen while a voice tutor watches the Work Map.

- Guides with the expert’s wording; asks them to **predict** the next decision.
- **Intervenes** before a guardrail is broken (“Sabine would stop here…”) and can **replay** the expert’s screen moment.
- Ends with practice cases the expert never showed, plus what they mastered and what to practice next.

---

## Judge demo (recommended path)

Use the **Meridian AP desk** as customer software. Mira (web Capture or Chrome extension) watches the screen — Meridian itself has no apprentice, voice, or coach UI.

| Step | What to show | Where |
|------|----------------|-------|
| 1 | Expert processes invoices on Meridian while Mira asks at pauses (≥1 guardrail) | `pnpm dev:demo-ap` → [localhost:3002](http://localhost:3002) + Mira Capture / extension |
| 2 | Debrief follow-ups → teach-back → Work Map with linked moments | Mira Capture → Map / debrief |
| 3 | New hire opens Meridian; Mira tutor stops a wrong coding before save | Mira Learn + Meridian desk |
| 4 | Trust: off-the-record + redaction story | Capture UI + privacy notes below |
| 5 | Moonshot: people first, then agents — the map is the permission | Pitch close |

**Bar from the brief:** calm questions at pauses → debrief closes gaps → Work Map with judgment + guardrails → tutor catches a wrong decision on a novel case using the expert’s reason.

---

## The Apprentice Test

| Question | How Mira answers it |
|----------|---------------------|
| **When to ask?** | Quiet window (~3.5s), not mid-typing/speech, shorter gap until ≥3 live asks (incl. ≥1 guardrail), then normal spacing. Off-the-record disables questions. Done is locked until the live bar is met. |
| **What to ask?** | Vision + transcript → questions about *why*, limits, exceptions — preferring a guardrail if none yet. Grounded in what is visible, not generic prompts. |
| **When has it understood?** | Debrief asks ≥3 follow-ups that were not answered live, then a teach-back the expert must confirm (or correct) before publish. |
| **Did the new hire learn?** | Live coach + practice cases the expert never showed; report of stops / passes and what to practice next. |
| **Trust?** | Off-the-record; PII-style redaction before model calls; capture only after Start (no always-on background record); invite-bound company membership. |

---

## Stack

| Layer | Choice |
|-------|--------|
| Voice (listen) | **ElevenLabs Scribe** (`scribe_v2_realtime`) |
| Voice (speak) | **ElevenLabs TTS** (expressive tags where useful) |
| Screen understanding | Vision-capable LLM (Anthropic / OpenAI) → events + questions |
| Apprentice / tutor brain | LLM routes for live ask, Work Map compile, live teach |
| Product | Next.js app + Chrome MV3 extension side panel |
| Domain | Shared Work Map / apprentice / tutor logic in `packages/core` |
| Demo desks | Meridian AP, Northlane logistics, Acme Ops support (sandboxes, not the product) |

ElevenLabs is the voice layer the expert and new hire hear and speak through. Optional demo path can attach a Conversational Agent id where configured.

---

## Repo layout

| Path | Port | What it is |
|------|------|------------|
| [`apps/web`](apps/web) | 3000 | **Mira** — landing, admin, capture, Work Map, learn / tutor, `/ext` for the extension |
| [`apps/extension`](apps/extension) | — | Chrome MV3 side panel (embeds `/ext`) |
| [`apps/demo-ap`](apps/demo-ap) | 3002 | Meridian AP desk only (sandbox ERP for Mira to watch) |
| [`apps/demo`](apps/demo) | 3001 | Northlane / Relay dispatch example |
| [`apps/demo-support`](apps/demo-support) | 3003 | Acme Ops support escalations example |
| [`packages/core`](packages/core) | — | Work Map types, apprentice timing, tutor + practice compilers |

---

## Setup

**Requires:** Node ≥ 20, [pnpm](https://pnpm.io) 9.

```bash
pnpm install
```

Create `apps/web/.env.local` (and demo `.env.local` if you run those apps):

```bash
# Voice (required for speak / Scribe)
ELEVENLABS_API_KEY=
# Optional:
# ELEVENLABS_VOICE_ID=
# ELEVENLABS_MODEL_ID=

# LLM for questions, Work Map, tutor (at least one)
ANTHROPIC_API_KEY=
# OPENAI_API_KEY=

# Optional product
# NEXT_PUBLIC_APP_URL=http://localhost:3000
# NEXT_PUBLIC_DEMO_AP_URL=http://localhost:3002
# NEXT_PUBLIC_ELEVENLABS_AGENT_ID=   # demo Conversational Agent path
```

### Develop

```bash
pnpm dev:web            # Mira → http://localhost:3000
pnpm dev:extension      # load unpacked apps/extension (points at local Mira)
pnpm extension:pack     # Chrome Web Store zip → apps/extension/dist/
pnpm dev:demo-ap        # Meridian AP → http://localhost:3002
pnpm dev:demo           # logistics → :3001
pnpm dev:demo-support   # support → :3003
```

Experts record from the web Capture flow or the Chrome extension. Admins invite people by email; **membership** (not email domain) binds captures to the company.

---

## Moonshot

**MVP today:** one expert → one task → one Work Map → one new hire coached on a novel case.

**Next:** the Work Map becomes living company memory and the **permission layer** for agents — routine steps only move when a confirmed map says so; people keep the judgment calls. Voice in, sparse hints, agents last.

That is the pitch close: capture judgment once; teach people and, later, constrain agents with the same map.

---

## Privacy (short)

- Capture starts only when the expert presses Start.
- **Off the record** pauses transcript, questions, and moments.
- Sensitive patterns (email, phone, card, IBAN-style) are redacted before model calls.
- See the in-app [Privacy](apps/web/app/privacy/page.tsx) page for the full product statement.

---

## Challenge brief

Participant brief: [`01.pdf`](01.pdf) (Hack-Nation × ElevenLabs — The AI Apprentice).
