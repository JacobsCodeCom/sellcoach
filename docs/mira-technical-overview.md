# Mira — Technical walkthrough (≤60s)

**Upload:** Technical walkthrough · MP4/MOV · max 60s  
**Not this video:** Product demo (separate)

Tone: cutthroat, systems language. No taglines, no “your team learns from its best people.” That’s the other video.

---

## What to prove

1. **Sits on top of existing tools** — no SDK into the ERP/CRM, no vendor integration project.  
2. **Two clients, one backend** — MV3 side panel + Next.js admin.  
3. **Pipeline** — capture (screen + Scribe + live ask) → confirmed Work Map → roadmap / tutor.  
4. **Where compute lives** — Vercel APIs, Firebase, ElevenLabs, Anthropic, `packages/core`.

---

## ~55s script

| Time | Picture | Line |
|------|---------|------|
| **0–8s** | Desk app unchanged + Mira side panel overlay | “Mira does not integrate into your stack. It rides on top — Chrome side panel beside whatever tool you already use. Hook on, hook off. No SDK, no changes to the underlying system.” |
| **8–16s** | Side panel + Admin (hard cut) | “Two clients: extension for capture and learn at the desk; web admin for company state. Same APIs.” |
| **16–28s** | Pipeline: frames + Scribe → quiet ask | “Capture samples the tab when the screen changes, streams audio through ElevenLabs Scribe, and an apprentice asks on quiet windows — vision plus transcript, model-routed through Anthropic.” |
| **28–38s** | Work Map fields only | “Session closes with debrief and expert teach-back. Persist a Work Map: decision, reason, guardrail, linked moment. Not a video file as the source of truth.” |
| **38–48s** | compileCaptureTasks / roadmap arrow | “Company context — including Notion people and topics — compiles capture tasks for experts and lessons onto learner roadmaps. Shared rules in packages/core.” |
| **48–55s** | Stack strip | “Next.js on Vercel, Firebase auth and data, ElevenLabs voice, LLM for ask/map/tutor. Extension is a thin shell. Host app untouched.” |
| **55–60s** | Text: Capture → Map → Teach | “Capture → Map → Teach. Same map can constrain agents later.” |

**Endcard (text only)**  
`On top of your tools · no host integration`  
`Capture → Map → Teach`  
`MV3 + Next.js · packages/core`

---

## Architecture (one graphic)

```
Host app (ERP / CRM / inbox)     ← unchanged
        │
        │  observes / coaches beside (no API into host)
        ▼
Chrome MV3 side panel  →  embeds /ext
        │
        ▼
Next.js (Vercel) APIs
  ├── Firebase Auth + Firestore
  ├── ElevenLabs Scribe + TTS
  ├── Anthropic (OpenAI fallback)
  ├── Notion (optional bootstrap)
  └── packages/core
```

**Hook on / hook off:** load or remove the extension; host software never imported Mira as a dependency.

---

## Stack (facts)

| Piece | Tech |
|-------|------|
| Desk client | Chrome MV3 · iframe `/ext` · tab capture + mic |
| Admin / APIs | Next.js · Vercel |
| State | Firebase Auth · Firestore |
| Voice | ElevenLabs Scribe · TTS |
| Models | Anthropic primary · OpenAI fallback |
| Domain | `packages/core` — apprentice timing, Work Map, tutor, capture tasks, redact |
| Optional ingest | Notion API → people + knowledge → task/lesson compile |

---

## Techniques (name them, don’t sell them)

- **No host integration** — pixel/tab observation + side panel; zero code in customer systems.  
- **Quiet-window ask policy** — interrupt on pause, guardrail-first, live bar before done.  
- **Moments not movies** — change-triggered frames + quotes as evidence.  
- **Teach-back gate** — expert confirms map before publish.  
- **Deterministic task/roadmap compile** — role + coverage gaps (Notion-assisted).  
- **Redact + off-record** — before model calls; capture only after Start.

---

## Cut list

**Keep:** overlay model, pipeline, Work Map schema, stack, packages/core.  
**Cut:** onboarding story, “knowledge walking out the door,” long admin clicks, full coach session, moonshot poetry beyond one clause.
