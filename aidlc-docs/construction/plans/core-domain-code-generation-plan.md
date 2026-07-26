# Code Generation Plan — `core-domain`

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION · **Unit**: `core-domain` (1 of 2) · **Stage**: Code Generation (Part 1: Planning)
**Date**: 2026-07-25
**Status**: APPROVED 2026-07-25T12:45:00Z. Part 2 IN PROGRESS on branch `aidlc/construction-core-domain`.
**Steps 1-6 of 26 complete and verified.** Next: Step 7 (business logic — OrgUnit and ReferenceData components).
**Verification**: `npx tsc --noEmit` clean; `npx jest` **68 passed / 5 suites** against PostgreSQL 16 (41 passed + 27 skipped without a database).
**Branch**: `aidlc/construction-core-domain` (created from `aidlc/inception-requirements`)

> **This plan is the single source of truth for Code Generation.** Part 2 executes exactly these steps in
> this order and marks each `[x]` on completion. No step is added, skipped, or reordered during execution
> without returning here.

---

## 1. Unit Context

| Attribute | Value |
|---|---|
| **Workspace root** | `/home/raseel/code/github/screwgoth/chaos-manager` |
| **Project type** | Greenfield, multi-unit monolith |
| **Code location** | `backend/`, `frontend/`, `docker/` and root config files — **never `aidlc-docs/`** |
| **Stories** | 30 (29 Must, 1 Should) — all six Slice 1 stories |
| **Depends on** | Unit 2 for real `IAuthorizationComponent`; a **permissive stand-in** is generated here (X-1) |
| **Provides to Unit 2** | `IMemberComponent`, `IProjectComponent`, `IOrgUnitComponent`, `IReferenceDataComponent` |
| **Entities owned** | Member · MemberSkill · Project · Assignment · AssignmentHistory · OrgUnit · ReferenceDataEntry · UserAccount · Session |

### Stories implemented by this unit

```
US-ACC-01 [ ]  US-ACC-02 [ ]  US-ACC-03 [ ]
US-MEM-01 [ ]  US-MEM-02 [ ]  US-MEM-03 [ ]  US-MEM-04 [ ]  US-MEM-05 [ ]  US-MEM-07 [ ]
US-PRJ-01 [ ]  US-PRJ-02 [ ]  US-PRJ-03 [ ]  US-PRJ-04 [ ]  US-PRJ-05 [ ]
US-ASN-01 [ ]  US-ASN-02 [ ]  US-ASN-03 [ ]  US-ASN-05 [ ]  US-ASN-06 [ ]  US-ASN-07 [ ]
US-VIS-01 [ ]  US-VIS-02 [ ]  US-VIS-03 [ ]  US-VIS-04 [ ]
US-ADM-01 [ ]  US-ADM-02 [ ]  US-ADM-03 [ ]
US-ENB-02 [ ]  US-ENB-03 [ ]  US-ENB-04 [ ]
```

Marked `[x]` in Step 12 of the rules as each story's functionality is generated.

### Target directory structure

```
chaos-manager/                        <- workspace root, application code here
+-- backend/
|   +-- package.json  tsconfig.json  jest.config.js
|   +-- src/
|   |   +-- shared/          types/  repository/  errors/  config/  util/
|   |   +-- core-domain/     member/ project/ assignment/ allocation/
|   |   |                    org-unit/ reference-data/ identity/ session/
|   |   |                    authorization-standin/ services/ routes/
|   |   +-- server.ts
|   +-- tests/core-domain/
|   +-- migrations/
+-- frontend/
|   +-- package.json  tsconfig.json  vite.config.ts  tailwind.config.js  jest.config.js
|   +-- src/
|       +-- shared/          api/ components/ hooks/ session/
|       +-- core-domain/     auth/ members/ projects/ assignments/ views/ admin/
|       +-- main.tsx  App.tsx
+-- docker/Caddyfile
+-- Dockerfile   docker-compose.yml   .env.example   .gitignore   README.md
```

---

## 2. Generation Steps

