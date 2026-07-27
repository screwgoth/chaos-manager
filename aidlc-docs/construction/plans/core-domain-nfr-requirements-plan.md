# NFR Requirements Plan — `core-domain`

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION · **Unit**: `core-domain` (1 of 2) · **Stage**: NFR Requirements
**Date**: 2026-07-25
**Status**: All 14 answers received; Q5 revised to Vite at CQ1:A. Generation COMPLETE — all checklist steps [x].

## Resolved Stack

PostgreSQL 16+ · Kysely with hand-written allocation SQL · Kysely migrator · Fastify · **Vite + React SPA** (Q5:B Next.js reverted at CQ1:A) · TanStack Query v5 · date-fns with date-only UTC convention · Zod · Tailwind hand-built · Jest · Node 22 LTS + npm · strict + noUncheckedIndexedAccess · request logging + /health · NFR targets confirmed unchanged.

**OD-01 CLOSED** (PostgreSQL) · **OD-03 CLOSED** (Fastify + Vite/React)
**Input**: approved `core-domain/functional-design/*`, `requirements.md`, `execution-plan.md` (rev R1, R2)

## What this stage decides

Most non-functional *requirements* were already fixed and approved during Inception — scale, performance
target, availability class, security posture, UI expectations. This stage does not relitigate them. Its
real job is to **close the two open technology decisions** and record the concrete stack:

| ID | Open decision |
|---|---|
| **OD-01** | Database technology |
| **OD-03** | Node.js API framework and React tooling |

## NFRs already settled (for reference — not up for re-decision unless you say so)

| ID | Requirement | Source |
|---|---|---|
| NFR-S-01 | 200 members, 50 projects design target | Q9:A |
| NFR-S-02 | Concurrent users in the low tens | derived |
| NFR-S-03 | Page loads under 3 seconds | Q18:A |
| NFR-A-01 | Business-hours internal tool; occasional downtime acceptable; no SLA | Q18:A |
| NFR-T-01 | On-premises, containerized via Docker | Q15:D |
| NFR-T-02/03 | Node.js + TypeScript backend; React frontend | Q16:D |
| NFR-U-01/03/04 | Responsive web; no formal WCAG conformance; English only | Q19:C, Q20:A |
| NFR-SE-01 | Security Baseline extension **disabled** | opt-in |
| NFR-SE-02 | Argon2id password hashing and server-side authorization retained as **mandatory functional** requirements regardless | requirements.md |
| NFR-SE-03/04 | Low data sensitivity; no regulatory regime | Q14:A |
| NFR-Q-01 | No formal test suite or CI required; Build and Test stage still produces unit tests | Q17:A, CQ6:A |
| NFR-Q-02/03 | Structured logging, monitoring, backup/restore deferred | Q17:A |
| NFR-IN-01 | Standalone — no external integrations in Phase 1 | Q12:F |

**Section A** holds 14 questions. **Sections B–C** hold the generation checklist.

---

# Section A — Technology and NFR Questions

## Question 1 — Database (closes OD-01)
The functional design needs date-range overlap queries, exact decimal arithmetic, referential integrity across nine entities, transactional check-then-write with row-level locking (BR-A-24), and a JSON-typed column reserved for Phase 2 (BR-C-09). Relational is implied throughout.

A) **PostgreSQL** (recommended) — native `daterange` type and GiST indexing for overlap queries, exact `numeric`, `SELECT … FOR UPDATE` row locking, mature `jsonb` for the reserved attributes column, and straightforward Docker deployment on-premises

B) **MySQL / MariaDB** — widely deployed and familiar; no native range type, so overlap queries are expressed as ordinary date comparisons; JSON support is adequate

C) **SQLite** — zero-administration single file, genuinely sufficient for 200 members and low-tens concurrency, but weak concurrent-write behaviour conflicts with the row-locking strategy in BR-A-24

D) **Microsoft SQL Server** — if your organization already standardizes on it

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2 — Data access layer
How should repositories talk to the database? This directly affects the overlap query that governs NFR-S-03.

