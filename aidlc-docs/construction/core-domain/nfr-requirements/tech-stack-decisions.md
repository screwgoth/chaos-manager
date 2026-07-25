# Technology Stack Decisions — `core-domain`

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION · **Unit**: `core-domain` (1 of 2) · **Stage**: NFR Requirements
**Date**: 2026-07-25

## Open Decisions Closed by This Document

| ID | Decision | Resolution |
|---|---|---|
| **OD-01** | Database technology | **PostgreSQL** — CLOSED |
| **OD-03** | Node.js API framework and React tooling | **Fastify + Vite/React SPA** — CLOSED |

The stack applies to **both units** — Unit 2 inherits it rather than re-deciding, since they share one
deployable and one schema.

---

## 1. The Stack

### Backend — `backend/`

| Concern | Selection | Answer |
|---|---|---|
| Runtime | **Node.js 22 LTS** | Q11:A |
| Package manager | **npm** | Q11:A |
| Language | **TypeScript**, `strict` + `noUncheckedIndexedAccess` | NFR-T-02, Q12:A |
| API framework | **Fastify** | Q4:A |
| Database | **PostgreSQL 16+** | Q1:A |
| Data access | **Kysely** — type-safe query builder, with hand-written SQL for the allocation queries | Q2:A |
| Migrations | **Kysely's built-in migrator** — ordered, versioned, forward-only | Q3:A |
| Request validation | **Zod** | Q8:A |
| Password hashing | **Argon2id** via a native binding (`argon2` or `@node-rs/argon2`) | Q10:A of Functional Design |
| Dates | **date-fns**, UTC-normalized date-only values | Q7:A |
| Logging | **Fastify's built-in pino logger**, minimal configuration — request line only | Q13:A |
| Tests | **Jest** | Q10:B |

### Frontend — `frontend/`

| Concern | Selection | Answer |
|---|---|---|
| Build tool | **Vite** | Q5 → **CQ1:A** |
| Framework | **React** (function components, hooks) | NFR-T-03 |
| Language | **TypeScript**, same strictness as backend | Q12:A |
| Server state | **TanStack Query v5** | Q6:A |
| Form / UI state | React `useState` / `useReducer` + one session context | Functional design Q13:A |
| Routing | **React Router** | implied by SPA |
| Styling | **Tailwind CSS**, hand-built components | Q9:A |
| Dates | **date-fns** — same library as the backend | Q7:A |
| Tests | **Jest** + React Testing Library | Q10:B |

### Deployment

| Concern | Selection |
|---|---|
| Containerization | **Docker**, multi-stage build (NFR-T-01) |
| Composition | **Docker Compose** — two containers: app and PostgreSQL |
| Static assets | Vite build output served by the **Fastify** container — one Node process (unit plan Q3:A) |
| Persistence | Named Docker volume for PostgreSQL data (U1-NFR-A-04) |
| Configuration | Environment variables; no secret in the repository (U1-NFR-O-06) |
| Cloud dependency | **None** — nothing requires a managed service (NFR-T-04) |

---

## 2. Rationale and Rejected Alternatives

### PostgreSQL (OD-01)

Chosen against the functional design's specific needs, not by default:

| Need | How PostgreSQL serves it |
|---|---|
| Date-range overlap queries (the query governing U1-NFR-P-02) | Native `daterange` with GiST indexing; also fine as plain indexed date comparisons |
| Exact decimal percentages (BR-A-03) | `numeric` is exact; and since values are stored as **integer tenths**, plain `integer` suffices |
| Row-level lock for the over-allocation check (BR-A-24) | `SELECT … FOR UPDATE` |
| Reserved Phase 2 attributes column (BR-C-09) | Mature `jsonb` |
| Constraints as a backstop for the missing test suite (U1-NFR-R-06) | Full foreign key, unique, and check constraint support |
| On-premises deployment (NFR-T-01) | Official image, well-understood operation, no licence cost |

**Rejected**: MySQL/MariaDB — workable, but no native range type and weaker check-constraint history.
**SQLite** — genuinely adequate for 200 members, but its concurrent-write model **conflicts with BR-A-24's
row-locking strategy**, which is the mechanism protecting the system's most important invariant.
**SQL Server** — no organizational reason to take on the licence.

### Kysely with hand-written allocation SQL (Q2:A)