### Step 1 — Project Structure Setup
- [x] Create `backend/` and `frontend/` workspaces with `package.json` each (Node 22, npm)
- [x] `tsconfig.json` in both: `strict: true`, `noUncheckedIndexedAccess: true`
- [x] `frontend/vite.config.ts` with `/api` dev proxy to `localhost:3000`
- [x] `frontend/tailwind.config.js`, `postcss.config.js`, base stylesheet
- [x] `jest.config.js` in both workspaces (ts-jest; jsdom for frontend)
- [x] `.gitignore` — `node_modules`, `dist`, `.env`, coverage
- [x] `.env.example` with all 15 variables from the infrastructure config contract, **no real secrets**
- [x] ESLint + Prettier configuration in both workspaces

### Step 2 — Shared Foundations (`backend/src/shared/`)
- [x] `types/` — all shared types from `component-methods.md`: ids, `DateRange`, `Percentage`, `EmploymentType`, `UserRole`, `AccessScope`, `ScopeFilter`, `Page<T>`
- [x] `types/authorization.ts` — **the complete, final `IAuthorizationComponent` interface** (X-1: must not be widened by Unit 2)
- [x] `types/components.ts` — `IMemberComponent`, `IProjectComponent`, `IOrgUnitComponent`, `IReferenceDataComponent` interfaces published to Unit 2
- [x] `util/tenths.ts` — **integer-tenths percentage arithmetic** (BR-A-03): parse, format, add, compare. No floating point.
- [x] `util/dates.ts` — **date-only UTC convention** (AS-03): parse `YYYY-MM-DD`, `addDays`, inclusive-range overlap, `nextDay`. No local-time construction.
- [x] `errors/` — `ValidationError` carrying the `violations` array (Q12:A), `NotFoundError`, `ForbiddenError`, `ConflictError`
- [x] `config/` — env loading with **fail-fast validation naming every missing variable** (U1-NFR-O-03), secret redaction helper
- [x] `repository/` — Kysely instance, transaction helper, scope-filter application helper

### Step 3 — Database Migration Scripts (`backend/migrations/`)
- [x] `001_initial_schema` — all nine tables per `domain-entities.md`
- [x] Constraints: FKs; unique on `member.email`, `member.external_ref`, `project.code`, `(reference_type, lower(name))`, `session.token_hash`, `user_account.username`, `user_account.linked_member_id`
- [x] Check constraints: `allocation_tenths BETWEEN 1 AND 1000`; `end_date >= start_date`; two-level org unit rule
- [x] Indexes per `domain-entities.md` §12 — including **`(member_id, start_date, end_date)`**, the most important one
- [x] `attributes jsonb` on `member` and `project` — **reserved, unused in Phase 1** (BR-C-09)
- [x] `assignment_history` with `recorded_at`, `superseded_at`, snapshot columns (Q1:B)

### Step 4 — Repository Layer Generation ✅
- [x] `MemberRepository`, `ProjectRepository`, `AssignmentRepository`, `OrgUnitRepository`, `ReferenceDataRepository`, `UserAccountRepository`, `SessionRepository`, `AssignmentHistoryRepository`
  - [x] `OrgUnitRepository` — subtree resolution in one self-join, reference counting (BR-O-05)
  - [x] `ReferenceDataRepository` — generic over ROLE/SKILL/PROJECT_TYPE, no delete method (BR-C-05)
  - [x] `MemberRepository` — scope + filters as typed predicate factories, batched skill fetch
  - [x] `ProjectRepository`
  - [x] `AssignmentRepository`
  - [x] `AssignmentHistoryRepository` — append-with-supersede (BR-A-17), `findAsOf` (BR-A-22 Path B)
  - [x] `UserAccountRepository` — password hash confined to one method
  - [x] `SessionRepository` — hash-only storage, live-session predicate in-query (BR-AU-09)
- [x] **`findOverlapping(memberIds[], range)` — one batched query for all members** (R2-1 rule 2; the N+1 prohibition) — `assignment-repository.ts`, with `excludeAssignmentId` for the edit case (BR-A-09)
- [x] Scope filters applied **inside** queries, never post-fetch (FR-R-08) — `scopePredicates()` in each repository; empty permitted-org list yields `eb.lit(false)`, never an absent filter
- [x] `SELECT … FOR UPDATE` member lock helper (BR-A-24) — pre-existing in `db.ts` (Step 3)
- [x] All parameters bound — no string-concatenated SQL (U1-NFR-SE-06) — `ilike` patterns wrapped in the bound value, not in SQL text
- [x] Supporting files not in the original plan text: `pg-errors.ts` (constraint → `ConflictError`), `mappers.ts` (row → domain, hash/token omitted), `index.ts` (public surface + `createRepositories` bundle), `util/ids.ts` (uuid guards — see Step 5 findings)

