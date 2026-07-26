# AI-DLC State Tracking

## Project Information
- **Project Name**: chaos-manager (C.H.A.O.S — Centralized Hub for Aligning Organizational Squads)
- **Project Type**: Greenfield
- **Start Date**: 2026-07-25T08:32:00Z
- **Current Stage**: CONSTRUCTION - **Build and Test COMPLETE (590 tests passing, build verified from a clean install). Awaiting approval, then the OPERATIONS phase placeholder. Both units complete; 43 of 43 stories.** Infrastructure Design APPROVED 2026-07-26T15:50:00Z. Functional Design APPROVED 2026-07-26T14:40:00Z (4 artifacts; R2 obligations 4 and 5 discharged). Unit 1 `core-domain` COMPLETE (all 26 code generation steps verified).

## Workspace State
- **Existing Code**: No at detection; a complete application now exists under `backend/`, `frontend/` and `docker/`
- **Programming Languages**: None found at detection; target stack Node.js/TypeScript + React
- **Build System**: None found
- **Project Structure**: Empty (documentation only at detection time)
- **Reverse Engineering Needed**: No
- **Workspace Root**: /home/raseel/code/github/screwgoth/chaos-manager

## Code Location Rules
- **Application Code**: Workspace root (NEVER in aidlc-docs/)
- **Documentation**: aidlc-docs/ only
- **Structure patterns**: See code-generation.md Critical Rules

## Extension Configuration
| Extension | Enabled | Decided At |
|---|---|---|
| Security Baseline | No | Requirements Analysis |
| Resiliency Baseline | No | Requirements Analysis |
| Property-Based Testing | No | Requirements Analysis |

**Note**: All three extensions disabled per user opt-in, confirmed at clarification Question 6 (A).
Full rule files NOT loaded — context saved. Per requirements NFR-SE-02, password hashing (FR-AU-02)
and server-side authorization enforcement (FR-R-08) are retained as mandatory *functional*
requirements independent of the disabled security extension.

## Execution Plan Summary
- **Total Stages**: 14 (4 completed, 2 skipped, 7 to execute, 1 placeholder)
- **Stages to Execute**: Application Design, Units Generation (max 3 units), Functional Design (per unit), NFR Requirements (per unit), Infrastructure Design (per unit), Code Generation (per unit), Build and Test
- **Stages to Skip**: Reverse Engineering — greenfield project, no existing code to analyze; NFR Design — folded into Functional Design per user direction (R2)
- **User Revisions**: R1 — Units Generation constrained to target 2 units, hard cap 3. R2 — NFR Design skipped, six obligations folded into Functional Design.
- **Estimated stage executions**: ≈11 at 2 units, ≈15 at 3 units (revised down from ≈23)
- **Risk Level**: Medium — temporal allocation logic is load-bearing and has no automated test suite (NFR-Q-01); RBAC lands in build Wave 5; adoption risk exceeds technical risk
- **Plan Document**: `aidlc-docs/inception/plans/execution-plan.md`

## Stage Progress

### 🔵 INCEPTION PHASE
- [x] Workspace Detection — COMPLETED 2026-07-25T08:33:00Z
- [x] Reverse Engineering — SKIPPED (greenfield project, no existing code)
- [x] Requirements Analysis — APPROVED 2026-07-25T09:20:00Z
- [x] User Stories — APPROVED 2026-07-25T10:00:00Z (43 stories, 5 personas)
- [x] Workflow Planning — APPROVED 2026-07-25T10:15:00Z with revisions R1 and R2
- [x] Application Design — APPROVED 2026-07-25T10:55:00Z (10 components, 9 services, 8 frontend folders, 2-unit seam)
- [x] Units Generation — APPROVED 2026-07-25T11:25:00Z (2 units, 43 stories mapped)

**🔵 INCEPTION PHASE COMPLETE** — all stages approved or deliberately skipped.

## Units of Work
| # | Unit name | Stories | Must | Should | Slice 1 | Demonstrable alone |
|---|---|---|---|---|---|---|
| 1 | `core-domain` | **32** | 29 | **3** | All 6 | Yes |
| 2 | `supporting-platform` | **11** | 6 | **5** | 0 | No — by design |

