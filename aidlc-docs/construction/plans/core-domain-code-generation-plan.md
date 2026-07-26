# Code Generation Plan — `core-domain`

**Project**: C.H.A.O.S (chaos-manager)
**Phase**: 🟢 CONSTRUCTION · **Unit**: `core-domain` (1 of 2) · **Stage**: Code Generation (Part 1: Planning)
**Date**: 2026-07-25
**Status**: APPROVED 2026-07-25T12:45:00Z. Part 2 IN PROGRESS on branch `aidlc/construction-core-domain`.
**Steps 1-11 of 26 complete and verified.** Next: Step 12 (business logic unit tests — the worked example and remaining named cases).
**Verification**: `npx tsc --noEmit` clean; `npx jest` **313 passed / 14 suites** against PostgreSQL 16 (258 passed + 55 skipped without a database).
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

### Step 7 — Business Logic: OrgUnit and ReferenceData ✅
- [x] `C-05 OrgUnitComponent` — two-level enforcement (BR-O-01) with the offending parent NAMED, hierarchy built from one flat fetch, reference-blocked removal (BR-O-05), `resolveScope` that fails CLOSED (US-ADM-03)
- [x] `C-06 ReferenceDataComponent` — generic over ROLE/SKILL/PROJECT_TYPE with no type-specific code (BR-C-01, BR-C-08), deactivate-not-delete as the normal path, three-way `validateIds` for Unit 2's import (US-ADM-01, US-ADM-02)
- [x] Rules BR-O-01…06, BR-C-01…09 — see mapping below
- [x] Tests: `org-unit-component.test.ts`, `reference-data-component.test.ts` (fakes, not a database — these are decisions the components make)

**Rule coverage**

| Rule | Where |
|---|---|
| BR-O-01 two levels | `validateParent` + DB trigger; test asserts the third level is refused and names the parent |
| BR-O-02 sibling name uniqueness | DB partial unique indexes (not pre-checked — read-then-write is a race) |
| BR-O-03 one org unit per member/project | schema FK, non-null |
| BR-O-04 cross-org assignment permitted | no constraint added — permitted by omission, deliberately |
| BR-O-05 referenced unit cannot be removed | `remove()` returns `blockedBy`; `userAccounts` blocks via ConflictError |
| BR-O-06 admin-managed, no redeploy | no hardcoded unit names anywhere |
| BR-C-01/02 admin-managed, immediately selectable | no enum, no caching |
| BR-C-03 name unique per type | DB index |
| BR-C-04 rename propagates | by id, no cascade — test asserts nothing is deleted/recreated |
| BR-C-05 deactivate keeps references readable | `setActive(false)`; test asserts the count is unchanged |
| BR-C-06 referenced entry cannot be deleted | `remove()` returns the count; unreferenced entries DO delete |
| BR-C-07 reactivation | `reactivate()` |
| BR-C-08 no team-type vocabulary | one generic component; "department"/"team" only |
| BR-C-09 `attributes` unused | absent from every mapper and component |

**Correction to a Step 4 claim**: the repository summary said ReferenceDataRepository has "no delete method on purpose". That was wrong — BR-C-06 refuses deletion only of a REFERENCED entry, which means unreferenced entries must be deletable. `delete()` added to both `ReferenceDataRepository` and `OrgUnitRepository`, guarded by a reference check in the component with the foreign keys as backstop.

### Step 8 — Business Logic: Member and Project ✅
- [x] `C-01 MemberComponent` — CRUD, conditional off-roll contract fields, skills, deactivate with auto-end cascade reporting the count (US-MEM-01…05, US-MEM-07)
- [x] `C-02 ProjectComponent` — CRUD, two-phase close (preview then confirm), staffing view grouped by member with exact subtotals (US-PRJ-01…05)
- [x] **No rate, contract value, or PO field** (BR-M-09) — enforced by ABSENCE, with a test asserting no such key appears in the serialised member
- [x] Rules BR-M-01…18, BR-P-01…11
- [x] Tests: `member-component.test.ts` (28), `project-component.test.ts` (24)

Notable decisions: BR-M-10 retains contract data on OFF_ROLL→ON_ROLL conversion and does NOT re-validate it on unrelated edits (an old contract must not block a name change); the deactivation cascade runs BEFORE the status change so a cascade failure leaves the member ACTIVE and retryable (tested); an UNCHANGED reference is not re-checked for active status, so deactivating a role does not make every member holding it un-editable.

### Step 9 — Business Logic: Assignment ✅
- [x] `C-03 AssignmentComponent` — create, update, end early, auto-end; **history revision written in the same transaction** (BR-A-16, BR-A-17)
- [x] Multiple concurrent assignments per member-project permitted (BR-A-06, Q4:B)
- [x] Date and contract-window conflict detection as WARNINGS that do not block (BR-A-13, BR-A-14)
- [x] **As-of reconstruction from `AssignmentHistory`** — Path B, not current rows (BR-A-22)
- [x] Stories US-ASN-01, 02, 03, 06, 07
- [x] `lockMemberForUpdate` now actually composed inside the create/update transactions (BR-A-24)
- [x] Tests: `assignment-component.test.ts` (27, real PostgreSQL — the invariant is transactional and a fake would let a broken implementation pass)

