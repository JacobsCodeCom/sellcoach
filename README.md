# Mira

Monorepo with the product app and vertical demo sandboxes:

| App | Path | Port | What it is |
|-----|------|------|------------|
| **Product** | [`apps/web`](apps/web) | 3000 | Mira — landing, owner admin, employee workspace, role-based roadmaps |
| **Logistics example** | [`apps/demo`](apps/demo) | 3001 | Northlane / Relay dispatch desk demo — **not** the product |
| **AP example** | [`apps/demo-ap`](apps/demo-ap) | 3002 | Meridian accounts payable desk (Challenge 01) — **not** the product |
| **Support example** | [`apps/demo-support`](apps/demo-support) | 3003 | Acme Ops support escalations desk — **not** the product |

Shared domain types and compilers live in [`packages/core`](packages/core).

## Setup

```bash
pnpm install
```

## Develop

```bash
pnpm dev:web            # product at http://localhost:3000
pnpm dev:demo           # logistics example at http://localhost:3001
pnpm dev:demo-ap        # AP example at http://localhost:3002
pnpm dev:demo-support   # support example at http://localhost:3003
```

## Product model (short)

1. Owner creates a company and **work roles** (title, seniority, competence).
2. Owner creates member accounts and assigns roles.
3. Experienced members **capture** teach-backs → lessons compile automatically.
4. New hires get a **roadmap** of lessons from more senior / higher-competence people with the same title.

Persistence in this build is a localStorage repository shaped for a later Firebase Auth + Firestore swap.