### Step 5 — Repository Layer Unit Tests ✅
Went beyond the planned scope: Docker was available, so these are REAL integration tests against PostgreSQL 16 rather than mocks. A mock cannot distinguish "filtered in SQL" from "fetched and trimmed", which is the rule that most needed proving.
- [x] Overlap query boundary cases: adjacent vs overlapping-by-one-day ranges — `repository-integration.test.ts`
- [x] Scope filter applied in-query — asserted twice: compiled SQL shape (`repository-sql.test.ts`) AND behavioural exclusion incl. the scoped `total`
- [x] Natural-key uniqueness violations surface as `ConflictError` — duplicate email and project code, both case-insensitive
- [x] Beyond plan: migration applies; `date` round-trips as a string (the OID 1082 override); bi-temporal `findAsOf` returns the historical value (100) not the current one (900); session lifecycle incl. expiry and termination; `ids.test.ts` uuid guards
- [x] Integration suite SKIPS (reported as skipped, never as passing) when `TEST_DATABASE_URL` is unset

**Defect found by Step 5, fixed in Step 4 code**: a malformed id from client input raised `invalid input syntax for type uuid` — an unhandled 500 on any request carrying a bad path parameter or skill id. Guarded with `isUuid`/`keepUuids` across every id-accepting read.

### Step 6 — Repository Layer Summary ✅
- [x] Write `aidlc-docs/construction/core-domain/code/repository-layer-summary.md` — includes both defects found, the run instructions for the integration suite, and what is carried forward (X-1; BR-A-24 lock present but unproven under concurrency)

### Step 7 — Business Logic: OrgUnit and ReferenceData
- [ ] `C-05 OrgUnitComponent` — two-level enforcement, reference counting, scope resolution (US-ADM-03)
- [ ] `C-06 ReferenceDataComponent` — generic over ROLE/SKILL/PROJECT_TYPE, deactivate-not-delete (US-ADM-01, US-ADM-02)
- [ ] Rules BR-O-01…06, BR-C-01…09

### Step 8 — Business Logic: Member and Project
- [ ] `C-01 MemberComponent` — CRUD, conditional off-roll contract fields, skills, deactivate with **auto-end cascade** (US-MEM-01…05, US-MEM-07)
- [ ] `C-02 ProjectComponent` — CRUD, close with confirmation and cascade, staffing view (US-PRJ-01…05)
- [ ] **No rate, contract value, or PO field** (BR-M-09)
- [ ] Rules BR-M-01…18, BR-P-01…11

### Step 9 — Business Logic: Assignment
- [ ] `C-03 AssignmentComponent` — create, update, end early, auto-end; **history revision written in the same transaction** (BR-A-16, BR-A-17)
- [ ] Multiple concurrent assignments per member-project permitted (BR-A-06, Q4:B)
- [ ] Date and contract-window conflict detection (BR-A-13, BR-A-14)
- [ ] **As-of reconstruction from `AssignmentHistory`** — Path B, not current rows (BR-A-22)
- [ ] Stories US-ASN-01, 02, 03, 06, 07

### Step 10 — Business Logic: Allocation ⚠️ highest-risk step
- [ ] `C-04 AllocationComponent` — **pure function, no I/O, no state** (U1-NFR-M-03)
- [ ] `segmentAllocation` — boundary collection, segment build, exact integer-tenths summation, merge equivalent adjacent segments
- [ ] `detectOverAllocation` — returns **each offending sub-period**, excludes own row when editing (BR-A-08, BR-A-15)
- [ ] `availability`, `currentAllocationView`, `unallocatedMembers`, `overAllocatedMembers`, `memberTimeline`
- [ ] `CAPACITY_TENTHS = 1000` expressed **once** (AS-01)
- [ ] Stories US-ASN-05, US-VIS-01, 02, 03