- **Deployment**: single deployable monolith; units are logical modules
- **Code layout**: `backend/src/{unit-name}/`, `backend/tests/{unit-name}/`, `frontend/src/{unit-name}/`, plus a `shared/` module in each tree
- **Build order**: sequential — `core-domain` then `supporting-platform`
- **Cross-unit dependencies**: X-1 (Unit 1 uses a permissive authorization stand-in that Unit 2 replaces), X-2 (Unit 2 import consumes Unit 1 interfaces), X-3 (one shared database schema)
- **⚠️ X-1 revisit trigger**: org-scope visibility is NOT enforced while `core-domain` is the only completed unit. Acceptable only under the single-track, no-external-users assumption (plan Q7:A). If pilot users get access before `supporting-platform` completes, switch to a restrictive stand-in or pull C-09 Authorization into Unit 1.

### 🟢 CONSTRUCTION PHASE — Unit 1: `core-domain`
- [x] Functional Design — APPROVED 2026-07-25T11:45:00Z (4 docs; R2 obligations 1, 2, 3, 6 discharged; OD-02 closed, FR-C-05 discharged)
- [x] NFR Requirements — APPROVED 2026-07-25T12:12:00Z (2 docs; OD-01 and OD-03 CLOSED)
- [ ] NFR Design — SKIPPED (R2)
- [x] Infrastructure Design — APPROVED 2026-07-25T12:35:00Z (3 docs incl. shared-infrastructure.md)
- [ ] Code Generation — Part 1 plan APPROVED 2026-07-25T12:45:00Z; Part 2 COMPLETE, all 26 steps verified on branch `aidlc/construction-core-domain`

**🟢 UNIT 1 `core-domain` COMPLETE** — 133 files, 24,220 lines, 450 tests, 50 endpoints, **32 stories** (corrected from 30 at Unit 2 Functional Design, Q15:A — US-ASN-04 and US-VIS-05 were built here).