The overlap query is the one query whose plan actually matters (U1-NFR-P-02). A query builder keeps that
query explicit and readable while giving typed CRUD everywhere else. Kysely specifically: TypeScript-first,
types derived from a schema declaration, no code generation step, and a built-in migrator — which is what
makes Q3:A ("migration tool native to the data-access library") a real option rather than an extra dependency.

**Rejected**: Prisma — excellent CRUD DX, but the batched overlap query and the `FOR UPDATE` lock both land
in its raw-SQL escape hatch, so the abstraction would be bypassed exactly where it matters most.
**TypeORM** — heavier, and its migration story is less predictable. **Raw SQL throughout** — the control is
already available where needed without hand-writing every CRUD statement.

### Fastify (OD-03, backend)

The route layer does shape validation and session resolution only (Q4:A of Application Design), so almost
nothing is needed from a framework. Fastify's schema-based validation fits that thin layer exactly, its
plugin model suits the session middleware, and its built-in pino logger delivers U1-NFR-O-01 with no extra
dependency.

**Rejected**: Express — larger ecosystem, but more manual TypeScript and validation wiring and no built-in
logger. **NestJS** — its DI and module structure would map neatly onto the component/service design, but it
is a lot of framework surface for a 200-user internal tool. **Hono** — smaller than needed; the Node
ecosystem fit is less mature.

### Vite + React SPA (OD-03, frontend) — resolved at CQ1:A

Originally answered as Next.js (Q5:B), which **contradicted two approved decisions**: unit plan Q3:A's
single Node process, and Q4:A's selection of Fastify. Next.js is itself a Node server, so pairing it with
Fastify means two processes, while replacing Fastify with Next route handlers moves the route layer into
the frontend framework and pressures the US-ENB-04 layering invariant.

**Resolved at CQ1:A** by reverting to Vite. Vite produces static assets that the Fastify container serves —
one Node process, Fastify as the sole API, and every prior decision intact. An authenticated internal SPA
for 200 people has no use for SSR, streaming, or server components.

**Rejected**: Next.js in all four arrangements considered (server + Fastify, static export, Next-only,
two processes) — see `core-domain-nfr-requirements-clarification-questions.md`. **CRA** — unmaintained.

### date-fns with UTC-normalized date-only values (Q7:A)

The most consequential library choice in the unit. Every allocation figure depends on **inclusive**
date-range arithmetic (AS-03) and boundary computation at `end + 1 day`, in code with no automated test
suite behind it.

**Convention, stated once and applied everywhere**: `startDate` and `endDate` are **calendar dates, not
instants**. They are stored as `date` (no time, no zone), transported as `YYYY-MM-DD` strings, and parsed
to UTC midnight. No local-timezone construction of a date value anywhere. This convention — not the
library — is what prevents timezone drift; date-fns is chosen because it is small, immutable, and does not
fight it.

**Rejected**: native `Date` alone — a `Date` is an instant; DST and month arithmetic invite off-by-one
errors in precisely the code least able to absorb them. **Luxon** — more timezone capability than a
date-only domain needs. **Temporal via polyfill** — `Temporal.PlainDate` is genuinely the *correct* type
here, and this is the one rejection made on pragmatism rather than merit: the polyfill dependency and lower
familiarity outweighed the type-correctness benefit for Phase 1. Worth revisiting when Temporal ships
natively.

### Tailwind with hand-built components (Q9:A)

The allocation bar and segment strip are the visuals the success criterion depends on (U1-NFR-U-05), and
they have to be built by hand under any option. Tailwind gives full control with no component-library
conventions to fight and no inherited look.

**Rejected**: MUI / Ant / Mantine — faster standard forms and tables, but a large dependency and a
distinctive appearance, and the custom allocation visuals still need hand-building. **shadcn/ui** — a
reasonable middle path; declined to keep the dependency surface minimal.

### Jest (Q10:B)

Selected over the recommendation. Widely known, and the unit tests it will run are the same tests either way.

**Recorded consequence, not a re-argument**: with TypeScript, ESM, and Vite, Jest needs more configuration
than Vitest — transform setup, ESM handling, and a separate config per workspace. A one-time cost. As
committed in the clarification note, if the configuration fights the toolchain during Code Generation I
will raise it rather than silently switch.

### Node 22 LTS + npm, `strict` + `noUncheckedIndexedAccess` (Q11:A, Q12:A)

`noUncheckedIndexedAccess` earns its keep here specifically: the segmentation algorithm is array-index-heavy
(`sortedBoundaries[i]`, `sortedBoundaries[i + 1]`), and that flag turns exactly the class of
undefined-index bug that code invites into a compile error.