### Step 11 — Business Logic: Identity, Session, Authorization Stand-In
- [ ] `C-07 IdentityComponent` — Argon2id hashing, credential verification with **dummy comparison on unknown username**, member linking (US-ENB-02, BR-AU-01…07)
- [ ] `C-08 SessionComponent` — establish, resolve, sliding 30-min expiry, terminate; **token hash stored, never the token** (BR-AU-09…12)
- [ ] `authorization-standin/` — **its own named directory**, permissive per `business-logic-model.md` §11: role resolved, `orgUnitIds: 'ALL'`, but `restrictToMemberId` **enforced** for TEAM_MEMBER
- [ ] Stories US-ACC-01, 02, 03, US-ENB-02, US-ENB-03

### Step 12 — Business Logic Unit Tests
- [ ] **Allocation: the worked example from `business-logic-model.md` §1** as an executable test
- [ ] Inclusive-boundary cases: 31 Mar/1 Apr (no overlap) vs 31 Mar/31 Mar (overlap)
- [ ] Over-allocation sub-period identification; override flag from detection not user input
- [ ] Exact tenths arithmetic: order-independent summation (float `33.4 + 33.3 + 33.3` drifts to 99.99999999999999)
- [ ] As-of reconstruction: the 50%→80% May-edit case returning 50% for March
- [ ] Auto-end cascade counts
- [ ] Argon2id: same password ⇒ different hashes; no plaintext anywhere

### Step 13 — Business Logic Summary
- [ ] Write `aidlc-docs/construction/core-domain/code/business-logic-summary.md`

### Step 14 — Service Layer
- [ ] `S-01 AuthService`, `S-03 MemberService`, `S-04 ProjectService`, `S-05 AssignmentService`, `S-06 AllocationQueryService`, `S-07 ReferenceDataService`, `S-08 OrgUnitService`
- [ ] Minimal `AccessControlService` wrapper over the stand-in (S-02 fully implemented in Unit 2)
- [ ] **`AssignmentService.create` — the eight-step flow** from `business-logic-model.md` §4.1, with the member lock and transaction spanning check-and-write (BR-A-24)
- [ ] Every method derives `AccessScope` from the session first; **no client-supplied role, scope, or id trusted**

### Step 15 — API Layer Generation
- [ ] Fastify server, `backend/src/server.ts`; static asset serving for `frontend/dist`
- [ ] All 37 routes from `component-methods.md` §C-12
- [ ] Zod schemas per route — **shape validation only, no business rules** (Q4:A)
- [ ] Session middleware: cookie → `tokenHash` → resolve → attach scope
- [ ] Error mapper producing the `violations` envelope (Q12:A)
- [ ] Request logging (method, path, status, duration) with **secret redaction at the logger** (U1-NFR-O-01, O-04)
- [ ] `GET /health` — status + database connectivity, unauthenticated
- [ ] **Two-step override protocol** for `POST /api/assignments` (US-ASN-05)

### Step 16 — API Layer Unit Tests
- [ ] Route shape validation rejects malformed payloads before any service call
- [ ] Error mapper produces field-level violations, **all reasons not just the first**
- [ ] Session middleware rejects expired and unknown sessions
- [ ] **Direct API call as a TEAM_MEMBER for another member's data is refused** (US-VIS-04, US-ENB-01)

### Step 17 — API Layer Summary
- [ ] Write `aidlc-docs/construction/core-domain/code/api-layer-summary.md`

### Step 18 — Frontend: Shared Foundations
- [ ] `shared/api/` — `ApiClient` parsing the `violations` envelope, routing 401 to sign-in
- [ ] `shared/session/` — `SessionProvider`, `useSession`, `RequireRole` (**convenience only, not enforcement**)
- [ ] `shared/components/` — the 12 shared components incl. `DateRangePicker`, `PercentageInput`, **`AllocationBar` with distinct overflow treatment** (U1-NFR-U-05), `AllocationSegmentStrip`, `EmptyState`, `ErrorState`, `FieldErrors`, `DataTable`
- [ ] TanStack Query client with the **cache-invalidation map** from `frontend-components.md` §1
- [ ] `App.tsx` route map with role-based redirect
- [ ] `data-testid` convention applied throughout — entity ids, never row indices