A) **Query builder with hand-written SQL for the allocation queries** (recommended) — e.g. Knex or Kysely for CRUD, with the assignment-overlap and batched availability queries written as explicit SQL. Keeps full control over the one query whose plan actually matters.

B) **Full ORM with entity mapping** — e.g. Prisma or TypeORM. Fastest CRUD development; overlap queries and batched fetches usually end up as raw-SQL escape hatches anyway.

C) **Type-safe ORM with good SQL escape hatches** — e.g. Drizzle: schema-as-TypeScript, generated types, and readable SQL when needed

D) **Raw SQL throughout, with a thin mapping layer** — maximum control, most boilerplate

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3 — Migration tooling
BR-A-18 and the ordered-migration decision (unit plan Q8:A) require versioned, ordered schema changes.

A) **Migration tool native to the chosen data-access library** (recommended) — one toolchain, no extra dependency

B) **Standalone SQL migration runner** — plain numbered `.sql` files applied in order; database-native, zero abstraction

C) **Hand-applied SQL scripts with a documented procedure** — no tooling; not recommended for a system with two build units touching one schema

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 4 — Node.js API framework (closes OD-03, backend)
The route layer does shape validation and session resolution only (Q4:A of Application Design) — it needs very little from a framework.

A) **Fastify** (recommended) — fast, first-class TypeScript support, built-in schema-based request validation that fits the thin-route-layer design exactly, good plugin model for the session middleware

B) **Express** — the most widely known Node framework; largest ecosystem; more manual wiring for TypeScript and validation

C) **NestJS** — opinionated DI and module structure that maps neatly onto the component/service design, at the cost of significant framework surface for a 200-user tool

D) **Hono** — minimal and modern; smallest footprint

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5 — React tooling (closes OD-03, frontend)
The frontend is a single-page application served from the same on-premises deployment as the API.

A) **Vite + React SPA** (recommended) — fast builds, simple static output served by the API container or a small static server; matches the single-deployable decision (unit plan Q3:A) with no server-side rendering machinery you do not need

B) **Next.js** — more capability (SSR, routing, API routes) than an internal SPA requires, and it duplicates the API layer you already have

C) **Create React App** — effectively unmaintained; listed only for completeness

D) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 6 — Server-state library
Functional design Q13:A chose the pattern; this picks the package.

A) **TanStack Query** (recommended) — the mature choice for the cache-key and invalidation pattern already specified in `frontend-components.md` §1

B) **SWR** — lighter, simpler API, less control over invalidation

C) **RTK Query** — good, but pulls in Redux Toolkit, which Q13:A deliberately avoided

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 7 — Date and time library
This is the most consequential library choice in the unit. Every allocation figure depends on inclusive date-range arithmetic (AS-03), boundary computation at `end + 1 day`, and no timezone drift on date-only values.

A) **date-fns with UTC-normalized date-only values** (recommended) — small, tree-shakeable, immutable, no timezone surprises when dates are handled as plain calendar dates rather than instants

B) **Luxon** — richer timezone handling than this system needs; heavier

C) **Native `Date` only** — no dependency, but `Date` is an instant, not a calendar date; month arithmetic and DST make off-by-one errors likely in exactly the code that can least afford them

D) **Temporal API via polyfill** — the correct long-term answer (`Temporal.PlainDate` is exactly the right type here), at the cost of a polyfill dependency and less familiarity

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 8 — Request validation library
The route layer validates request shape and must produce the `violations` array specified in BR / Q12:A.

A) **Zod** (recommended) — TypeScript-first, inferred types, and error output that maps cleanly onto the `violations` structure

B) **The API framework's built-in JSON Schema validation** — no extra dependency if Fastify is chosen

C) **Joi** — mature, less TypeScript-native

D) **Hand-written validators** — no dependency, most code, easiest to get subtly inconsistent

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 9 — UI component approach
Six feature folders and twelve shared components need a styling and component foundation.

A) **Tailwind CSS with hand-built components** (recommended) — full control over the allocation-bar and segment-strip visuals that the success criterion depends on, no library conventions to fight, no theme lock-in