---

## 3. Dependency Manifests

Indicative. Exact versions are pinned at Code Generation.

### `backend/package.json`

```
runtime:  fastify · @fastify/cookie · kysely · pg · zod · argon2 · date-fns · pino-pretty (dev only)
dev:      typescript · @types/node · @types/pg · jest · ts-jest · @types/jest · eslint · prettier · tsx
```

### `frontend/package.json`

```
runtime:  react · react-dom · react-router-dom · @tanstack/react-query · date-fns
dev:      vite · @vitejs/plugin-react · typescript · tailwindcss · postcss · autoprefixer ·
          jest · ts-jest · @testing-library/react · @testing-library/jest-dom · jest-environment-jsdom ·
          eslint · prettier
```

**Deliberately absent**: no ORM, no global state library, no component library, no HTTP client library
(native `fetch`), no logging framework beyond Fastify's built-in, no monitoring or tracing SDK. Each
absence traces to a decision above or to a deferred NFR.

---

## 4. Reversibility

Which of these are cheap to change later, and which are not.

| Decision | Reversibility | Why |
|---|---|---|
| Tailwind → component library | **Easy** | Styling is localized to components |
| Jest → Vitest | **Easy** | Test files are largely portable |
| Request logging → structured logging | **Easy** | pino is already the logger; configuration change |
| Fastify → another framework | **Moderate** | Route layer is thin by design (Q4:A), but middleware and validation wiring is framework-shaped |
| Vite → Next.js | **Moderate** | Would reopen the CQ1 contradiction and change deployment topology |
| TanStack Query → alternative | **Moderate** | Query keys and the invalidation map (`frontend-components.md` §1) would be rewritten |
| Kysely → ORM | **Moderate to hard** | Every repository is rewritten; the hand-written allocation SQL would need re-verifying |
| **date-fns → other date handling** | **Hard** | Not the library but the *convention* — date-only, UTC-normalized. Changing it touches every allocation computation, the riskiest code in the system. |
| **PostgreSQL → another database** | **Hard** | `FOR UPDATE` locking (BR-A-24), `jsonb`, and the hand-written overlap SQL are all Postgres-shaped |
| **Node.js + TypeScript** | **Not reversible** | Approved at Inception (Q16:D); the entire codebase |

**The two worth getting right first time are the date convention and PostgreSQL.** Both are load-bearing for
the allocation logic, and both are recorded here with their reasoning so a future reader knows what a change
would cost.

---

## 5. Validation Against the Functional Design

| Functional design need | Satisfied by | ✓ |
|---|---|---|
| Date-range overlap queries, batched (§7 rule 2) | PostgreSQL + hand-written Kysely SQL | ✅ |
| Exact decimal arithmetic as integer tenths (BR-A-03) | TypeScript integers; `integer`/`numeric` columns | ✅ |
| Row-level lock on member for check-then-write (BR-A-24) | `SELECT … FOR UPDATE` | ✅ |
| Assignment mutation + history revision atomic (BR-A-16) | Single transaction | ✅ |
| Append-only history with `supersededAt` (BR-A-18) | Ordinary table plus the U1-NFR-R-03 invariant | ✅ |
| Reserved Phase 2 attributes column (BR-C-09) | `jsonb`, unused in Phase 1 | ✅ |
| Argon2id hashing (BR-AU-01) | `argon2` native binding | ✅ |
| Server-side session records, hash only (Q8:A) | `Session` table + `@fastify/cookie` | ✅ |
| Field-level `violations` array (Q12:A) | Zod error mapping | ✅ |
| Inclusive date arithmetic, no timezone drift (AS-03) | date-fns + the date-only UTC convention | ✅ |
| Cache invalidation map (`frontend-components.md` §1) | TanStack Query keys | ✅ |
| Custom allocation visuals (U1-NFR-U-05) | Tailwind, hand-built | ✅ |
| Parameterized queries incl. hand-written SQL (U1-NFR-SE-06) | Kysely binds all parameters | ✅ |
| Request logging + health endpoint (Q13:A) | Fastify pino + a `/health` route | ✅ |
| On-premises, no cloud service (NFR-T-01, NFR-T-04) | Docker Compose, app + PostgreSQL | ✅ |
| Single Node process (unit plan Q3:A) | Fastify serves API and Vite static output | ✅ |

**No unmet need.** Every capability the functional design assumes has a technology behind it, and no
selection contradicts an approved decision.