### Step 19 — Frontend: Auth, Members, Projects
- [ ] `auth/` — `SignInPage`, `SessionGuard`, `SignOutButton` (US-ACC-01, 02, 03)
- [ ] `members/` — list, filter bar, form, `ContractFieldset`, `SkillTagEditor`, detail, `DeactivateMemberDialog` **stating the auto-end count** (US-MEM-01…05, 07)
- [ ] `projects/` — list, form, detail, `ProjectStaffingPanel` **grouping multiple rows per member with a subtotal** (BR-P-11), `CloseProjectDialog` (US-PRJ-01…05)

### Step 20 — Frontend: Assignments, Views, Admin
- [ ] `assignments/` — `AssignmentForm`, **`OverAllocationDialog` blocking modal** naming member, sub-period, total, and contributors (US-ASN-05, Q14:A), `AssignmentConflictNotice` as a non-blocking inline warning, `EndAssignmentDialog`
- [ ] `views/` — `AllocationViewPage`, **`AvailabilitySearchPage` with "next month" preset and prominent skill filter** (US-VIS-02, 03), `MyAssignmentsPage`, `HistoricalAllocationPage` **with its as-of notice** (US-ASN-07)
- [ ] `admin/` — `ReferenceDataPage`, `RetireReferenceDialog` **offering deactivate when delete is refused**, `OrgUnitPage`, `OrgUnitTree` (US-ADM-01, 02, 03)

### Step 21 — Frontend Unit Tests
- [ ] `AllocationBar` renders over-allocation distinctly from fully-allocated
- [ ] `OverAllocationDialog` shows the sub-period and requires explicit confirmation
- [ ] `PercentageInput` rejects 0, negatives, and >100
- [ ] `FieldErrors` places each violation against its field
- [ ] Sign-in failure shows one generic message

### Step 22 — Frontend Summary
- [ ] Write `aidlc-docs/construction/core-domain/code/frontend-summary.md`

### Step 23 — First-Run Bootstrap
- [ ] Migration runner invoked at startup **before listening** (deployment-architecture §2)
- [ ] Idempotent seed: one department org unit, starter roles/skills/project types — **generic vocabulary only** (FR-C-01)
- [ ] Idempotent initial admin from `INITIAL_ADMIN_USERNAME`/`INITIAL_ADMIN_PASSWORD`, Argon2id hashed
- [ ] Log the instruction to change the password and remove the bootstrap secret

### Step 24 — Deployment Artifacts
- [ ] `Dockerfile` — three-stage build per deployment-architecture §3
- [ ] `docker-compose.yml` — `app`, `db`, `proxy`; only 80/443 published; named volumes; healthchecks; `depends_on` conditions
- [ ] `docker/Caddyfile` — TLS termination, reverse proxy to `app:3000`
- [ ] `.dockerignore`

### Step 25 — Documentation
- [ ] `README.md` — what it is, prerequisites, first-run setup, local development modes, operational runbook, **the `down -v` warning**, backup/restore commands
- [ ] `aidlc-docs/construction/core-domain/code/api-documentation.md` — all 37 endpoints with request/response shapes
- [ ] `aidlc-docs/construction/core-domain/code/code-generation-summary.md` — full file inventory

### Step 26 — Final Verification
- [ ] `npm run build` succeeds in both workspaces
- [ ] `npx tsc --noEmit` clean in both workspaces
- [ ] `npm test` runs (results reported honestly, pass or fail)
- [ ] All 30 story checkboxes marked `[x]`
- [ ] No application code written under `aidlc-docs/`
- [ ] No secret in any committed file
- [ ] Mark every step in this plan `[x]`

---

## 3. Scope and Sequencing Note

**This is a large generation** — roughly 120–150 source files across two workspaces, implementing 30
stories. Two things follow that you may want to change before approving:

1. **Tests are generated but not run as a gate.** NFR-Q-01 defers CI and coverage. Step 26 runs the build and the test suite and **reports results honestly, including failures** — it does not claim success without verifying.
2. **Steps 1–17 (backend) then 18–22 (frontend)** is the layer order the AI-DLC rules prescribe. It means nothing is visible in a browser until Step 19. If you would rather see the Slice 1 thread working end-to-end earlier, say so at approval and I will reorder to: foundations → migrations → member/project/assignment/allocation → their routes → the six Slice 1 screens → then breadth. That better matches DA-01's vertical-slice intent, at the cost of departing from the prescribed layer sequence.

**Verification honesty commitment**: I will not report a step complete without having done it, and if the
build or tests fail I will say so with the output rather than describing the code as working.