Notable: `savedAsOverride` is derived from the DETECTION result, never from the caller's flag — a test asserts that passing `override: true` on a non-over-allocated assignment does NOT set the flag, because BR-A-12 keeps it visible forever. Member and project are immutable on an assignment (moving one would rewrite two members' capacity history in a single step with no record).

### Step 10 — Business Logic: Allocation ✅
Step 9 could not be written without over-allocation detection, so the segmentation core landed with Step 9 rather than being stubbed — stubbing the riskiest algorithm to satisfy a step boundary would have been worse. The view functions completed here.
- [x] `C-04 AllocationComponent` — **pure function, no I/O, no state** (U1-NFR-M-03), with purity and determinism asserted by test
- [x] `segmentAllocation` — boundary collection at `end + 1 day`, segment build, exact integer-tenths summation, merge of equivalent adjacent segments
- [x] `detectOverAllocation` — returns **each offending sub-period**, excludes own row when editing (BR-A-08, BR-A-15)
- [x] `availability`, `minimumAvailableTenths` (minimum, not average — a member free in January has no spare February capacity)
- [x] `totalOnDate` — routed through the same segmentation path, so a single date can never be answered by different arithmetic than the range containing it
- [x] `currentAllocationView` — one row per member INCLUDING members with no assignments (omitting them would hide exactly who a manager is looking for)
- [x] `unallocatedMembers` — unallocated for the WHOLE range, not merely somewhere in it
- [x] `overAllocatedMembers` — one finding per offending sub-period per member, not one per member
- [x] `availabilityFor` — reports min AND max, which answer different questions ("can they take a full-range assignment?" vs "is there a window worth negotiating?")
- [x] `memberTimeline` — `isGap` distinguishes "nothing booked" from "partially booked"
- [x] All view methods take PRE-FETCHED assignments and group them in memory, preserving purity and the one-batched-query contract
- [x] `CAPACITY_TENTHS = 1000` expressed **once** (AS-01)
- [x] Tests: `allocation-component.test.ts` (54) — inclusive boundary, adjacent vs one-day overlap, the exact 100.0% threshold, per-sub-period identification, plus all view functions

**BR-A-24 gap CLOSED, and the first attempt was a false positive worth recording.** The obvious test — two `create` calls via `Promise.all`, assert only one succeeds — **passed even with `lockMemberForUpdate` neutered**, because the two calls never interleave at the critical point (each runs several pre-transaction validation queries, and the first transaction commits before the second opens). It was deleted rather than kept as false assurance. The replacement forces the interleaving explicitly: transaction A takes the lock and holds it while B attempts it, then asserts B saw A's committed row. Verified by neutering the lock and observing the failure (`Received length: 0`), then restoring it and observing the pass.

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

### Step 11 — Business Logic: Identity, Session, Authorization Stand-In ✅
- [x] `C-07 IdentityComponent` — Argon2id hashing, credential verification with a **real dummy hash comparison** on unknown username, member linking (US-ENB-02, BR-AU-01…07, BR-AU-13…15)
- [x] `C-08 SessionComponent` — establish, resolve, sliding 30-min expiry (configurable), terminate; **SHA-256 token hash stored, never the token** (BR-AU-08…12)
- [x] `authorization-standin/` — its own named directory, permissive per `business-logic-model.md` §11, with the deletion procedure recorded in the file header
- [x] Stories US-ACC-01, 02, 03, US-ENB-02, US-ENB-03
- [x] Tests: `identity-component.test.ts` (27, real Argon2id), `session-component.test.ts` (33), `authorization-standin.test.ts` (12)

**Two decisions beyond the specification, both closing holes it left open**

1. **BR-AU-07 is checked AFTER the password**, not before. Reporting "this account is inactive" on a wrong password would confirm the username exists to anyone guessing — the exact oracle BR-AU-05's dummy comparison exists to close. Tested: a wrong password against an inactive account returns the plain rejection, not the inactive message.
2. **`canRead` refuses an UNLINKED TEAM_MEMBER.** §11 specifies `canRead → return true`, which assumes a linked team member; with `orgUnitIds: 'ALL'` and `restrictToMemberId: null`, an unlinked one would read EVERY member. The stand-in fails closed instead. Unit 2's real component must keep refusing it.

**Hash choice, recorded because it looks inconsistent at a glance**: Argon2id for passwords, SHA-256 for session tokens. A session token is 256 bits of randomness with no low-entropy guess space, so there is nothing to slow an attacker down for; per-request Argon2id would add ~40 ms of CPU to every authenticated call for no security gain. Unsalted is safe for the same reason — the rainbow-table argument that makes unsalted password hashing indefensible does not apply to a random 256-bit value.

**Session resolution re-reads the identity on every request** rather than caching role in the session row, so a role change or deactivation takes effect on the next request instead of whenever the session expires — otherwise a stale ADMIN role is a privilege-escalation window up to the full idle timeout wide. Resolution also TERMINATES the session when the account is found deactivated, so it cannot simply be retried.

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