### 🟢 CONSTRUCTION PHASE — Unit 2: `supporting-platform`
- [x] Functional Design — **APPROVED 2026-07-26T14:40:00Z** (+ R2 folded-in obligations 4, 5 both discharged). Branch `aidlc/construction-supporting-platform`. 34/34 plan steps ticked. 4 artifacts at `aidlc-docs/construction/supporting-platform/functional-design/`.
  - **Decisions**: Q1:A code-constant permission matrix · Q2→**CQ2:B** Resource Manager root-wide only when attached to a root org unit (FR-R-07 **not** amended) · Q3:C assignment in scope via member **OR** project · Q4→**superseded by CQ1:A** (no redaction; full visibility) · Q5:A fail closed on NULL home org unit · Q6:A no assignment-request mechanism · Q7:A CSV only · Q8:A external_ref else email · Q9:A one transaction for all valid rows · Q10:A response-only report · Q11:A never create reference data · Q12:A Admin-only import · Q13:A 2,000 rows / 5 MB synchronous · Q14:A three dedicated pages · Q15:A correct the story counts
  - **Two contradictions were detected and resolved before design, not absorbed**: Q3:C vs Q4:A were mutually exclusive (Q4:A's redaction would have been unreachable code); Q2:C conflicted with approved Must requirement FR-R-07. See `supporting-platform-functional-design-clarification-questions.md`.
  - ✅ **Scope reconciliation applied**: Unit 1 incidentally completed US-ASN-04 and US-VIS-05. Story counts corrected 30→32 (Unit 1) and 13→11 (Unit 2) in `unit-of-work.md`, `aidlc-state.md` and Unit 1's `code-generation-summary.md`. US-VIS-06, US-VIS-07, US-MEM-06 need **frontend only**.
  - ✅ **Unit 2 owns NO database entity and needs NO migration** (Q1:A + Q10:A remove both candidates). `001_initial_schema.ts` is the final Phase 1 schema.
  - ⚠️ **FR-I-01 recorded as PARTIALLY SATISFIED** — CSV yes, Excel deferred (Q7:A). Annotated in `requirements.md`. The first Must requirement in the project not fully delivered; recorded as a visible gap rather than counted as complete.
  - ⚠️ **No import audit trail** (Q10:A) — a 2,000-row bulk write leaves only log counts and failure reasons, never row contents. Accepted Phase 2 revisit.
- [x] NFR Requirements — **APPROVED 2026-07-26T15:20:00Z**. 10/10 plan steps. 2 artifacts at `aidlc-docs/construction/supporting-platform/nfr-requirements/`.
  - All 8 answers chosen by **AI recommendation at the user's instruction** and marked as such: N-Q1:A per-request scope query (no caching — a scope cached at sign-in would let a moved user keep old visibility until sign-out) · N-Q2:A measure before indexing · N-Q3:A 30 s for 2,000 rows · N-Q4:A per-route body limit · N-Q5:A log refusals at warn, never the target's identity · N-Q6:C all 80 matrix cells **plus** an exhaustiveness check · N-Q7:A maintained CSV library · N-Q8:A no import concurrency limit
  - **Stack**: 2 new backend dependencies (`@fastify/multipart`, `csv-parse`), **0** frontend, **0** migrations, **0** inherited choices revisited. Seven dependencies declined against recorded decisions, including any authorization policy engine.
  - ⚠️ **Three performance claims recorded as UNVERIFIED** pending Code Generation: the 2,000-row import 30 s budget (its whole cost is the write phase); whether BR-R-12's added `OR` needs an index (`EXPLAIN` decides); and **Unit 1's endpoint timings do not transfer** — they were measured against a permissive filter that added no WHERE clause, so they must be re-run for a scoped role.
- [ ] NFR Design — SKIPPED (R2)
- [x] Infrastructure Design — **APPROVED 2026-07-26T15:50:00Z**. 10/10 plan steps. 2 artifacts + a prediction audit in `shared-infrastructure.md` §8.
  - Answers I-Q1:A, I-Q2:A, I-Q3:A — **all by AI recommendation**, continuing under the user's instruction. All three are configuration choices, not structural.
  - **Delta is genuinely small**: no new container, service, volume, port, network or migration. Six configuration changes total; Unit 2's components are code inside the existing `app` container.
  - ✅ **Two PRE-EXISTING deployment defects found and fixed**: (1) Docker's default `json-file` driver has no size cap and no `logging:` options were ever set, so the deployment has been growing container logs WITHOUT BOUND since Unit 1 shipped — now rotated at 10m x 3 on all three services; (2) the Caddyfile had no `request_body` limit, so an arbitrarily large POST would stream into Node before refusal — now capped at 6 MB, deliberately ABOVE the app's 5 MB so the app's actionable error is what users see at the boundary.
  - ⚠️ **`shared-infrastructure.md` §6 rule 5 asserted the Docker log was "rotated"** — it was not. An approved artifact stated a safety property the deployment did not have. Now true.
  - ⚠️ **Unit 2's deployment CHANGES WHAT EXISTING USERS CAN SEE.** A `TEAM_LEAD` or child-unit `RESOURCE_MANAGER` loses visibility they currently have (intended), and an account with a NULL `home_org_unit_id` will see NOTHING (correct fail-closed behaviour that will look like a broken account). `deployment-architecture.md` §3.2 supplies the pre-deployment SQL to find those accounts BEFORE deploying.
  - ⚠️ Enforcement must be smoke-tested with a **scoped** account. Signing in as Admin proves nothing — Admin was unrestricted before and after.
  - **Prediction audit**: of Unit 1's 11 predictions about Unit 2, 8 held and **3 were wrong** — Unit 2 needs ZERO migrations (predicted "one or more"), there is no `RolePermission` table at all, and import peak memory is +40–60 MB not "kilobytes" (Unit 1 assumed 200 rows; Q13:A capped at 2,000).
- [ ] Code Generation — **Part 1 APPROVED 2026-07-26T15:55:00Z. Part 2 COMPLETE: 21/21 steps verified. AWAITING APPROVAL.** 21 steps at `aidlc-docs/construction/plans/supporting-platform-code-generation-plan.md`. No code generated until the plan is approved.
  - Sequence: 1 dependencies · **2–6 authorization, the X-1 resolution** · 7–8 account linkage · 9–12 import · 13–16 frontend · 17–18 config and deployment · **19 measure the three UNVERIFIED performance claims** · 20–21 docs and full verification.
  - **Step 4 is the X-1 switchover**: repoint the composition root (one line), DELETE `core-domain/authorization-standin/` entirely, then `git diff --stat` over `core-domain/` must show only `services/index.ts`. Step 5's `assignment-repository.ts` change (BR-R-12) is the one pre-authorised exception.
  - **Step 6 carries the unit's key verification rule**: every test proving the X-1 fix must be CONFIRMED TO FAIL when Step 4 is reverted. Tests that pass against the stand-in are regression tests, not proof — the method adopted after Unit 1's BR-A-24 false positive.
  - ✅ **Steps 1–6 COMPLETE AND VERIFIED 2026-07-26** — the unit's centre of gravity. Backend suite **451 passed / 18 suites, 0 failures** against PostgreSQL 16; `tsc --noEmit` clean.
    - Step 1: `@fastify/multipart`, `csv-parse` added to dependencies. Kysely 0.27.5's 3 high-severity advisories verified **NOT reachable** (no `Kysely<any>`/`@ts-ignore`/`as any`, no `JSONPathBuilder.key()/.at()` calls, and the `sql.lit` advisory is MySQL-specific while the 4 `eb.lit()` sites pass booleans under `PostgresDialect`). Recorded for Build and Test rather than pulling a breaking kysely@0.29.4 upgrade mid-plan.
    - Steps 2–3: `permission-matrix.ts` (40 cells / 80 decisions, typed-exhaustive plus a runtime check that fails at STARTUP) and `authorization-component.ts`; 66 unit tests. The exhaustiveness check is verified by DELETING a cell.
    - Step 4: **X-1 RESOLVED.** Composition root repointed; `core-domain/authorization-standin/` and its test DELETED. `git diff --stat` over `core-domain/` shows **only `services/index.ts`** — verification PASSES.
    - Step 5: BR-R-12 member-OR-project scope; the contradicting comment rewritten.
    - Step 6: 17 enforcement tests. **NEUTERING VERIFIED** — restoring `orgUnitIds: 'ALL'` turns **16 of 83** tests RED, so they are not vacuous.
  - ⚠️ **DEFECT U1-D01 FOUND AND RESOLVED** (`code/DEFECT-U1-D01-authorization-interface.md`): `IAuthorizationComponent.resolveScope` is SYNCHRONOUS but BR-R-08/09 need a database read. Measured blast radius: 90 call sites across 7 service files if made async. **User chose Option B** — `orgUnitIds` carries scope ROOTS and the subtree expands inside SQL (`orgScopeMatches`, parameterized). Interface untouched, 0 service call sites changed, 0 extra queries. **The X-1 stand-in pattern was only PARTIALLY successful**: a permissive stand-in exercises an interface's shape, never its requirements. A restrictive stand-in (Q6:B) would have hit this during Unit 1.
  - **3 defects found in my own Unit 2 code, all by tooling**: `tsc` caught `targetInScope` reading `restrictToMemberId` (which lives on `ScopeFilter`, not `AccessScope`); Unit 1's own tests caught `targetInScope` returning 403 where the design requires 200+[] / 404 (BR-R-16); and the same method wrongly DENYING a Team Lead access to a child unit, because scope roots exclude children.
  - ✅ **ALL 21 STEPS COMPLETE AND VERIFIED 2026-07-26.** Backend **501 passed / 21 suites**, frontend **89 passed / 8 suites**, both `tsc --noEmit` clean, both builds succeed, `docker build` succeeds (both new deps install from the manifest alone), stand-in absent from the built **image**, `shared/types/authorization.ts` **unmodified**, `001_initial_schema.ts` still the only migration, only 80/443 published. **590 tests total.**
  - ✅ **All three UNVERIFIED performance claims MEASURED**: 2,000-row import **6.8 s** (budget 30 s) · 200-row **0.62 s** · BR-R-12 `EXPLAIN` **2.1 ms** over 1,500 assignments with the member side on `member_org_status_idx`, so **N-Q2:A discharged: NO index warranted** · scoped member list **12.1 ms** (budget 500 ms) · `resolveScope` **0.18 µs**. The first `EXPLAIN` ran against an EMPTY table and was discarded as meaningless.
  - ✅ **9 defects found, all by tooling.** Includes U1-D01; two over-reaching authorization checks caught by Unit 1's own tests; my own 40-vs-80 cell arithmetic error; a logging test whose absence-assertions passed vacuously against an empty capture; an atomicity test that could pass without exercising rollback; and Unit 1's expiring-contracts endpoint being inadequate for the story it appeared to serve.
  - ✅ **2 PRE-EXISTING deployment defects fixed**: unbounded container logs (and `shared-infrastructure.md` had already asserted they were rotated) and the missing Caddy request-body limit.
  - **6 new endpoints; 56 method+path total.** 11 stories complete → **43 of 43 across both units**.
  - ⚠️ Still open: FR-I-01 partial (CSV only) · no import audit trail · FR-R-04 request flow deferred · new root org unit needs a restart · **no screen visually verified** (largest risk) · React `act` warnings · no CI gate.
  - Centre of gravity is Steps 2–6: import is more code but lower risk (failures surface in a report); authorization is less code and higher risk (a mistake is invisible until someone sees data they should not).

### 🟢 CONSTRUCTION PHASE — after all units
- [ ] Build and Test — **COMPLETE 2026-07-26, AWAITING APPROVAL.** 6 instruction files at `aidlc-docs/construction/build-and-test/`.
  - **Build ✅ from a CLEAN install** (`rm -rf node_modules` then `npm ci` in both workspaces, so a missing declaration would have failed). backend build 5.5 s · frontend build 10.3 s (308 kB JS / **90 kB gzipped**) · `docker build` succeeds · no test files in `dist` · image runs as uid 1000 · stand-in absent from the image.
  - **Tests ✅ 590 passed, 0 failures, deterministic over 3 runs each**: backend **501 / 21 suites** with PostgreSQL 16 (37 s); backend **343 passed / 158 skipped** without a database (suites SKIP, they do not silently pass); frontend **89 / 8 suites**.
  - **Performance MEASURED**: 2,000-row import **6.8 s** (target 30 s) · 200-row **0.62 s** · scoped member list **12.1 ms** (target 500 ms) · `resolveScope` **0.18 µs** · BR-R-12 `EXPLAIN` **2.1 ms** over 1,500 rows → **no index needed, no migration**.
  - ⚠️ **SECURITY ACTION TAKEN**: `@fastify/static@8.3.0` carried 4 advisories, **3 of them authorization/route-guard bypass**. **This was MISSED at code generation Step 1** — only `kysely` was examined, because `npm audit` output was read from the tail. Upgraded to **10.1.2** (semver major); verified `tsc` clean, 501/501 pass, and the SPA still serves correctly **from a running container** (the suite never sets `STATIC_DIR`, so it does not cover that path). Traversal probes leak no content. Production advisories **2 → 1**.
  - **Accepted with reachability verified**: `kysely@0.27.5`'s 3 high advisories are unreachable (no `Kysely<any>`/`@ts-ignore`/`as any`, no `JSONPathBuilder` calls, `sql.lit` advisory is MySQL-specific and all 4 `eb.lit()` sites pass booleans). Breaking upgrade **carried to Operations** as its own deliberate change.
  - **Contract tests N/A with a reason** (one deployable; `tsc` already gates the inter-unit contract). **E2E only partial** — ⚠️ **no browser has rendered any screen; the largest open risk in the project.**
  - **New finding, low severity**: a malformed path returns 500 rather than 404. Body is the generic envelope — **no leak** (verified by reading it) — but it is the same class Unit 1 fixed for UUIDs and lets a prober generate error-level log noise.
  - **10 items carried into Operations**, ranked, in `build-and-test-summary.md`.

### 🟡 OPERATIONS PHASE
- [ ] Operations — PLACEHOLDER

## ⚠️ OPEN GAP FOUND 2026-07-26 — no way to create a user account

**There is no account-creation endpoint, admin screen or CLI.** The only account that can exist is the
first-run bootstrap admin. Verified: `createAccount` is called from exactly one place (`server.ts:134`);
the only account routes are `GET /api/accounts` and `POST`/`DELETE /api/accounts/:id/link`; the frontend
has no create-account UI.

**This is a REQUIREMENTS gap, not an implementation gap.** FR-AU-01…05 cover authentication, hashing,
the replaceable boundary, sessions and *linking* — none covers provisioning. US-ADM-01/02/03 cover
reference data and org units only. Nothing was missed in implementation; no requirement existed.

**Consequence**: Unit 2's five-role matrix, org-scope enforcement and account-link screen are
**unreachable in a real deployment**, because a second user cannot be created. It slipped through
Inception, both units' design and NFR stages, both Code Generation stages, and my own 22-row
enforcement enumeration — which lists `USER_ACCOUNT` read/write for ADMIN and so implies a management
path that does not exist.

**Fix is small**: `UserAccountRepository` already has `create`, `updateRoleAndScope`,
`updatePasswordHash` and `setActive`, and the matrix already grants ADMIN write on `USER_ACCOUNT`. Only
a route module and an admin screen are missing. Recommended for Phase 1.1 / Operations.

## Open Decisions Carried Forward
| ID | Decision | Assigned To |
|---|---|---|
| ~~OD-01~~ | ~~Database technology~~ — **CLOSED 2026-07-25: PostgreSQL 16+** | Closed at core-domain NFR Requirements |
| ~~OD-02~~ | ~~Allocation history modeling~~ — **CLOSED 2026-07-25**: append-only `AssignmentHistory` snapshot table + mutate-in-place, yielding a bi-temporal model. As-of-date queries resolve against history, not current rows. | Closed at core-domain Functional Design |
| ~~OD-03~~ | ~~Node.js API framework and React tooling~~ — **CLOSED 2026-07-25: Fastify + Vite/React SPA** (Next.js selected then reverted at CQ1:A for conflicting with the single-Node-process and Fastify decisions) | Closed at core-domain NFR Requirements |
| ~~OD-04~~ | ~~Member capacity modeling~~ — **CLOSED 2026-07-25**: uniform 100%, part-time not modeled | Closed at User Stories planning |
| ~~FR-C-05~~ | ~~Phase 2 custom fields extension point~~ — **DISCHARGED 2026-07-25**: reserved schema-less `attributes` column on Member and Project, unused in Phase 1 (BR-C-09) | Closed at core-domain Functional Design |

**No open decisions remain.** All four (OD-01…OD-04) plus FR-C-05 are closed.

## Technology Stack (applies to both units)
PostgreSQL 16+ · Kysely (query builder, hand-written allocation SQL) · Kysely migrator · Fastify ·
Vite + React SPA · TanStack Query v5 · date-fns (date-only UTC convention) · Zod · Tailwind (hand-built) ·
Jest · Node 22 LTS + npm · TypeScript `strict` + `noUncheckedIndexedAccess` · Docker Compose (app + PostgreSQL)

## Current Status
- **Lifecycle Phase**: 🟢 CONSTRUCTION
- **Current Unit**: Unit 1 of 2 — `core-domain`
- **Current Stage**: Code Generation — **COMPLETE**. All 26 steps executed and verified.
- **Completed for this unit**: Functional Design ✅ · NFR Requirements ✅ · Infrastructure Design ✅ · Code Generation Part 1 (plan) ✅ · Code Generation Part 2 (all 26 steps) ✅
- **Working branch**: `aidlc/construction-core-domain` (created from `aidlc/inception-requirements`) — **pushed to origin 2026-07-26**, tracking `origin/aidlc/construction-core-domain`. `aidlc/inception-requirements` also pushed.
- **Code progress**: **ALL 26 STEPS COMPLETE AND VERIFIED.** Unit 1 `core-domain` Code Generation is finished: backend, React SPA, Docker artifacts, documentation and final verification. Backend complete end to end; React SPA complete (shared foundations, auth, members, projects, assignments, views, admin). Verified as a running full stack: the backend serves the built SPA, bootstrap admin login works, and client routes fall back to index.html while /api/* still returns the JSON envelope. Shared foundations, schema + migration, repository layer, and all nine business-logic components: C-01 Member, C-02 Project, C-03 Assignment, C-04 Allocation, C-05 OrgUnit, C-06 ReferenceData, C-07 Identity, C-08 Session, plus the permissive C-09 authorization stand-in.
- **Next step**: **Unit 1 is complete.** Proceed to Unit 2 `supporting-platform`: Functional Design → NFR Requirements → Infrastructure Design → Code Generation. Then Build and Test (once, after all units).
- **Verification (all executed, not asserted)**: both workspaces `tsc --noEmit` clean · both `npm run build` succeed · backend **387 passed / 17 suites** with PostgreSQL 16 (296 + 91 skipped without one) · frontend **63 passed / 5 suites** · **450 tests, 0 failures** · `docker build` succeeds, 310 MB image running as uid 1000 with no tsc/vite/jest present · container verified end to end (health 200, SPA served, admin login succeeded) · compose publishes only 80/443 · seed idempotent across two starts · no application code under `aidlc-docs/` · no secret committed · `npm run build` produces `dist/src/server.js` · server smoke-tested live
- **Test command**: use `npm test`, NOT `npx jest` — Jest needs `--experimental-vm-modules` for @fastify/cookie's dynamic import
- **Test database**: throwaway container on port 55432; run instructions in `aidlc-docs/construction/core-domain/code/repository-layer-summary.md` §6
- **Next Stage**: finish Code Generation for `core-domain`, then the full Construction loop for `supporting-platform`, then Build and Test (once, after all units)
- **Outstanding risk carried forward**: X-1 — the scope-enforcement MECHANISM is built and tested, but the permissive stand-in means org-scope policy is not yet applied; a Team Lead / Resource Manager still sees all org units. Acceptable only under the single-track, no-external-users assumption; the tests to prove enforcement already exist for when Unit 2 lands. BR-A-24 is now genuinely proven: a deterministic lock test forces two transactions to interleave and was confirmed to FAIL when the lock is removed. (The first attempt at this test passed with the lock neutered and was discarded as a false positive.)

## Artifact Index
| Artifact | Path |
|---|---|
| Audit log | `aidlc-docs/audit.md` |
| Requirements | `aidlc-docs/inception/requirements/requirements.md` |
| Requirements questions | `aidlc-docs/inception/requirements/requirement-verification-questions.md` |
| Requirements clarifications | `aidlc-docs/inception/requirements/requirements-clarification-questions.md` |
| User stories assessment | `aidlc-docs/inception/plans/user-stories-assessment.md` |
| Story generation plan | `aidlc-docs/inception/plans/story-generation-plan.md` |
| User stories | `aidlc-docs/inception/user-stories/stories.md` |
| Personas | `aidlc-docs/inception/user-stories/personas.md` |
| Execution plan | `aidlc-docs/inception/plans/execution-plan.md` |
| Application design plan | `aidlc-docs/inception/plans/application-design-plan.md` |
| Application design clarifications | `aidlc-docs/inception/plans/application-design-clarification-questions.md` |
| Application design (consolidated) | `aidlc-docs/inception/application-design/application-design.md` |
| Components | `aidlc-docs/inception/application-design/components.md` |
| Component methods | `aidlc-docs/inception/application-design/component-methods.md` |
| Services | `aidlc-docs/inception/application-design/services.md` |
| Component dependencies | `aidlc-docs/inception/application-design/component-dependency.md` |
| Unit of work plan | `aidlc-docs/inception/plans/unit-of-work-plan.md` |
| Units of work | `aidlc-docs/inception/application-design/unit-of-work.md` |
| Unit dependencies | `aidlc-docs/inception/application-design/unit-of-work-dependency.md` |
| Unit-to-story map | `aidlc-docs/inception/application-design/unit-of-work-story-map.md` |
| `core-domain` FD plan | `aidlc-docs/construction/plans/core-domain-functional-design-plan.md` |
| `core-domain` domain entities | `aidlc-docs/construction/core-domain/functional-design/domain-entities.md` |
| `core-domain` business logic | `aidlc-docs/construction/core-domain/functional-design/business-logic-model.md` |
| `core-domain` business rules | `aidlc-docs/construction/core-domain/functional-design/business-rules.md` |
| `core-domain` frontend components | `aidlc-docs/construction/core-domain/functional-design/frontend-components.md` |
| `core-domain` NFR requirements plan | `aidlc-docs/construction/plans/core-domain-nfr-requirements-plan.md` |
| `core-domain` NFR clarifications | `aidlc-docs/construction/plans/core-domain-nfr-requirements-clarification-questions.md` |
| `core-domain` NFR requirements | `aidlc-docs/construction/core-domain/nfr-requirements/nfr-requirements.md` |
| `core-domain` tech stack decisions | `aidlc-docs/construction/core-domain/nfr-requirements/tech-stack-decisions.md` |
| `core-domain` infra design plan | `aidlc-docs/construction/plans/core-domain-infrastructure-design-plan.md` |
| `core-domain` infrastructure design | `aidlc-docs/construction/core-domain/infrastructure-design/infrastructure-design.md` |
| `core-domain` deployment architecture | `aidlc-docs/construction/core-domain/infrastructure-design/deployment-architecture.md` |
| Shared infrastructure (both units) | `aidlc-docs/construction/shared-infrastructure.md` |
| `core-domain` code generation plan | `aidlc-docs/construction/plans/core-domain-code-generation-plan.md` |
