# AI-DLC State Tracking

## Project Information
- **Project Name**: chaos-manager (C.H.A.O.S — Centralized Hub for Aligning Organizational Squads)
- **Project Type**: Greenfield
- **Start Date**: 2026-07-25T08:32:00Z
- **Current Stage**: CONSTRUCTION - Unit 2 `supporting-platform` Functional Design **COMPLETE, awaiting user approval** (4 artifacts generated; 15 questions + 2 clarifications answered; R2 obligations 4 and 5 discharged). Unit 1 `core-domain` COMPLETE (all 26 code generation steps verified).

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

**🟢 UNIT 1 `core-domain` COMPLETE** — 133 files, 24,220 lines, 450 tests, 50 endpoints, 30 stories.

### 🟢 CONSTRUCTION PHASE — Unit 2: `supporting-platform`
- [ ] Functional Design — **ARTIFACTS COMPLETE 2026-07-26, AWAITING APPROVAL** (+ R2 folded-in obligations 4, 5 both discharged). Branch `aidlc/construction-supporting-platform`. 34/34 plan steps ticked. 4 artifacts at `aidlc-docs/construction/supporting-platform/functional-design/`.
  - **Decisions**: Q1:A code-constant permission matrix · Q2→**CQ2:B** Resource Manager root-wide only when attached to a root org unit (FR-R-07 **not** amended) · Q3:C assignment in scope via member **OR** project · Q4→**superseded by CQ1:A** (no redaction; full visibility) · Q5:A fail closed on NULL home org unit · Q6:A no assignment-request mechanism · Q7:A CSV only · Q8:A external_ref else email · Q9:A one transaction for all valid rows · Q10:A response-only report · Q11:A never create reference data · Q12:A Admin-only import · Q13:A 2,000 rows / 5 MB synchronous · Q14:A three dedicated pages · Q15:A correct the story counts
  - **Two contradictions were detected and resolved before design, not absorbed**: Q3:C vs Q4:A were mutually exclusive (Q4:A's redaction would have been unreachable code); Q2:C conflicted with approved Must requirement FR-R-07. See `supporting-platform-functional-design-clarification-questions.md`.
  - ✅ **Scope reconciliation applied**: Unit 1 incidentally completed US-ASN-04 and US-VIS-05. Story counts corrected 30→32 (Unit 1) and 13→11 (Unit 2) in `unit-of-work.md`, `aidlc-state.md` and Unit 1's `code-generation-summary.md`. US-VIS-06, US-VIS-07, US-MEM-06 need **frontend only**.
  - ✅ **Unit 2 owns NO database entity and needs NO migration** (Q1:A + Q10:A remove both candidates). `001_initial_schema.ts` is the final Phase 1 schema.
  - ⚠️ **FR-I-01 recorded as PARTIALLY SATISFIED** — CSV yes, Excel deferred (Q7:A). Annotated in `requirements.md`. The first Must requirement in the project not fully delivered; recorded as a visible gap rather than counted as complete.
  - ⚠️ **No import audit trail** (Q10:A) — a 2,000-row bulk write leaves only log counts and failure reasons, never row contents. Accepted Phase 2 revisit.
- [ ] NFR Requirements — EXECUTE
- [ ] NFR Design — SKIPPED (R2)
- [ ] Infrastructure Design — EXECUTE
- [ ] Code Generation — EXECUTE

### 🟢 CONSTRUCTION PHASE — after all units
- [ ] Build and Test — EXECUTE (ALWAYS)

### 🟡 OPERATIONS PHASE
- [ ] Operations — PLACEHOLDER

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