B) **A component library (MUI, Ant Design, Mantine)** — fastest to assemble standard forms and tables; the custom allocation visuals still need hand-building, and you inherit a large dependency and a distinctive look

C) **shadcn/ui on Tailwind** — copy-in components you then own outright; a middle path between A and B

D) **Plain CSS modules, no framework** — least tooling, most hand-written layout

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 10 — Test framework for generated unit tests
NFR-Q-01 defers CI and coverage discipline, but the Build and Test stage still produces unit tests, and the allocation algorithm is the code most worth having them for.

A) **Vitest** (recommended) — fast, minimal configuration, works for both backend and frontend with one toolchain

B) **Jest** — the most widely known; heavier configuration with TypeScript and ESM

C) **Node's built-in test runner** — no dependency; more manual assertion work

D) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 11 — Runtime and package management
A) **Node.js 22 LTS with npm** (recommended) — the boring, universally available choice for an on-premises deployment
B) **Node.js 22 LTS with pnpm** — faster installs, efficient disk use across the two workspaces
C) **Node.js 22 LTS with Yarn**
D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 12 — TypeScript strictness
A) **`strict: true` plus `noUncheckedIndexedAccess`** (recommended) — the strongest practical setting; catches the class of undefined-index errors that array-heavy segmentation code invites
B) **`strict: true` only** — standard strict mode
C) **Loose configuration** — faster to write, defers errors to runtime in the code least able to tolerate them
D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 13 — Minimal operational visibility
NFR-Q-02 defers structured logging and monitoring. But some baseline is needed to diagnose anything at all.

A) **Request logging plus a health endpoint** (recommended) — one line per request (method, path, status, duration) and `GET /health`. Roughly an hour of work, and without it a production problem is undiagnosable.

B) **Nothing** — hold the line on NFR-Q-02 exactly as written

C) **Request logging, health endpoint, and structured JSON logs** — promotes part of NFR-Q-02 into Phase 1

D) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 14 — Confirm the NFR targets
The table at the top of this document lists the NFRs already approved during Inception.

A) **Confirm all as approved** (recommended) — no changes
B) **Confirm, but tighten the performance target** — describe under Other
C) **Confirm, but revisit the deferred items** (test suite, monitoring, backup) — describe which under Other
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

# Section B — Mandatory Artifacts

- [x] Generate `aidlc-docs/construction/core-domain/nfr-requirements/nfr-requirements.md`
- [x] Generate `aidlc-docs/construction/core-domain/nfr-requirements/tech-stack-decisions.md`

---

# Section C — Execution Checklist

## C.1 — Preparation
- [x] Re-read the four `core-domain/functional-design/` artifacts
- [x] Re-read the NFR sections of `requirements.md`
- [x] Confirm the Section A answers and restate the decisions

## C.2 — NFR requirements
- [x] Restate the unit's scalability, performance, availability, security, reliability, maintainability, and usability requirements with unit-specific targets
- [x] Identify which NFRs are verifiable in Phase 1 and which are explicitly not, given NFR-Q-01
- [x] Record the performance budget for the availability query, the one that carries the success criterion
- [x] Record the security posture including the two functional requirements retained despite the disabled extension
- [x] Write `nfr-requirements.md`

## C.3 — Tech stack decisions
- [x] Record every selection with its rationale and the alternatives rejected
- [x] Close **OD-01** and **OD-03** explicitly
- [x] Record version constraints and the dependency list per workspace
- [x] Note which choices are cheap to reverse later and which are not
- [x] Write `tech-stack-decisions.md`

## C.4 — Validation and completion
- [x] Verify every functional design need has a technology that satisfies it — especially date-range overlap queries, exact decimal arithmetic, and row-level locking
- [x] Verify no choice contradicts NFR-T-01 on-premises containerized deployment
- [x] Verify no choice requires a cloud managed service (NFR-T-04)
- [x] Validate all content per `common/content-validation.md`
- [x] Mark all checkboxes in this plan `[x]`
- [x] Update `aidlc-docs/aidlc-state.md`, closing OD-01 and OD-03
- [x] Log completion and approval prompt in `aidlc-docs/audit.md`
- [x] Present the standardized 2-option completion message
