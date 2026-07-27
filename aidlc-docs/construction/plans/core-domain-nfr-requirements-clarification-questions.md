# NFR Requirements — Clarification Questions (`core-domain`)

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION · **Unit**: `core-domain` · **Stage**: NFR Requirements (clarification round 1)
**Source**: Mandatory Step 5 analysis of answers in `core-domain-nfr-requirements-plan.md`
**Resolved 2026-07-25T12:05:00Z** — user answered "A": revert to Vite + React SPA. All previously approved decisions (unit plan Q3:A single Node process, Q4:A Fastify) remain intact; nothing required revision. Q10 Jest note acknowledged, no change.

Thirteen of your fourteen answers are consistent and give a clean, conventional stack:
**PostgreSQL** · query builder with hand-written SQL for the allocation queries · library-native
migrations · **Fastify** · TanStack Query · **date-fns** · Zod · Tailwind with hand-built components ·
Jest · Node 22 with npm · `strict` plus `noUncheckedIndexedAccess` · request logging and a health
endpoint · existing NFR targets confirmed. Every one of those fits the functional design.

**Q5:B (Next.js) conflicts with two decisions you already approved.** It needs resolving before I write
the stack document, because it changes the deployment topology.

---

## Contradiction 1: Next.js versus the single-Node-process deployment and Fastify

**Q5: B** selects **Next.js**. Two approved decisions point the other way:

- **Unit plan Q3:A** — "**Single deployable monolith** — one Node.js API process plus one React build, with units as logical modules inside it." Next.js is not a React build; it is itself a **Node server**.
- **Q4:A of this plan** — **Fastify** as the API framework, with a thin route layer doing shape validation and session resolution only.

Running Next.js as a server *and* Fastify as the API means **two Node processes**, which contradicts the
single-deployable decision. Dropping Fastify and using Next.js route handlers as the API instead
contradicts Q4:A — and moves the route layer inside the frontend framework, which puts pressure on the
layering invariant behind **US-ENB-04** (business rules must sit below the route layer, reachable
identically by any client).

There is a third possibility that keeps everything: **Next.js as a build tool only**, with static export.

Two secondary frictions, worth knowing but not decisive:

- Next.js file-based routing wants routes at a fixed location (`app/` or `pages/`), which sits awkwardly with the approved `frontend/src/{unit-name}/` layout (unit plan Q4:A). Workable via a thin route directory delegating into unit folders, but it is extra structure.
- Next.js brings SSR, streaming, and server components — capability an authenticated internal SPA for 200 people does not use, and which adds surface to reason about.

### Clarification Question 1
How should this be resolved?

A) **Revert to Vite + React SPA** — the original recommendation. One Node process (Fastify) serving the API and the built static assets. Everything already approved stays intact and nothing needs revising.

B) **Keep Next.js, but as a build tool only — static export** (`output: 'export'`), no Next server. The Fastify container serves the exported static files. You keep Next.js's routing conventions, file structure, and developer experience; Fastify remains the sole API and the sole Node process; unit plan Q3:A and Q4:A both hold. **This is my recommendation if you want Next.js specifically.**

C) **Keep Next.js as a server and drop Fastify** — Next.js route handlers become the API layer. Requires revising Q4:A. I would want to add an explicit guard that no business rule lands in a route handler, to protect US-ENB-04.

D) **Keep both Next.js server and Fastify as two processes** — requires revising unit plan Q3:A from "single deployable" to two containers in the compose file. More operational surface for an on-premises install than this system needs, but it is the conventional Next.js + separate-API arrangement.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Note on Question 10 — Jest (not a contradiction, just a consequence)

You chose **Jest** over Vitest. No conflict — I record it and move on. One practical note so it is not a
surprise during Code Generation: with TypeScript, ESM, and a Vite-or-Next frontend, Jest needs more
configuration than Vitest does (transform setup, ESM handling, and a separate config per workspace).
That is a one-time cost, and Jest is the more widely known runner. If the configuration turns out to
fight the toolchain during Code Generation, I will flag it rather than silently switch.

No answer needed here unless you want to revisit the choice.
